// Premium AI enrichment against the local stack (mock provider configured in config.toml,
// 1.5 s delay): the rules plan comes first, the AI enrichment follows in the background.
// Without consent or without premium, the AI is never called (no llm_calls row).
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
const created: string[] = [];

type User = { id: string; token: string; client: SupabaseClient };

async function onboardedUser(
  label: string,
  options: { premium: boolean; consentAi: boolean },
): Promise<User> {
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
    p_consent_ai: options.consentAi,
    p_habits: [{ template_id: 'H02' }, { template_id: 'H03' }, { template_id: 'H04' }],
  });
  if (onboardError) throw onboardError;
  if (options.premium) {
    // Prototype switch (allowed locally by app_settings.allow_plan_toggle)
    const { error: planError } = await client.rpc('dev_set_plan', { p_plan: 'premium' });
    if (planError) throw planError;
  }
  return { id: data.user.id, token: session.session?.access_token ?? '', client };
}

async function call(name: string, token: string, body: unknown = {}) {
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: status.PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function planOf(userId: string) {
  const { data, error } = await admin
    .from('daily_plans')
    .select('id, ai_status, why_today, plan_items(exercise_id, origin, personalized_instructions)')
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return data;
}

async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean, ms = 15_000) {
  const end = Date.now() + ms;
  let value = await read();
  while (!done(value) && Date.now() < end) {
    await sleep(300);
    value = await read();
  }
  return value;
}

async function llmCalls(userId: string) {
  const { data, error } = await admin.from('llm_calls').select('*').eq('user_id', userId);
  if (error) throw error;
  return data;
}

afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

describe('premium plan enrichment', () => {
  let premium: User;
  beforeAll(async () => {
    premium = await onboardedUser('ai-premium', { premium: true, consentAi: true });
  });

  it('returns the rules plan first, then enriches it in the background', async () => {
    const res = await call('generate-plan', premium.token);
    expect(res.status).toBe(200);
    const plan = res.body.plan;
    // Answered before the AI (mock delay 1.5 s): rules plan, pending enrichment
    expect(plan.ai_status).toBe('pending');
    expect(plan.plan_items.every((i: any) => i.personalized_instructions === null)).toBe(true);
    const rulesWhy = plan.why_today as string;
    const rulesExercise = plan.plan_items[0].exercise_id as string;
    expect(res.body.decision).toBeUndefined();

    const enriched = await waitFor(
      () => planOf(premium.id),
      (p) => p.ai_status !== 'pending',
    );
    expect(enriched.ai_status).toBe('enriched');
    // Program mode: same exercise, personalized instructions, AI "why today"
    expect(enriched.plan_items[0]?.exercise_id).toBe(rulesExercise);
    expect(enriched.plan_items[0]?.personalized_instructions).toContain('Signer 5 clients');
    expect(enriched.why_today).not.toBe(rulesWhy);

    const calls = await llmCalls(premium.id);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      feature: 'plan',
      outcome: 'success',
      attempts: 1,
      model: 'mock-1',
    });
    expect(calls[0].decision_id).not.toBeNull();
    expect(Number(calls[0].cost_eur)).toBeGreaterThan(0);
    // Data minimization: the stored output and the logged call never contain the name
    expect(JSON.stringify(calls)).not.toContain('Camille');
  });

  it('keeps the rules plan when the plan is touched before the AI answers', async () => {
    const user = await onboardedUser('ai-touched', { premium: true, consentAi: true });
    const res = await call('generate-plan', user.token);
    expect(res.body.plan.ai_status).toBe('pending');
    const item = res.body.plan.plan_items[0];
    const { error } = await user.client.rpc('set_plan_item_result', {
      p_item_id: item.id,
      // Skipping also touches the plan (no proof needed)
      p_status: 'skipped',
    });
    expect(error).toBeNull();
    const after = await waitFor(
      () => planOf(user.id),
      (p) => p.ai_status !== 'pending',
    );
    expect(after.ai_status).toBe('fallback');
    expect(after.plan_items[0]?.personalized_instructions).toBeNull();
    expect(after.why_today).toBe(res.body.plan.why_today);
    const calls = await waitFor(
      () => llmCalls(user.id),
      (rows) => rows.length > 0,
    );
    expect(calls[0]).toMatchObject({ outcome: 'fallback', fallback_reason: 'plan_touched' });
  });
});

describe('no AI without consent or premium', () => {
  it('premium without AI consent: rules only, no AI call', async () => {
    const user = await onboardedUser('ai-noconsent', { premium: true, consentAi: false });
    const res = await call('generate-plan', user.token);
    expect(res.status).toBe(200);
    expect(res.body.plan.ai_status).toBeNull();
    await sleep(2500);
    expect((await planOf(user.id)).ai_status).toBeNull();
    expect(await llmCalls(user.id)).toHaveLength(0);
  });

  it('free with AI consent: rules only, no AI call', async () => {
    const user = await onboardedUser('ai-free', { premium: false, consentAi: true });
    const res = await call('generate-plan', user.token);
    expect(res.body.plan.ai_status).toBeNull();
    await sleep(2500);
    expect(await llmCalls(user.id)).toHaveLength(0);
  });
});

describe('premium weekly review', () => {
  it('rules review first, then AI summary and texts without changing the proposals', async () => {
    const user = await onboardedUser('ai-review', { premium: true, consentAi: true });
    // Onboarded a month ago: last week's review is due
    await admin
      .from('profiles')
      .update({ onboarded_at: new Date(Date.now() - 30 * 86_400_000).toISOString() })
      .eq('user_id', user.id);
    const res = await call('generate-review', user.token);
    expect(res.status).toBe(200);
    const review = res.body.review;
    expect(review.ai_status).toBe('pending');
    expect(review.summary).toBeNull();
    const before = review.proposals as { type: string; params: unknown }[];

    const after = await waitFor(
      async () =>
        (
          await admin
            .from('weekly_reviews')
            .select('ai_status, summary, proposals')
            .eq('id', review.id)
            .single()
        ).data!,
      (r) => r.ai_status !== 'pending',
    );
    expect(after.ai_status).toBe('enriched');
    expect(after.summary).toBeTruthy();
    const proposals = after.proposals as { type: string; params: unknown; text?: string }[];
    expect(proposals.map((p) => ({ type: p.type, params: p.params }))).toEqual(
      before.map((p) => ({ type: p.type, params: p.params })),
    );
    expect(proposals.every((p) => typeof p.text === 'string')).toBe(true);
    const calls = await llmCalls(user.id);
    expect(calls.map((c) => c.feature)).toContain('review');
    // Enriched once: a second opening does not call the AI again
    await call('generate-review', user.token);
    await sleep(500);
    expect((await llmCalls(user.id)).filter((c) => c.feature === 'review')).toHaveLength(1);
  });
});
