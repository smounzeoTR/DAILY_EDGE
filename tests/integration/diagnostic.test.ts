// dailyedge.fr web diagnostic against the local stack: diagnostic-submit and
// diagnostic-confirm-marketing, result e-mails read in Mailpit.
import { execSync } from 'node:child_process';
import { request } from 'node:http';

import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';

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
const address = (label: string) => `dg-${label}-${run}@example.test`;

const answers = {
  domain: 'money_wealth',
  situation: 'employee',
  blocker: 'fear',
  daily_minutes: 15,
  chronotype: 'evening',
  authors: ['hill', 'kiyosaki'],
};

async function post(name: string, body: unknown) {
  const res = await fetch(`${fn}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

const submit = (email: string, extra: Record<string, unknown> = {}) =>
  post('diagnostic-submit', { answers, email, ...extra });

async function mailCount(to: string): Promise<number> {
  const res = await fetch(
    `http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
  );
  return (
    ((await res.json()) as { messages_count?: number; messages?: unknown[] }).messages?.length ?? 0
  );
}

function confirmToken(text: string): string {
  const match = text.match(/http:\/\/localhost:4321\/diagnostic\/confirmer#t=([A-Za-z0-9_-]{43})/);
  if (!match) throw new Error(`no confirmation link in: ${text}`);
  return match[1]!;
}

afterAll(async () => {
  await admin.from('web_diagnostics').delete().like('email', `dg-%-${run}@example.test`);
});

describe('diagnostic-submit', () => {
  it('computes the result server side with the onboarding rule and the published catalogue', async () => {
    const email = address('money');
    const res = await submit(email.toUpperCase(), {
      utm_source: 'gdiy',
      landing_path: '/gdiy',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      profile: { id: 'stratege', title: 'Le stratège prudent' },
      program: { id: 'PR4', name: 'Intelligence financière' },
      email_notice: 'Ton plan part par e-mail (un envoi par adresse et par jour).',
    });
    expect(res.body.principle.title).not.toBe('');
    expect(res.body.exercise.duration_min).toBeGreaterThan(0);

    const { data: row } = await admin
      .from('web_diagnostics')
      .select('*')
      .eq('email', email)
      .single();
    expect(row).toMatchObject({
      profile: 'stratege',
      recommended_program_id: 'PR4',
      consent_marketing: false,
      marketing_confirmed_at: null,
      claimed_by_user_id: null,
      utm_source: 'gdiy',
      landing_path: '/gdiy',
      answers,
    });
  });

  it('situation decides when money is not the first domain (same rule as the app)', async () => {
    const res = await submit(address('student'), {
      answers: { ...answers, domain: 'clarity_goals', situation: 'student' },
    });
    expect(res.body.program.id).toBe('PR3');
  });

  it('sends the result e-mail (HTML and text), without consent button when not asked', async () => {
    const email = address('mail');
    await submit(email);
    const mail = await latestMail(email);
    expect(mail.from).toBe('bonjour@auth.dailyedge.fr');
    expect(mail.subject).toBe('Ton plan Daily Edge : Intelligence financière');
    expect(mail.text).toContain('Le stratège prudent');
    expect(mail.html).toContain('Intelligence financière');
    expect(mail.text).not.toContain('Oui, je veux recevoir');
    // Store links are empty locally: no store button
    expect(mail.text).not.toContain('App Store');
  });

  it('one result e-mail per address per 24 hours, same answer either way', async () => {
    const email = address('limit');
    const first = await submit(email);
    await latestMail(email);
    const second = await submit(email, { answers: { ...answers, blocker: 'motivation' } });
    expect(second.status).toBe(200);
    expect(second.body.email_notice).toBe(first.body.email_notice);
    expect(second.body.profile.id).toBe('reveur');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(await mailCount(email)).toBe(1);
    const { count } = await admin
      .from('web_diagnostics')
      .select('id', { count: 'exact', head: true })
      .eq('email', email);
    expect(count).toBe(1);
  });

  it('validates the answers with zod', async () => {
    expect(
      (await submit(address('bad'), { answers: { ...answers, daily_minutes: 45 } })).status,
    ).toBe(400);
    expect((await submit('pas-un-email')).body).toMatchObject({ field: 'email' });
    expect((await post('diagnostic-submit', { email: address('noanswers') })).status).toBe(400);
  });

  it('accepts the site origin only', async () => {
    const code = await new Promise<number>((resolve, reject) => {
      const req = request(
        `${fn}/diagnostic-submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode ?? 0));
        },
      );
      req.on('error', reject);
      req.end(JSON.stringify({ answers, email: address('evil') }));
    });
    expect(code).toBe(403);
  });
});

describe('diagnostic-confirm-marketing', () => {
  it('the result e-mail carries the confirmation button; one click confirms, once', async () => {
    const email = address('consent');
    await submit(email, { consent_marketing: true });
    const mail = await latestMail(email);
    const token = confirmToken(mail.text);
    expect(mail.text).toContain('Oui, je veux recevoir les e-mails de Daily Edge');

    const { data: before } = await admin
      .from('web_diagnostics')
      .select('consent_marketing, marketing_confirmed_at')
      .eq('email', email)
      .single();
    expect(before).toEqual({ consent_marketing: true, marketing_confirmed_at: null });

    expect((await post('diagnostic-confirm-marketing', { token })).status).toBe(200);
    const { data: after } = await admin
      .from('web_diagnostics')
      .select('marketing_confirmed_at')
      .eq('email', email)
      .single();
    expect(after!.marketing_confirmed_at).not.toBeNull();
    expect((await post('diagnostic-confirm-marketing', { token })).status).toBe(410);
  });

  it('refuses an expired link (48 h), malformed and unknown tokens', async () => {
    const email = address('expired');
    await submit(email, { consent_marketing: true });
    const token = confirmToken((await latestMail(email)).text);
    const { data: row } = await admin
      .from('web_diagnostics')
      .select('id')
      .eq('email', email)
      .single();
    await admin
      .from('web_diagnostic_tokens')
      .update({ expires_at: new Date(Date.now() - 3600_000).toISOString() })
      .eq('diagnostic_id', row!.id);
    expect((await post('diagnostic-confirm-marketing', { token })).status).toBe(410);
    expect((await post('diagnostic-confirm-marketing', { token: 'short' })).status).toBe(400);
    expect((await post('diagnostic-confirm-marketing', { token: 'A'.repeat(43) })).status).toBe(
      410,
    );
  });
});
