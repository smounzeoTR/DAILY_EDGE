// Anti-abuse of the dailyedge.fr functions against the local stack (lot S4): ALTCHA required and
// single use, rate limits per IP (a forged x-forwarded-for does not get around them), hashed
// IPs only, at most 3 waitlist e-mails per address per 24 h.
import { execSync } from 'node:child_process';
import { request } from 'node:http';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { altchaPayload } from './altcha.ts';
import { assertMockProviders } from './guard.ts';

assertMockProviders();

type Status = { API_URL: string; SERVICE_ROLE_KEY: string };
const status = JSON.parse(execSync('supabase status -o json', { encoding: 'utf8' })) as Status;
const fn = `${status.API_URL}/functions/v1`;
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const run = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
const address = (label: string) => `ab-${label}-${run}@example.test`;

/** Raw HTTP POST (Node's fetch would not let us set every header). */
function post(
  name: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any; retryAfter: string | undefined }> {
  return new Promise((resolve, reject) => {
    const req = request(
      `${fn}/${name}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: data ? JSON.parse(data) : null,
            retryAfter: res.headers['retry-after'] as string | undefined,
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

const answers = {
  domain: 'clarity_goals',
  situation: 'employee',
  blocker: 'motivation',
  daily_minutes: 15,
  chronotype: 'morning',
};

async function mailCount(to: string): Promise<number> {
  const res = await fetch(
    `http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
  );
  return ((await res.json()) as { messages?: unknown[] }).messages?.length ?? 0;
}

beforeEach(async () => {
  await admin.from('rate_limit_hits').delete().gte('id', 0);
});

afterAll(async () => {
  await admin.from('rate_limit_hits').delete().gte('id', 0);
  await admin.from('waitlist_entries').delete().like('email', `ab-%-${run}@example.test`);
  await admin.from('web_diagnostics').delete().like('email', `ab-%-${run}@example.test`);
});

describe('ALTCHA', () => {
  it('is required by waitlist-join and diagnostic-submit', async () => {
    const join = await post('waitlist-join', {
      email: address('noaltcha'),
      consent_marketing: true,
    });
    expect(join).toMatchObject({ status: 400, body: { error: 'altcha' } });
    const diagnostic = await post('diagnostic-submit', { answers, email: address('noaltcha') });
    expect(diagnostic).toMatchObject({ status: 400, body: { error: 'altcha' } });
    const { count } = await admin
      .from('waitlist_entries')
      .select('id', { count: 'exact', head: true })
      .eq('email', address('noaltcha'));
    expect(count).toBe(0);
  });

  it('accepts a solved challenge once only', async () => {
    const altcha = await altchaPayload(fn);
    const body = { email: address('replay'), consent_marketing: true, altcha };
    expect((await post('waitlist-join', body)).status).toBe(202);
    expect(await post('waitlist-join', body)).toMatchObject({
      status: 400,
      body: { error: 'altcha' },
    });
    // Nor on the other function
    expect(
      (await post('diagnostic-submit', { answers, email: address('replay2'), altcha })).status,
    ).toBe(400);
  });

  // The proof is the derived key, checked against a signature of ours (the counter is informative)
  it('refuses a forged derived key, a challenge not signed by us or changed parameters', async () => {
    const fresh = async () => JSON.parse(Buffer.from(await altchaPayload(fn), 'base64').toString());
    const forgedKey = await fresh();
    forgedKey.solution.derivedKey = '00'.repeat(32);
    const unsigned = await fresh();
    unsigned.challenge.signature = '0'.repeat(64);
    const easier = await fresh();
    easier.challenge.parameters.cost = 1;
    for (const payload of [forgedKey, unsigned, easier]) {
      const altcha = Buffer.from(JSON.stringify(payload)).toString('base64');
      const res = await post('waitlist-join', {
        email: address('tampered'),
        consent_marketing: true,
        altcha,
      });
      expect(res).toMatchObject({ status: 400, body: { error: 'altcha' } });
    }
    const junk = await post('waitlist-join', {
      email: address('junk'),
      consent_marketing: true,
      altcha: 'not-base64',
    });
    expect(junk.status).toBe(400);
  });
});

describe('rate limits per IP', () => {
  const status_token = 'A'.repeat(43);

  it('waitlist-status: 30 per 10 minutes, then 429 with Retry-After', async () => {
    for (let i = 0; i < 30; i++) {
      expect((await post('waitlist-status', { status_token })).status).toBe(404);
    }
    const refused = await post('waitlist-status', { status_token });
    expect(refused).toMatchObject({ status: 429, body: { error: 'rate_limited' } });
    expect(refused.retryAfter).toBe('600');
  });

  it('a forged x-forwarded-for does not get around the limit', async () => {
    for (let i = 0; i < 30; i++) {
      const forged = {
        'X-Forwarded-For': `198.51.100.${i + 1}`,
        'X-Real-IP': `203.0.113.${i + 1}`,
      };
      expect((await post('waitlist-status', { status_token }, forged)).status).toBe(404);
    }
    const refused = await post(
      'waitlist-status',
      { status_token },
      { 'X-Forwarded-For': '198.51.100.250' },
    );
    expect(refused.status).toBe(429);
  });

  it('only the hash of the IP is stored', async () => {
    await post('waitlist-status', { status_token }, { 'X-Forwarded-For': '198.51.100.77' });
    const { data } = await admin.from('rate_limit_hits').select('action, ip_hash');
    expect(data!.length).toBeGreaterThan(0);
    for (const row of data!) {
      expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(row)).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
    }
  });

  it('waitlist-join: 20 per 10 minutes (shared addresses), then 429', async () => {
    for (let i = 0; i < 20; i++) {
      const res = await post('waitlist-join', {
        email: address(`many${i}`),
        consent_marketing: true,
        altcha: await altchaPayload(fn),
      });
      expect(res.status).toBe(202);
    }
    const refused = await post('waitlist-join', {
      email: address('many-last'),
      consent_marketing: true,
      altcha: await altchaPayload(fn),
    });
    expect(refused.status).toBe(429);
  });
});

describe('e-mail limit per address', () => {
  it('waitlist: at most 3 e-mails per address per 24 h, same 202 answer above', async () => {
    const email = address('mails');
    for (let i = 0; i < 4; i++) {
      const res = await post('waitlist-join', {
        email,
        consent_marketing: true,
        altcha: await altchaPayload(fn),
      });
      expect(res).toMatchObject({ status: 202, body: { ok: true } });
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(await mailCount(email)).toBe(3);
  });
});
