// dailyedge.fr waitlist against the local stack: waitlist-join, waitlist-confirm, waitlist-status,
// e-mails read in Mailpit (MAILER_PROVIDER = "mailpit" in config.toml).
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { request } from 'node:http';

import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';

import {
  computeRanks,
  type WaitlistModelEntry,
} from '../../supabase/functions/_shared/waitlist/rank.ts';
import { assertMockProviders } from './guard.ts';
import { latestMail } from './mailpit.ts';

assertMockProviders();

type Status = { API_URL: string; SERVICE_ROLE_KEY: string };
const status = JSON.parse(execSync('supabase status -o json', { encoding: 'utf8' })) as Status;
const fn = `${status.API_URL}/functions/v1`;
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const run = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
const address = (label: string) => `wl-${label}-${run}@example.test`;

async function post(name: string, body: unknown) {
  const res = await fetch(`${fn}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    body: (await res.json().catch(() => null)) as any,
    headers: res.headers,
  };
}

// Node's fetch does not send a custom Origin header: raw HTTP request for the origin checks
function postWithOrigin(name: string, body: unknown, origin: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(
      `${fn}/${name}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin } },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

const join = (email: string, extra: Record<string, unknown> = {}) =>
  post('waitlist-join', { email, consent_marketing: true, ...extra });

function tokenFrom(text: string, marker: 'confirmer#t=' | 'ma-place#s='): string {
  const match = text.match(new RegExp(`http://localhost:4321/${marker}([A-Za-z0-9_-]{43})`));
  if (!match) throw new Error(`no ${marker} link in: ${text}`);
  return match[1]!;
}

async function confirmedThrough(email: string) {
  expect((await join(email)).status).toBe(202);
  const mail = await latestMail(email);
  const confirmed = await post('waitlist-confirm', { token: tokenFrom(mail.text, 'confirmer#t=') });
  expect(confirmed.status).toBe(200);
  return confirmed.body as { rank: number; referral_code: string; status_token: string };
}

afterAll(async () => {
  await admin.from('waitlist_entries').delete().like('email', `wl-%-${run}@example.test`);
});

describe('waitlist-join', () => {
  it('registers a pending entry and sends the confirmation e-mail (HTML and text)', async () => {
    const email = address('new');
    const res = await join(email.toUpperCase(), {
      utm_source: 'gdiy',
      utm_medium: 'podcast',
      utm_campaign: 'waitlist',
      landing_path: '/gdiy',
    });
    expect(res).toMatchObject({ status: 202, body: { ok: true } });

    const { data: row } = await admin
      .from('waitlist_entries')
      .select('*')
      .eq('email', email)
      .single();
    expect(row).toMatchObject({
      status: 'pending',
      consent_marketing: true,
      utm_source: 'gdiy',
      landing_path: '/gdiy',
      locale: 'fr',
      rank: null,
    });
    expect(row.referral_code).toMatch(/^[A-Z2-9]{6}$/);
    expect(row.consent_at).not.toBeNull();

    const mail = await latestMail(email);
    expect(mail.from).toBe('bonjour@auth.dailyedge.fr');
    expect(mail.subject).toBe('Confirme ton inscription à Daily Edge');
    const token = tokenFrom(mail.text, 'confirmer#t=');
    expect(mail.html).toContain(`confirmer#t=${token}`);
    // Links carry the token only: no e-mail or identifier in any URL
    for (const url of mail.text.match(/https?:\/\/\S+/g) ?? []) {
      expect(url).not.toContain('@');
      expect(url).not.toContain(row.id);
      expect(url).not.toContain('?');
    }

    const { data: tokens } = await admin
      .from('waitlist_tokens')
      .select('token_hash, kind, expires_at')
      .eq('entry_id', row.id);
    expect(tokens).toHaveLength(1);
    expect(tokens![0]!.token_hash).toBe(createHash('sha256').update(token).digest('hex'));
    const ttl = new Date(tokens![0]!.expires_at).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(47.9 * 3600_000);
    expect(ttl).toBeLessThanOrEqual(48 * 3600_000);
  });

  it('never reveals whether an address already exists', async () => {
    const fresh = await join(address('reveal-new'));
    const pending = await join(address('reveal-new'));
    const confirmedEmail = address('reveal-confirmed');
    await confirmedThrough(confirmedEmail);
    const confirmed = await join(confirmedEmail);
    for (const res of [fresh, pending, confirmed]) {
      expect(res.status).toBe(202);
      expect(res.body).toEqual({ ok: true });
    }
  });

  it('a new request replaces the previous link', async () => {
    const email = address('relink');
    await join(email);
    const first = tokenFrom((await latestMail(email)).text, 'confirmer#t=');
    await join(email);
    const second = tokenFrom(
      (await latestMail(email, { notContaining: first })).text,
      'confirmer#t=',
    );
    expect(second).not.toBe(first);
    expect((await post('waitlist-confirm', { token: first })).status).toBe(410);
    expect((await post('waitlist-confirm', { token: second })).status).toBe(200);
  });

  it('an already confirmed address receives a link to see its place', async () => {
    const email = address('again');
    const place = await confirmedThrough(email);
    await join(email);
    const mail = await latestMail(email, { subject: 'Ta place Daily Edge est déjà réservée' });
    const statusToken = tokenFrom(mail.text, 'ma-place#s=');
    const res = await post('waitlist-status', { status_token: statusToken });
    expect(res).toMatchObject({ status: 200, body: { referral_code: place.referral_code } });
  });

  it('validates the input with zod', async () => {
    expect(
      (await post('waitlist-join', { email: 'pas-un-email', consent_marketing: true })).status,
    ).toBe(400);
    expect((await post('waitlist-join', { email: address('noconsent') })).status).toBe(400);
    expect(
      (await post('waitlist-join', { email: address('noconsent'), consent_marketing: false }))
        .status,
    ).toBe(400);
    const { count } = await admin
      .from('waitlist_entries')
      .select('id', { count: 'exact', head: true })
      .eq('email', address('noconsent'));
    expect(count).toBe(0);
  });

  // The local Kong gateway adds its own CORS headers (*): the server-side origin check is tested
  it('accepts the site origin only', async () => {
    const payload = { consent_marketing: true };
    expect(
      await postWithOrigin(
        'waitlist-join',
        { ...payload, email: address('origin') },
        'http://localhost:4321',
      ),
    ).toBe(202);
    expect(
      await postWithOrigin(
        'waitlist-join',
        { ...payload, email: address('origin-evil') },
        'https://evil.example',
      ),
    ).toBe(403);
    const { count } = await admin
      .from('waitlist_entries')
      .select('id', { count: 'exact', head: true })
      .eq('email', address('origin-evil'));
    expect(count).toBe(0);
  });
});

describe('waitlist-confirm and waitlist-status', () => {
  it('confirms once, returns the rank, then shows the place with the status token', async () => {
    const email = address('confirm');
    await join(email);
    const token = tokenFrom((await latestMail(email)).text, 'confirmer#t=');
    const res = await post('waitlist-confirm', { token });
    expect(res.status).toBe(200);
    expect(res.body.rank).toBeGreaterThanOrEqual(1);
    expect(res.body.referral_code).toMatch(/^[A-Z2-9]{6}$/);
    expect((await post('waitlist-confirm', { token })).status).toBe(410);

    const place = await post('waitlist-status', { status_token: res.body.status_token });
    expect(place).toMatchObject({
      status: 200,
      body: { rank: res.body.rank, confirmed_referrals: 0 },
    });
  });

  it('refuses an expired link (48 h)', async () => {
    const email = address('expired');
    await join(email);
    const token = tokenFrom((await latestMail(email)).text, 'confirmer#t=');
    const { data: row } = await admin
      .from('waitlist_entries')
      .select('id')
      .eq('email', email)
      .single();
    await admin
      .from('waitlist_tokens')
      .update({ expires_at: new Date(Date.now() - 3600_000).toISOString() })
      .eq('entry_id', row!.id);
    expect((await post('waitlist-confirm', { token })).status).toBe(410);
  });

  it('refuses malformed and unknown tokens', async () => {
    expect((await post('waitlist-confirm', { token: 'short' })).status).toBe(400);
    expect((await post('waitlist-confirm', { token: 'A'.repeat(43) })).status).toBe(410);
    expect((await post('waitlist-status', { status_token: 'A'.repeat(43) })).status).toBe(404);
  });

  it('a confirmed referral moves the sponsor up 10 places (floor 1)', async () => {
    const sponsor = await confirmedThrough(address('sponsor'));
    const before = (await post('waitlist-status', { status_token: sponsor.status_token })).body;

    // A pending referral does not count
    const friendEmail = address('friend');
    await join(friendEmail, { ref: sponsor.referral_code.toLowerCase() });
    const pendingView = (await post('waitlist-status', { status_token: sponsor.status_token }))
      .body;
    expect(pendingView.confirmed_referrals).toBe(0);

    const token = tokenFrom((await latestMail(friendEmail)).text, 'confirmer#t=');
    expect((await post('waitlist-confirm', { token })).status).toBe(200);
    const after = (await post('waitlist-status', { status_token: sponsor.status_token })).body;
    expect(after.confirmed_referrals).toBe(1);
    expect(after.rank).toBe(Math.max(1, before.rank - 10));

    const { data: friend } = await admin
      .from('waitlist_entries')
      .select('referred_by')
      .eq('email', friendEmail)
      .single();
    expect(friend!.referred_by).toBe(sponsor.referral_code);
  });

  it('database ranks match the reference model', async () => {
    const { data } = await admin
      .from('waitlist_entries')
      .select(
        'id, created_at, status, referral_code, referred_by, confirmed_referrals, confirmed_at, rank',
      );
    const model: WaitlistModelEntry[] = (data ?? []).map((r: any) => ({
      id: r.id,
      // Same format for every row (+00:00, trailing zeros trimmed): compares as text
      createdAt: r.created_at,
      status: r.status,
      referralCode: r.referral_code,
      referredBy: r.referred_by,
      confirmedReferrals: r.confirmed_referrals,
      confirmedAt: r.confirmed_at,
      rank: r.rank,
    }));
    const ranks = computeRanks(model);
    for (const entry of model.filter((e) => e.status === 'confirmed')) {
      expect(entry.rank, entry.id).toBe(ranks.get(entry.id));
    }
  });

  it('an unknown referral code is ignored, not an error', async () => {
    const email = address('badref');
    expect((await join(email, { ref: 'ZZZZZZ' })).status).toBe(202);
    const { data } = await admin
      .from('waitlist_entries')
      .select('referred_by')
      .eq('email', email)
      .single();
    expect(data!.referred_by).toBeNull();
  });
});
