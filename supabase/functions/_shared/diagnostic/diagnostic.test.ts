import { describe, expect, it } from 'vitest';

import { PROFILES, profileOf } from './profile.ts';
import { EMAIL_NOTICE, marketingConfirmUrl, resultEmail, type DiagnosticResult } from './result.ts';
import { answersSchema, appBlockers, submitSchema } from './schema.ts';

const answers = {
  domain: 'money_wealth',
  situation: 'employee',
  blocker: 'fear',
  daily_minutes: 15,
  chronotype: 'evening',
  authors: ['hill', 'clear'],
} as const;

describe('diagnostic answers', () => {
  it('accepts the values of the app enums, the authors question being optional', () => {
    expect(answersSchema.safeParse(answers).success).toBe(true);
    const { authors: _skipped, ...withoutAuthors } = answers;
    expect(answersSchema.safeParse(withoutAuthors).success).toBe(true);
    expect(answersSchema.safeParse({ ...answers, authors: ['none'] }).success).toBe(true);
  });

  it('refuses unknown values, 45 minutes, duplicates, "none" with authors and extra keys', () => {
    for (const bad of [
      { ...answers, domain: 'health' },
      { ...answers, situation: 'retired' },
      { ...answers, blocker: 'procrastination' },
      { ...answers, daily_minutes: 45 },
      { ...answers, chronotype: 'night' },
      { ...answers, authors: ['hill', 'hill'] },
      { ...answers, authors: ['none', 'hill'] },
      { ...answers, authors: [] },
      { ...answers, goal: 'free text' },
    ]) {
      expect(answersSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('lowercases the e-mail, defaults the consent to false and drops bad tracking values', () => {
    const parsed = submitSchema.parse({
      answers,
      email: ' Camille@Example.FR ',
      utm_source: 'gdiy',
      utm_medium: 'bad value <b>',
      referral_code: 'ab2cd3',
      landing_path: 'https://evil.example',
    });
    expect(parsed).toMatchObject({
      email: 'camille@example.fr',
      consent_marketing: false,
      utm_source: 'gdiy',
      referral_code: 'AB2CD3',
      locale: 'fr',
    });
    expect(parsed.utm_medium).toBeUndefined();
    expect(parsed.landing_path).toBeUndefined();
  });

  it('prefill of the app blockers: "constance" has no equivalent', () => {
    expect(appBlockers('motivation')).toEqual(['motivation']);
    expect(appBlockers('organisation')).toEqual(['organisation']);
    expect(appBlockers('fear')).toEqual(['fear']);
    expect(appBlockers('constance')).toEqual([]);
  });
});

describe('profiles', () => {
  it('one profile per blocker, two sentences each', () => {
    expect(profileOf('motivation')).toBe('reveur');
    expect(profileOf('organisation')).toBe('batisseur');
    expect(profileOf('constance')).toBe('sprinteur');
    expect(profileOf('fear')).toBe('stratege');
    for (const p of Object.values(PROFILES)) {
      expect(p.text.split(/(?<=\.)\s/)).toHaveLength(2);
    }
  });
});

describe('result e-mail', () => {
  const result: DiagnosticResult = {
    profile: { id: 'stratege', ...PROFILES.stratege },
    program: { id: 'PR4', name: 'Intelligence financière', description: 'Description.' },
    principle: { title: 'Principe', summary: 'Résumé.' },
    exercise: { title: 'Exercice', instructions: 'Consigne.', duration_min: 5 },
  };
  const noStores = { appStore: '', googlePlay: '' };

  it('HTML and text versions with profile, program, principle and exercise duration', () => {
    const mail = resultEmail(result, { stores: noStores, confirmUrl: null });
    expect(mail.subject).toBe('Ton plan Daily Edge : Intelligence financière');
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain('Le stratège prudent');
      expect(part).toContain('Intelligence financière');
      expect(part).toContain('(5 min)');
    }
    expect(mail.text).not.toContain('<');
  });

  it('confirmation button only with a pending marketing consent', () => {
    const url = marketingConfirmUrl('https://dailyedge.fr/', 'TOKEN');
    expect(url).toBe('https://dailyedge.fr/diagnostic/confirmer#t=TOKEN');
    expect(resultEmail(result, { stores: noStores, confirmUrl: url }).text).toContain(
      `Oui, je veux recevoir les e-mails de Daily Edge : ${url}`,
    );
    expect(resultEmail(result, { stores: noStores, confirmUrl: null }).text).not.toContain(
      'Oui, je veux recevoir',
    );
  });

  it('store buttons hidden while their link is empty', () => {
    const none = resultEmail(result, { stores: noStores, confirmUrl: null });
    expect(none.text).not.toContain('App Store');
    expect(none.text).not.toContain('Google Play');
    const ios = resultEmail(result, {
      stores: { appStore: 'https://apps.apple.com/app/id1', googlePlay: '' },
      confirmUrl: null,
    });
    expect(ios.text).toContain('Télécharger sur l’App Store : https://apps.apple.com/app/id1');
    expect(ios.text).not.toContain('Google Play');
  });

  it('notice identical whether the e-mail was sent or not', () => {
    expect(EMAIL_NOTICE).toBe('Ton plan part par e-mail (un envoi par adresse et par jour).');
  });
});
