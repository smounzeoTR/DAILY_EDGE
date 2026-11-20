// generate-plans-batch (hourly fallback) against the local stack.
import { execSync } from 'node:child_process';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type Status = { API_URL: string; PUBLISHABLE_KEY: string; SERVICE_ROLE_KEY: string };
const status = JSON.parse(execSync('supabase status -o json', { encoding: 'utf8' })) as Status;
const url = status.API_URL;
const admin = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Local-only value from supabase/config.toml ([edge_runtime.secrets])
const BATCH_SECRET = 'local-dev-plans-batch-secret';
const PASSWORD = 'integration-test-password';
const created: string[] = [];

type User = { id: string; token: string };

async function onboardedUser(label: string, timezone: string): Promise<User> {
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
  const { error: onboardError } = await client.rpc('complete_onboarding', {
    p_goal_title: 'Objectif',
    p_program_id: 'PR1',
    p_habits: [{ template_id: 'H02' }, { template_id: 'H03' }, { template_id: 'H04' }],
  });
  if (onboardError) throw onboardError;
  return { id: data.user.id, token: session.session?.access_token ?? '' };
}

async function batch(headers: Record<string, string>, body?: unknown) {
  const res = await fetch(`${url}/functions/v1/generate-plans-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: status.PUBLISHABLE_KEY, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, number | string> };
}

async function planDates(userId: string): Promise<string[]> {
  const { data, error } = await admin.from('daily_plans').select('date').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((p) => p.date).sort();
}

let paris: User;
let newYork: User;

beforeAll(async () => {
  paris = await onboardedUser('paris', 'Europe/Paris');
  newYork = await onboardedUser('ny', 'America/New_York');
});

afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe('generate-plans-batch', () => {
  it('requires the server secret, never a user JWT', async () => {
    expect((await batch({})).status).toBe(401);
    expect((await batch({ 'x-batch-secret': 'wrong' })).status).toBe(401);
    expect((await batch({ Authorization: `Bearer ${paris.token}` })).status).toBe(401);
    expect(
      (await batch({ Authorization: `Bearer ${paris.token}`, 'x-batch-secret': '' })).status,
    ).toBe(401);
  });

  it('rejects unknown fields even with the secret', async () => {
    expect((await batch({ 'x-batch-secret': BATCH_SECRET }, { user_id: paris.id })).status).toBe(
      400,
    );
  });

  it('picks users by time zone: Paris at 02:30, New York later', async () => {
    // 2027-01-12 01:30 UTC = 02:30 in Paris, 20:30 (Jan 11) in New York
    const first = await batch({ 'x-batch-secret': BATCH_SECRET }, { now: '2027-01-12T01:30:00Z' });
    expect(first.status).toBe(200);
    expect(Number(first.body.failed)).toBe(0);
    expect(await planDates(paris.id)).toEqual(['2027-01-12']);
    expect(await planDates(newYork.id)).toEqual([]);

    // Same hour again (catch-up run): no duplicate
    await batch({ 'x-batch-secret': BATCH_SECRET }, { now: '2027-01-12T03:59:00Z' });
    expect(await planDates(paris.id)).toEqual(['2027-01-12']);

    // 2027-01-12 08:15 UTC = 03:15 in New York (catch-up window), 09:15 in Paris
    await batch({ 'x-batch-secret': BATCH_SECRET }, { now: '2027-01-12T08:15:00Z' });
    expect(await planDates(newYork.id)).toEqual(['2027-01-12']);
    expect(await planDates(paris.id)).toEqual(['2027-01-12']);

    // 2027-01-13 10:00 UTC = 05:00 in New York: window closed for that local date
    const closed = await batch({ 'x-batch-secret': BATCH_SECRET }, { now: '2027-01-13T10:00:00Z' });
    expect(closed.status).toBe(200);
    expect(await planDates(newYork.id)).toEqual(['2027-01-12']);
  });
});
