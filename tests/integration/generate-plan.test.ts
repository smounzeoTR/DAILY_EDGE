// generate-plan Edge Function against the local stack.
// The secret key is read from `supabase status` and used only here, server-side.
import { execSync } from 'node:child_process';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type Status = { API_URL: string; PUBLISHABLE_KEY: string; SERVICE_ROLE_KEY: string };
const status = JSON.parse(execSync('supabase status -o json', { encoding: 'utf8' })) as Status;
const url = status.API_URL;
const admin = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });

type TestUser = { id: string; token: string; client: SupabaseClient };
const PASSWORD = 'integration-test-password';
const created: string[] = [];

async function createUser(label: string): Promise<TestUser> {
  const email = `${label}-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('createUser failed');
  created.push(data.user.id);
  const client = createClient(url, status.PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: session, error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError || !session.session) throw signInError ?? new Error('signIn failed');
  return { id: data.user.id, token: session.session.access_token, client };
}

async function onboard(user: TestUser): Promise<void> {
  // Lot 10b: onboarding requires the 18+ confirmation
  await user.client.rpc('confirm_adult_age');
  const { error } = await user.client.rpc('complete_onboarding', {
    p_goal_title: 'Signer 5 clients',
    p_program_id: 'PR1',
    p_habits: [{ template_id: 'H02' }, { template_id: 'H03' }, { template_id: 'H04' }],
  });
  if (error) throw error;
}

async function generate(token: string | null, body?: unknown) {
  const res = await fetch(`${url}/functions/v1/generate-plan`, {
    method: 'POST',
    headers: {
      apikey: status.PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const localDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(d);
};

async function countPlans(userId: string, date?: string): Promise<number> {
  let query = admin
    .from('daily_plans')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (date) query = query.eq('date', date);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

let a: TestUser;
let b: TestUser;

beforeAll(async () => {
  a = await createUser('a');
  b = await createUser('b');
  await onboard(a);
});

afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe('generate-plan', () => {
  it('rejects calls without a valid JWT', async () => {
    expect((await generate(null)).status).toBe(401);
    expect((await generate('not-a-jwt')).status).toBe(401);
  });

  it('two calls for the same date give a single plan', async () => {
    const first = await generate(a.token);
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('created');
    expect(first.body.plan).toMatchObject({
      date: localDate(),
      mode: 'normal',
      program_day: 1,
      principle_id: 'P002',
    });
    expect(first.body.plan.plan_items).toHaveLength(1);
    expect(first.body.plan.why_today).toContain('Semaine 1');

    const second = await generate(a.token, {});
    expect(second.body.status).toBe('recomputed');
    expect(second.body.plan.id).toBe(first.body.plan.id);
    expect(await countPlans(a.id, localDate())).toBe(1);

    const { data: decisions } = await admin
      .from('engine_decisions')
      .select('rules_fired, why')
      .eq('user_id', a.id);
    expect(decisions).toHaveLength(2);
    expect(decisions?.[0]?.why).toMatchObject({ key: 'program_week', params: { week: 1 } });
  });

  it('rejects any user id or unknown field in the body, and dates other than today or tomorrow', async () => {
    expect((await generate(b.token, { user_id: a.id })).status).toBe(400);
    expect((await generate(a.token, { date: localDate(-1) })).status).toBe(400);
    expect((await generate(a.token, { date: localDate(2) })).status).toBe(400);
    expect((await generate(a.token, { date: 'tomorrow' })).status).toBe(400);
  });

  it('B cannot generate or read the plan of A', async () => {
    // B is not onboarded: nothing is generated, for anyone
    const before = await countPlans(a.id);
    expect((await generate(b.token)).status).toBe(409);
    expect(await countPlans(a.id)).toBe(before);
    expect(await countPlans(b.id)).toBe(0);

    // Once onboarded, B only gets its own plan
    await onboard(b);
    const own = await generate(b.token);
    expect(own.status).toBe(200);
    const { data: bPlan } = await admin
      .from('daily_plans')
      .select('user_id')
      .eq('id', own.body.plan.id)
      .single();
    expect(bPlan?.user_id).toBe(b.id);
    expect(await countPlans(a.id)).toBe(before);

    // REST reads as B never return A's plans or items
    const { data: plans } = await b.client.from('daily_plans').select('id, user_id');
    expect(plans?.every((p) => p.user_id === b.id)).toBe(true);
    const { data: items } = await b.client.from('plan_items').select('user_id');
    expect(items?.every((i) => i.user_id === b.id)).toBe(true);
  });

  it('tomorrow is recomputed after today is done, which advances the program', async () => {
    const tomorrow = localDate(1);
    const early = await generate(a.token, { date: tomorrow });
    expect(early.body.plan.program_day).toBe(1);

    // A marks today's exercise done
    const { data: today } = await a.client
      .from('daily_plans')
      .select('id, plan_items(id)')
      .eq('date', localDate())
      .single();
    const itemId = (today?.plan_items as { id: string }[])[0]?.id;
    // Results go through set_plan_item_result (today's plan only); E001 needs a text proof
    const { error } = await a.client.rpc('set_plan_item_result', {
      p_item_id: itemId ?? '',
      p_status: 'done',
      p_proof_value: 'Signer 5 clients avant mars',
      p_rating: 4,
    });
    expect(error).toBeNull();

    const after = await generate(a.token, { date: tomorrow });
    expect(after.body.status).toBe('recomputed');
    expect(after.body.plan.id).toBe(early.body.plan.id);
    expect(after.body.plan.program_day).toBe(2);
    const { data: profile } = await admin
      .from('profiles')
      .select('program_day')
      .eq('user_id', a.id)
      .single();
    expect(profile?.program_day).toBe(2);

    // Today's plan is touched: returned unchanged
    const again = await generate(a.token);
    expect(again.body.status).toBe('unchanged');
    expect(again.body.plan.plan_items[0].status).toBe('done');
  });

  it('adopts the step exercise added before the plan was computed', async () => {
    const c = await createUser('c');
    await onboard(c);
    const { error } = await c.client.rpc('add_exercise_to_today', { p_exercise_id: 'E001' });
    expect(error).toBeNull();
    const generated = await generate(c.token);
    expect(generated.body.status).toBe('created');
    expect(
      generated.body.plan.plan_items.map(
        (i: { exercise_id: string; origin: string; position: number }) => [
          i.exercise_id,
          i.origin,
          i.position,
        ],
      ),
    ).toEqual([['E001', 'engine', 1]]);
    const { data: decision } = await admin
      .from('engine_decisions')
      .select('rules_fired')
      .eq('user_id', c.id)
      .single();
    expect(decision?.rules_fired).toContain('adopted_user_item');
  });

  it('a done addition keeps the plan recomputable and does not move the program', async () => {
    const d = await createUser('d');
    await onboard(d);
    await generate(d.token);
    const { data: added, error } = await d.client.rpc('add_exercise_to_today', {
      p_exercise_id: 'E041',
    });
    expect(error).toBeNull();
    const { error: doneError } = await d.client.rpc('set_plan_item_result', {
      p_item_id: (added as { id: string }).id,
      p_status: 'done',
    });
    expect(doneError).toBeNull();

    const again = await generate(d.token);
    expect(again.body.status).toBe('recomputed');
    const items = again.body.plan.plan_items as {
      exercise_id: string;
      origin: string;
      status: string;
    }[];
    expect(items.find((i) => i.exercise_id === 'E041')).toMatchObject({
      origin: 'user',
      status: 'done',
    });
    expect(items.filter((i) => i.origin === 'engine')).toHaveLength(1);

    const tomorrow = await generate(d.token, { date: localDate(1) });
    expect(tomorrow.body.plan.program_day).toBe(1);
  });
});
