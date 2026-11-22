// Coach Edge assistant against the local stack (mock provider of config.toml, streamed answer).
// No write without confirmation, confirmation rules, adjusted plan kept, quota, safety net,
// data minimization, 90-day purge.
import { execSync } from 'node:child_process';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assertMockProviders } from './guard.ts';

// Never a real (paid) provider: fails before any call
assertMockProviders();

type Status = { API_URL: string; PUBLISHABLE_KEY: string; SERVICE_ROLE_KEY: string };
const status = JSON.parse(execSync('supabase status -o json', { encoding: 'utf8' })) as Status;
const url = status.API_URL;
const admin = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PASSWORD = 'integration-test-password';
const BATCH_SECRET = 'local-dev-plans-batch-secret';
const created: string[] = [];

type User = { id: string; token: string; client: SupabaseClient };

async function user(label: string, premium: boolean): Promise<User> {
  const email = `${label}-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { timezone: 'Europe/Paris', display_name: 'Camille Secret' },
  });
  if (error || !data.user) throw error ?? new Error('createUser failed');
  created.push(data.user.id);
  const client = createClient(url, status.PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: session } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  const { error: onboardError } = await client.rpc('complete_onboarding', {
    p_goal_title: 'Signer 5 clients',
    p_program_id: 'PR1',
    p_consent_ai: true,
    p_consent_checkin: true,
    p_habits: [{ template_id: 'H02' }, { template_id: 'H03' }, { template_id: 'H04' }],
  });
  if (onboardError) throw onboardError;
  if (premium) {
    const { error: planError } = await client.rpc('dev_set_plan', { p_plan: 'premium' });
    if (planError) throw planError;
  }
  return { id: data.user.id, token: session.session?.access_token ?? '', client };
}

type SseEvent = { event: string; data: any };

async function chat(u: User, message: string, threadId?: string) {
  const res = await fetch(`${url}/functions/v1/assistant-chat`, {
    method: 'POST',
    headers: {
      apikey: status.PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${u.token}`,
    },
    body: JSON.stringify(threadId ? { thread_id: threadId, message } : { message }),
  });
  const text = await res.text();
  const events: SseEvent[] = [];
  if (res.headers.get('content-type')?.includes('text/event-stream')) {
    for (const block of text.split('\n\n')) {
      const name = /^event: (.+)$/m.exec(block)?.[1];
      const data = /^data: (.+)$/m.exec(block)?.[1];
      if (name && data) events.push({ event: name, data: JSON.parse(data) });
    }
  }
  return { status: res.status, events, body: events.length ? null : (JSON.parse(text) as any) };
}

const first = (events: SseEvent[], name: string) => events.find((e) => e.event === name)?.data;

async function generatePlan(u: User) {
  const res = await fetch(`${url}/functions/v1/generate-plan`, {
    method: 'POST',
    headers: {
      apikey: status.PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${u.token}`,
    },
    body: '{}',
  });
  return (await res.json()) as any;
}

async function todayItems(userId: string) {
  const { data, error } = await admin
    .from('daily_plans')
    .select('mode, user_adjusted_at, plan_items(exercise_id, origin)')
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return data;
}

let a: User;
let b: User;

beforeAll(async () => {
  a = await user('coach-a', true);
  b = await user('coach-b', true);
  await generatePlan(a);
});

afterAll(async () => {
  await admin.from('app_settings').update({ value: 15 }).eq('key', 'assistant_daily_messages');
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

describe('assistant access', () => {
  it('free accounts get 403, no JWT 401', async () => {
    const free = await user('coach-free', false);
    expect((await chat(free, 'Bonjour')).status).toBe(403);
    const res = await fetch(`${url}/functions/v1/assistant-chat`, {
      method: 'POST',
      headers: { apikey: status.PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: '{"message":"x"}',
    });
    expect(res.status).toBe(401);
  });
});

describe('actions: nothing is written without confirmation', () => {
  let actionId: string;
  let before: Awaited<ReturnType<typeof todayItems>>;

  it('"I only have 5 minutes": streamed answer and a pending action, plan unchanged', async () => {
    before = await todayItems(a.id);
    const res = await chat(a, "Je n'ai que 5 minutes aujourd'hui");
    expect(res.status).toBe(200);
    expect(first(res.events, 'thread')?.id).toBeTruthy();
    const action = first(res.events, 'action');
    expect(action).toMatchObject({
      type: 'adapt_today',
      status: 'pending',
      params: { minutes: 5 },
    });
    expect(res.events.filter((e) => e.event === 'text').length).toBeGreaterThan(1);
    expect(first(res.events, 'done')?.remaining).toBe(14);
    actionId = action.id;
    expect(await todayItems(a.id)).toEqual(before);
    const { count } = await admin
      .from('llm_calls')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', a.id)
      .eq('feature', 'assistant');
    expect(count).toBe(1);
  });

  it('another user cannot confirm it', async () => {
    const { error } = await b.client.rpc('confirm_assistant_action', { p_action_id: actionId });
    expect(error?.message).toBe('action_not_found');
    expect(await todayItems(a.id)).toEqual(before);
  });

  it('the owner confirms it: shorter version, kept by generate-plan', async () => {
    const { error } = await a.client.rpc('confirm_assistant_action', { p_action_id: actionId });
    expect(error).toBeNull();
    const after = await todayItems(a.id);
    expect(after.mode).toBe('minimal');
    expect(after.user_adjusted_at).not.toBeNull();
    const regenerated = await generatePlan(a);
    expect(regenerated.status).toBe('unchanged');
    expect(await todayItems(a.id)).toEqual(after);
  });

  it('an expired action is refused', async () => {
    const res = await chat(b, 'J’en suis à 2 clients');
    const action = first(res.events, 'action');
    expect(action?.type).toBe('update_goal_progress');
    await admin
      .from('assistant_actions')
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', action.id);
    const { error } = await b.client.rpc('confirm_assistant_action', { p_action_id: action.id });
    expect(error?.message).toBe('action_expired');
    const { data: goal } = await admin
      .from('goals')
      .select('current_value')
      .eq('user_id', b.id)
      .single();
    expect(goal?.current_value).toBeNull();
  });
});

describe('safety net and data minimization', () => {
  it('the 3114 help card fires on distress words, whatever the model answers', async () => {
    const res = await chat(b, "Je n'en peux plus, j'ai envie d'en finir");
    expect(res.events[1]).toMatchObject({ event: 'safety', data: { line: '3114' } });
    const { data } = await admin
      .from('assistant_messages')
      .select('distress')
      .eq('user_id', b.id)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    expect(data?.distress).toBe(true);
  });

  it('no reflection, note, name or e-mail in what is sent to the model', async () => {
    const u = await user('coach-min', true);
    await generatePlan(u);
    await u.client.rpc('upsert_checkin', {
      p_energy: 3,
      p_mood: 4,
      p_minutes_tomorrow: 30,
      p_reflection: 'REFLEXION_SECRETE de la journée',
      p_note: 'NOTE_SECRETE du soir',
    });
    await u.client
      .from('notes')
      .insert({ entity_type: 'exercise', entity_id: 'E001', body: 'CARNET_SECRET' });
    // The mock calls get_today on this message: the tool result is sent to the model too
    const res = await chat(u, "Que contient mon plan d'aujourd'hui ?");
    const debug = res.events.filter((e) => e.event === 'debug');
    expect(debug.length).toBe(2);
    const sent = JSON.stringify(debug);
    for (const secret of [
      'REFLEXION_SECRETE',
      'NOTE_SECRETE',
      'CARNET_SECRET',
      'Camille',
      '@example.test',
    ]) {
      expect(sent).not.toContain(secret);
    }
    expect(sent).toContain('tool_result');
  });
});

describe('tool calls', () => {
  it('at most 4 tool calls per user message, then a text answer', async () => {
    const res = await chat(a, 'BOUCLE_OUTILS : regarde encore mon plan');
    expect(res.status).toBe(200);
    expect(first(res.events, 'done')).toBeTruthy();
    const { data } = await admin
      .from('assistant_messages')
      .select('content, tool_calls')
      .eq('user_id', a.id)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    expect((data?.tool_calls as unknown[]).length).toBe(4);
    expect(data?.content.length).toBeGreaterThan(0);
  });
});

describe('lot 9 corrections (coach-v2)', () => {
  it('adapt_today when the day already fits: no action, "already compatible" for the model', async () => {
    const u = await user('coach-fits', true);
    await generatePlan(u);
    // PR1 day 1: a 10-minute exercise
    const res = await chat(u, "Je n'ai que 10 minutes aujourd'hui");
    expect(first(res.events, 'action')).toBeUndefined();
    expect(JSON.stringify(res.events.filter((e) => e.event === 'debug').at(-1))).toContain(
      'already_compatible',
    );
  });

  it('save_exercise_result without the required proof: no action, the model is asked for it', async () => {
    const u = await user('coach-proof', true);
    await generatePlan(u);
    // PR1 day 1: E001 needs a free-text proof
    const res = await chat(u, "Marque l'exercice du jour comme fait");
    expect(res.status).toBe(200);
    expect(first(res.events, 'action')).toBeUndefined();
    const debug = res.events.filter((e) => e.event === 'debug');
    expect(JSON.stringify(debug.at(-1))).toContain('proof_required');
    const { count } = await admin
      .from('assistant_actions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', u.id);
    expect(count).toBe(0);
    const answer = res.events.flatMap((e) => (e.event === 'text' ? [e.data.text] : [])).join('');
    expect(answer).toContain('Qu’as-tu fait');
  });

  it('search_catalog also returns habit templates, with the closest alternative', async () => {
    const res = await chat(b, 'Je veux méditer 2 heures chaque matin');
    const debug = res.events.filter((e) => e.event === 'debug');
    const sent = JSON.stringify(debug.at(-1));
    expect(sent).toContain('H27');
  });
});

describe('cost guards and flagged answers (coach-v4)', () => {
  it('a card announced without an action is logged (card_claimed_without_action)', async () => {
    const u = await user('coach-claim', true);
    const res = await chat(u, 'CARTE_FANTOME : valide pour moi');
    expect(first(res.events, 'action')).toBeUndefined();
    const { data } = await admin
      .from('llm_calls')
      .select('detail, cache_read_tokens, cache_write_tokens')
      .eq('user_id', u.id)
      .eq('feature', 'assistant')
      .single();
    expect(data).toMatchObject({ detail: 'card_claimed_without_action', cache_read_tokens: 0 });
  });

  it('monthly cost cap reached: 402 for the coach, the rest of the app keeps working', async () => {
    const u = await user('coach-cap', true);
    await admin.from('llm_calls').insert({
      user_id: u.id,
      feature: 'assistant',
      local_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date()),
      outcome: 'success',
      attempts: 1,
      cost_eur: 2,
    });
    const res = await chat(u, 'Bonjour');
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ error: 'monthly_cap_reached' });
    const { data: quota } = await u.client.rpc('assistant_quota');
    expect(quota).toMatchObject({ monthly_cap_reached: true });
    // The plan of the day is still generated
    const plan = await generatePlan(u);
    expect(plan.plan?.id).toBeTruthy();
  });
});

describe('quota and purge', () => {
  it('the daily quota (app_settings) answers 429', async () => {
    const { count: sent } = await admin
      .from('assistant_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', b.id)
      .eq('role', 'user');
    // One message left today, then refused
    const limit = (sent ?? 0) + 1;
    await admin.from('app_settings').update({ value: limit }).eq('key', 'assistant_daily_messages');
    expect((await chat(b, 'Encore une question')).status).toBe(200);
    const refused = await chat(b, 'Et une autre');
    expect(refused.status).toBe(429);
    expect(refused.body).toMatchObject({ error: 'quota_exceeded', limit });
    await admin.from('app_settings').update({ value: 15 }).eq('key', 'assistant_daily_messages');
  });

  it('conversations idle for more than 90 days are purged by the fallback generation', async () => {
    const { data: thread } = await admin
      .from('assistant_threads')
      .insert({
        user_id: a.id,
        title: 'Old',
        last_message_at: new Date(Date.now() - 91 * 86_400_000).toISOString(),
      })
      .select('id')
      .single();
    const res = await fetch(`${url}/functions/v1/generate-plans-batch`, {
      method: 'POST',
      headers: { 'x-batch-secret': BATCH_SECRET, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(200);
    const { count } = await admin
      .from('assistant_threads')
      .select('id', { count: 'exact', head: true })
      .eq('id', thread!.id);
    expect(count).toBe(0);
  });

  it('the export includes the conversations', async () => {
    const res = await fetch(`${url}/functions/v1/export-my-data`, {
      method: 'POST',
      headers: { apikey: status.PUBLISHABLE_KEY, Authorization: `Bearer ${b.token}` },
    });
    const body = (await res.json()) as any;
    expect(body.data.assistant_threads.length).toBeGreaterThan(0);
    expect(body.data.assistant_messages.length).toBeGreaterThan(0);
    expect(body.data.assistant_actions.length).toBeGreaterThan(0);
  });
});
