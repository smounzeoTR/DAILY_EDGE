// generate-review, export-my-data and the batch (reviews, purge) against the local stack.
import { execSync } from 'node:child_process';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type Status = { API_URL: string; PUBLISHABLE_KEY: string; SERVICE_ROLE_KEY: string };
const status = JSON.parse(execSync('supabase status -o json', { encoding: 'utf8' })) as Status;
const url = status.API_URL;
const admin = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BATCH_SECRET = 'local-dev-plans-batch-secret';
const PASSWORD = 'integration-test-password';
const created: string[] = [];

type User = { id: string; token: string; client: SupabaseClient };

async function onboardedUser(label: string, timezone = 'Europe/Paris'): Promise<User> {
  const email = `${label}-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { timezone },
  });
  if (error || !data.user) throw error ?? new Error('createUser failed');
  created.push(data.user.id);
  const client = createClient(url, status.PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: session } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  // Lot 10b: onboarding requires the 18+ confirmation
  await client.rpc('confirm_adult_age');
  const { error: onboardError } = await client.rpc('complete_onboarding', {
    p_goal_title: 'Objectif',
    p_program_id: 'PR1',
    p_habits: [{ template_id: 'H02' }, { template_id: 'H03' }, { template_id: 'H04' }],
  });
  if (onboardError) throw onboardError;
  // Onboarded a month ago: weekly reviews are due
  await admin
    .from('profiles')
    .update({ onboarded_at: new Date(Date.now() - 30 * 86_400_000).toISOString() })
    .eq('user_id', data.user.id);
  return { id: data.user.id, token: session.session?.access_token ?? '', client };
}

async function call(
  name: string,
  token: string | null,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: status.PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

let a: User;
let b: User;

beforeAll(async () => {
  a = await onboardedUser('ra');
  b = await onboardedUser('rb');
});

afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

describe('generate-review', () => {
  it('requires a JWT and accepts no parameter', async () => {
    expect((await call('generate-review', null)).status).toBe(401);
    expect((await call('generate-review', a.token, { user_id: b.id })).status).toBe(400);
  });

  it('generates the current review once (idempotent)', async () => {
    const first = await call('generate-review', a.token);
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('created');
    expect(first.body.review).toMatchObject({ stats: { exercisesPlanned: 0 } });
    const second = await call('generate-review', a.token);
    expect(second.body.status).toBe('unchanged');
    expect(second.body.review.id).toBe(first.body.review.id);
    const { count } = await admin
      .from('weekly_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', a.id);
    expect(count).toBe(1);
  });

  it('B cannot read the review of A', async () => {
    await call('generate-review', b.token);
    const { data } = await b.client.from('weekly_reviews').select('user_id');
    expect(data?.length).toBeGreaterThan(0);
    expect(data?.every((r) => r.user_id === b.id)).toBe(true);
  });
});

describe('export-my-data', () => {
  it('exports all the caller data, nothing from others', async () => {
    const res = await call('export-my-data', a.token);
    expect(res.status).toBe(200);
    expect(res.body.format).toBe('daily-edge-export');
    expect(res.body.account.id).toBe(a.id);
    const data = res.body.data as Record<string, { user_id: string }[]>;
    expect(Object.keys(data).sort()).toEqual(
      [
        'assistant_actions',
        'assistant_messages',
        'assistant_threads',
        'checkins',
        'daily_plans',
        'engine_decisions',
        'favorites',
        'goals',
        'habit_logs',
        'llm_calls',
        'notes',
        'plan_items',
        'profile_stats',
        'profiles',
        'subscriptions',
        'user_habits',
        'user_guide_state',
        'weekly_reviews',
      ].sort(),
    );
    expect(data.goals).toHaveLength(1);
    expect(data.user_habits).toHaveLength(3);
    expect(data.weekly_reviews).toHaveLength(1);
    for (const rows of Object.values(data))
      expect(rows.every((r) => r.user_id === a.id)).toBe(true);
  });

  it('stays available while the account deletion is pending', async () => {
    const { error } = await b.client.rpc('request_account_deletion');
    expect(error).toBeNull();
    const res = await call('export-my-data', b.token);
    expect(res.status).toBe(200);
    expect(res.body.data.profiles[0].deletion_requested_at).not.toBeNull();
    // No plan and no review generated for a pending account
    expect((await call('generate-review', b.token)).status).toBe(409);
  });
});

describe('batch: weekly reviews and purge', () => {
  it('generates the reviews due on Sunday evening (Paris)', async () => {
    const c = await onboardedUser('rc');
    // Sunday 2027-01-17 18:30 in Paris (17:30 UTC)
    const res = await call(
      'generate-plans-batch',
      null,
      { now: '2027-01-17T17:30:00Z' },
      { 'x-batch-secret': BATCH_SECRET },
    );
    expect(res.status).toBe(200);
    const { data } = await admin.from('weekly_reviews').select('week_start').eq('user_id', c.id);
    expect(data?.map((r) => r.week_start)).toEqual(['2027-01-11']);
  });

  it('purges accounts whose deletion was requested more than 30 days ago', async () => {
    const d = await onboardedUser('rd');
    await admin
      .from('profiles')
      .update({ deletion_requested_at: new Date(Date.now() - 31 * 86_400_000).toISOString() })
      .eq('user_id', d.id);
    const res = await call('generate-plans-batch', null, {}, { 'x-batch-secret': BATCH_SECRET });
    expect(res.status).toBe(200);
    expect(Number(res.body.purged)).toBeGreaterThanOrEqual(1);
    const { data } = await admin.auth.admin.getUserById(d.id);
    expect(data.user).toBeNull();
    const { count } = await admin
      .from('user_habits')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', d.id);
    expect(count).toBe(0);
  });
});
