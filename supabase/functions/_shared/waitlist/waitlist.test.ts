import { describe, expect, it } from 'vitest';

import { logMailer, mailerFromEnv, mailpitMailer, scalewayMailer } from '../mailer/mailer.ts';
import { alreadyConfirmedEmail, confirmEmail, confirmUrl, statusUrl } from './emails.ts';
import { computeRanks, confirmInModel, waitlistRank, type WaitlistModelEntry } from './rank.ts';
import {
  generateReferralCode,
  normalizeReferralCode,
  REFERRAL_ALPHABET,
  referralLink,
} from './referral.ts';
import { confirmSchema, joinSchema } from './schemas.ts';
import {
  CONFIRM_TOKEN_TTL_MS,
  generateToken,
  hashToken,
  TOKEN_PATTERN,
  tokenExpiry,
  tokenState,
} from './token.ts';

function entry(id: string, minute: number, extra: Partial<WaitlistModelEntry> = {}) {
  return {
    id,
    createdAt: `2026-12-01T10:${String(minute).padStart(2, '0')}:00Z`,
    status: 'pending',
    referralCode: `CODE${id.toUpperCase().padEnd(2, 'X')}`.slice(0, 6),
    referredBy: null,
    confirmedReferrals: 0,
    confirmedAt: null,
    rank: null,
    ...extra,
  } satisfies WaitlistModelEntry;
}

describe('waitlistRank', () => {
  it('is the sign-up position without referrals', () => {
    expect(waitlistRank(1, 0)).toBe(1);
    expect(waitlistRank(37, 0)).toBe(37);
  });

  it('gains 10 places per confirmed referral', () => {
    expect(waitlistRank(37, 1)).toBe(27);
    expect(waitlistRank(37, 3)).toBe(7);
  });

  it('never goes below 1', () => {
    expect(waitlistRank(12, 2)).toBe(1);
    expect(waitlistRank(5, 40)).toBe(1);
  });
});

describe('computeRanks', () => {
  it('orders confirmed entries only, by sign-up date', () => {
    const ranks = computeRanks([
      entry('a', 1, { status: 'confirmed' }),
      entry('b', 2), // pending: no rank, does not push anyone down
      entry('c', 3, { status: 'confirmed' }),
      entry('d', 4, { status: 'unsubscribed' }),
    ]);
    expect([...ranks]).toEqual([
      ['a', 1],
      ['c', 2],
    ]);
  });

  it('breaks equal dates by id', () => {
    const ranks = computeRanks([
      entry('z', 1, { status: 'confirmed' }),
      entry('y', 1, { status: 'confirmed' }),
    ]);
    expect(ranks.get('y')).toBe(1);
    expect(ranks.get('z')).toBe(2);
  });
});

describe('referral (confirmInModel)', () => {
  const now = '2026-12-02T09:00:00Z';
  const base = (): WaitlistModelEntry[] => [
    ...Array.from({ length: 20 }, (_, i) =>
      entry(`p${i}`, i, { status: 'confirmed', confirmedAt: now }),
    ),
    entry('sponsor', 30, { status: 'confirmed', confirmedAt: now, referralCode: 'SPONS2' }),
    entry('friend', 31, { referredBy: 'SPONS2', referralCode: 'FRND23' }),
  ];

  it('a confirmed referral moves the sponsor up 10 places', () => {
    const before = computeRanks(base()).get('sponsor');
    const after = confirmInModel(base(), 'friend', now);
    const sponsor = after.find((e) => e.id === 'sponsor')!;
    expect(before).toBe(21);
    expect(sponsor.confirmedReferrals).toBe(1);
    expect(sponsor.rank).toBe(11);
    expect(after.find((e) => e.id === 'friend')!.rank).toBe(22);
  });

  it('a pending referral does not count', () => {
    const entries = base();
    const sponsor = entries.find((e) => e.id === 'sponsor')!;
    expect(sponsor.confirmedReferrals).toBe(0);
    expect(computeRanks(entries).has('friend')).toBe(false);
  });

  it('a second confirmation (after unsubscribing) never counts twice', () => {
    const once = confirmInModel(base(), 'friend', now);
    const unsubscribed = once.map((e) =>
      e.id === 'friend' ? { ...e, status: 'pending' as const } : e,
    );
    const twice = confirmInModel(unsubscribed, 'friend', now);
    expect(twice.find((e) => e.id === 'sponsor')!.confirmedReferrals).toBe(1);
  });

  it('confirming an already confirmed entry changes nothing', () => {
    const once = confirmInModel(base(), 'friend', now);
    expect(confirmInModel(once, 'friend', now)).toEqual(once);
  });

  it('one cannot be one’s own referrer', () => {
    const entries = [entry('self', 1, { referralCode: 'SELF23', referredBy: 'SELF23' })];
    const after = confirmInModel(entries, 'self', now);
    expect(after[0]!.confirmedReferrals).toBe(0);
  });
});

describe('referral codes', () => {
  it('uses 6 unambiguous characters', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateReferralCode();
      expect(code).toMatch(/^[A-Z2-9]{6}$/);
      for (const ch of code) expect(REFERRAL_ALPHABET).toContain(ch);
      expect(code).not.toMatch(/[01ILO]/);
    }
  });

  it('normalizes a shared code and rejects anything else', () => {
    expect(normalizeReferralCode(' ab2cd3 ')).toBe('AB2CD3');
    expect(normalizeReferralCode('AB2CD')).toBeNull();
    expect(normalizeReferralCode('<script>')).toBeNull();
    expect(normalizeReferralCode(42)).toBeNull();
  });

  it('builds the personal link with the code only', () => {
    expect(referralLink('https://dailyedge.fr/', 'AB2CD3')).toBe(
      'https://dailyedge.fr/?ref=AB2CD3',
    );
  });
});

describe('token lifecycle', () => {
  it('is 32 random bytes in base64url', () => {
    const tokens = new Set(Array.from({ length: 50 }, generateToken));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(token).toMatch(TOKEN_PATTERN);
  });

  it('is stored as a SHA-256 hex hash, never as is', async () => {
    const token = generateToken();
    const hash = await hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(await hashToken(token)).toBe(hash);
  });

  it('a confirm token is valid for 48 hours', () => {
    const now = new Date('2026-12-01T10:00:00Z');
    const expires = tokenExpiry('confirm', now);
    expect(expires.getTime() - now.getTime()).toBe(CONFIRM_TOKEN_TTL_MS);
    const token = { expires_at: expires.toISOString(), used_at: null };
    expect(tokenState(token, new Date('2026-12-03T09:59:59Z'))).toBe('valid');
    expect(tokenState(token, new Date('2026-12-03T10:00:00Z'))).toBe('expired');
  });

  it('is single use', () => {
    const token = { expires_at: '2026-12-03T10:00:00Z', used_at: '2026-12-01T11:00:00Z' };
    expect(tokenState(token, new Date('2026-12-01T12:00:00Z'))).toBe('used');
  });

  it('status tokens last 90 days', () => {
    const now = new Date('2026-12-01T10:00:00Z');
    expect(tokenExpiry('status', now).toISOString()).toBe('2027-03-01T10:00:00.000Z');
  });
});

describe('input validation', () => {
  const valid = { email: '  Camille@Example.FR ', consent_marketing: true };

  it('lowercases and trims the e-mail', () => {
    expect(joinSchema.parse(valid).email).toBe('camille@example.fr');
  });

  it('requires the marketing consent and a valid e-mail', () => {
    expect(joinSchema.safeParse({ ...valid, consent_marketing: false }).success).toBe(false);
    expect(joinSchema.safeParse({ email: 'camille@example.fr' }).success).toBe(false);
    expect(joinSchema.safeParse({ ...valid, email: 'pas-un-email' }).success).toBe(false);
  });

  it('drops unusable tracking values instead of refusing the sign-up', () => {
    const parsed = joinSchema.parse({
      ...valid,
      utm_source: 'gdiy',
      utm_medium: 'pod cast <b>',
      landing_path: 'https://evil.example',
      ref: 'nope',
      locale: 'de',
    });
    expect(parsed).toMatchObject({ utm_source: 'gdiy', locale: 'fr', ref: null });
    expect(parsed.utm_medium).toBeUndefined();
    expect(parsed.landing_path).toBeUndefined();
  });

  it('accepts only well-formed tokens', () => {
    expect(confirmSchema.safeParse({ token: generateToken() }).success).toBe(true);
    expect(confirmSchema.safeParse({ token: 'short' }).success).toBe(false);
  });
});

describe('e-mails', () => {
  it('confirmation link carries the token only, in the fragment', () => {
    const url = confirmUrl('https://dailyedge.fr/', 'TOKEN');
    expect(url).toBe('https://dailyedge.fr/confirmer#t=TOKEN');
    expect(statusUrl('https://dailyedge.fr', 'S')).toBe('https://dailyedge.fr/ma-place#s=S');
  });

  it('every e-mail has an HTML and a text version with the link', () => {
    for (const mail of [
      confirmEmail('https://x.test/confirmer#t=A'),
      alreadyConfirmedEmail('https://x.test/ma-place#s=B'),
    ]) {
      expect(mail.subject).not.toBe('');
      expect(mail.html).toContain('<html lang="fr">');
      expect(mail.text).not.toContain('<');
      expect(mail.text).toMatch(/https:\/\/x\.test\/(confirmer|ma-place)#/);
    }
    expect(confirmEmail('u').text).toContain('48 heures');
  });

  it('escapes the link in the HTML', () => {
    expect(confirmEmail('https://x.test/"><script>').html).not.toContain('"><script>');
  });
});

describe('mailer', () => {
  const message = { to: 'camille@example.fr', subject: 'S', html: '<p>H</p>', text: 'T' };

  it('Scaleway: sender, text and HTML versions, project and region', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = ((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(new Response('{}', { status: 200 }));
    }) as unknown as typeof fetch;
    await scalewayMailer({ secretKey: 'k', projectId: 'p', region: 'fr-par' }, fake).send(message);
    expect(calls[0]!.url).toBe(
      'https://api.scaleway.com/transactional-email/v1alpha1/regions/fr-par/emails',
    );
    expect((calls[0]!.init.headers as Record<string, string>)['X-Auth-Token']).toBe('k');
    expect(JSON.parse(calls[0]!.init.body as string)).toMatchObject({
      from: { email: 'bonjour@auth.dailyedge.fr' },
      to: [{ email: 'camille@example.fr' }],
      text: 'T',
      html: '<p>H</p>',
      project_id: 'p',
    });
  });

  it('fails loudly on a provider error', async () => {
    const fake = (() =>
      Promise.resolve(new Response('nope', { status: 500 }))) as unknown as typeof fetch;
    await expect(mailpitMailer('http://mailpit:8025', fake).send(message)).rejects.toThrow(
      'mailpit 500',
    );
  });

  it('log provider masks the recipient', async () => {
    const lines: string[] = [];
    await logMailer((l) => lines.push(l)).send(message);
    expect(lines[0]).toContain('c***@example.fr');
    expect(lines[0]).not.toContain('camille@');
  });

  it('chooses the provider from the environment, log by default', () => {
    expect(mailerFromEnv(() => undefined).provider).toBe('log');
    const env: Record<string, string> = { MAILER_PROVIDER: 'scaleway', SCW_SECRET_KEY: 'k' };
    expect(() => mailerFromEnv((n) => env[n])).toThrow('SCW_PROJECT_ID');
  });
});
