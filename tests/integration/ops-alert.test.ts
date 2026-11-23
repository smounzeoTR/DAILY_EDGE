// Operations alerts against the local stack: batch runs are recorded, ops-alert requires the
// server secret and, without an e-mail provider (local), leaves the alerts pending.
import { execSync } from 'node:child_process';

import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';

type Status = { API_URL: string; PUBLISHABLE_KEY: string; SERVICE_ROLE_KEY: string };
const status = JSON.parse(execSync('supabase status -o json', { encoding: 'utf8' })) as Status;
const url = status.API_URL;
const admin = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
// Local-only value from supabase/config.toml ([edge_runtime.secrets])
const BATCH_SECRET = 'local-dev-plans-batch-secret';
const inserted: string[] = [];

async function call(fn: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${url}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: status.PUBLISHABLE_KEY, ...headers },
    body: '{}',
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

afterAll(async () => {
  if (inserted.length > 0) await admin.from('ops_alerts').delete().in('id', inserted);
});

describe('operations alerts', () => {
  it('the fallback batch records each run', async () => {
    const before = new Date().toISOString();
    const res = await call('generate-plans-batch', { 'x-batch-secret': BATCH_SECRET });
    expect(res.status).toBe(200);
    const { data } = await admin
      .from('ops_batch_runs')
      .select('ok, summary')
      .gte('started_at', before)
      .order('started_at', { ascending: false })
      .limit(1);
    expect(data?.[0]?.ok).toBe(true);
  });

  it('ops-alert requires the server secret', async () => {
    expect((await call('ops-alert')).status).toBe(401);
    expect((await call('ops-alert', { 'x-batch-secret': 'wrong' })).status).toBe(401);
  });

  it('without an e-mail provider, pending alerts stay pending', async () => {
    const { data, error } = await admin
      .from('ops_alerts')
      .insert({ kind: 'ai_cost', day: '2001-01-01', detail: { cost_eur: 9, threshold_eur: 5 } })
      .select('id')
      .single();
    if (error) throw error;
    inserted.push(data.id);
    const res = await call('ops-alert', { 'x-batch-secret': BATCH_SECRET });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(0);
    expect(res.body.provider).toBe('none');
    const { data: row } = await admin
      .from('ops_alerts')
      .select('notified_at')
      .eq('id', data.id)
      .single();
    expect(row?.notified_at).toBeNull();
  });
});
