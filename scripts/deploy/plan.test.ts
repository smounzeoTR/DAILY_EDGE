import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';

import {
  authDiff,
  checkFunctionSecrets,
  checkMakeValues,
  checkSenders,
  checkSettings,
  checkVerifyJwt,
  describeMakeValues,
  EXPECTED_VERIFY_JWT,
  functionSecrets,
  isEuRegion,
  makeVaultSecrets,
  parseVerifyJwt,
  settingsSql,
  vaultSecrets,
} from './plan.ts';

const good = {
  PLANS_BATCH_SECRET: 'x'.repeat(64),
  LLM_PROVIDER: 'anthropic',
  LLM_MODEL: 'claude-haiku-5-5',
  LLM_PRICE_IN_EUR_PER_MTOK: '0.10',
  LLM_PRICE_OUT_EUR_PER_MTOK: '0.50',
  LLM_ASSISTANT_PROVIDER: 'anthropic',
  LLM_ASSISTANT_MODEL: 'claude-sonnet-5-5',
  LLM_ASSISTANT_PRICE_IN_EUR_PER_MTOK: '2',
  LLM_ASSISTANT_PRICE_OUT_EUR_PER_MTOK: '10',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  OPS_ALERT_EMAIL_PROVIDER: 'scaleway',
  OPS_ENV_NAME: 'recette',
  OPS_ALERT_FROM: 'alertes@auth.dailyedge.fr',
  OPS_ALERT_TO: 'ops@example.test',
  SCW_SECRET_KEY: 'scw',
  SCW_PROJECT_ID: 'p',
  SCW_TEM_REGION: 'fr-par',
  MAILER_PROVIDER: 'scaleway',
  SITE_URL: 'http://localhost:4321',
  WAITLIST_FROM: 'bonjour@auth.dailyedge.fr',
  SUPABASE_DB_URL: 'never sent',
};

const HOOK = 'https://hook.eu1.make.com/abc123def456';

describe('deployment rules', () => {
  it('accepts a complete recette configuration', () => {
    expect(checkFunctionSecrets(good, 'recette')).toEqual([]);
  });

  it('refuses the mock provider, a short secret and a wrong environment name', () => {
    const errors = checkFunctionSecrets(
      { ...good, LLM_PROVIDER: 'mock', PLANS_BATCH_SECRET: 'short', OPS_ENV_NAME: 'recette' },
      'production',
    );
    expect(errors).toContain('LLM_PROVIDER=mock interdit hors local');
    expect(errors.some((e) => e.startsWith('PLANS_BATCH_SECRET'))).toBe(true);
    expect(errors).toContain('OPS_ENV_NAME doit valoir production');
  });

  it('requires the Scaleway keys when alerts are e-mailed', () => {
    expect(checkFunctionSecrets({ ...good, SCW_SECRET_KEY: '' }, 'recette')).toContain(
      'SCW_SECRET_KEY manquant (alertes par e-mail)',
    );
  });

  it('only whitelisted keys become function secrets', () => {
    const secrets = functionSecrets(good);
    expect(secrets.ANTHROPIC_API_KEY).toBe('sk-ant-test');
    expect(secrets).not.toHaveProperty('SUPABASE_DB_URL');
  });

  it('Vault values point to the project functions', () => {
    expect(
      vaultSecrets({ SUPABASE_URL: 'https://abc.supabase.co/', PLANS_BATCH_SECRET: 's' }),
    ).toEqual({
      plans_batch_url: 'https://abc.supabase.co/functions/v1/generate-plans-batch',
      ops_alert_url: 'https://abc.supabase.co/functions/v1/ops-alert',
      plans_batch_secret: 's',
    });
  });

  it('server settings: the premium switch is always off outside local', () => {
    const settings = {
      allow_plan_toggle: false,
      assistant_daily_messages: 15,
      assistant_monthly_cost_cap_eur: 2,
      ops_ai_daily_cost_alert_eur: 5,
    };
    expect(checkSettings(settings)).toEqual([]);
    expect(checkSettings({ ...settings, allow_plan_toggle: true })).toContain(
      'allow_plan_toggle doit valoir false hors local',
    );
    expect(settingsSql(settings)).toContain("('assistant_daily_messages', '15'::jsonb)");
  });

  it('auth differences never show the SMTP password', () => {
    const lines = authDiff(
      { site_url: 'https://a', smtp_pass: 'secret' },
      { site_url: 'http://b' },
    );
    expect(lines.join('\n')).not.toContain('secret"');
    expect(lines[0]).toBe('  site_url : "http://b" → "https://a"');
  });

  it('EU regions only', () => {
    expect(isEuRegion('eu-west-3')).toBe(true);
    expect(isEuRegion('us-east-1')).toBe(false);
  });
});

describe('waitlist deployment rules', () => {
  it('sends the waitlist secrets to the functions', () => {
    expect(Object.keys(functionSecrets(good))).toEqual(
      expect.arrayContaining(['MAILER_PROVIDER', 'SITE_URL', 'WAITLIST_FROM', 'SCW_TEM_REGION']),
    );
  });

  it('requires Scaleway, the site URL and the sender', () => {
    const errors = checkFunctionSecrets(
      { ...good, MAILER_PROVIDER: 'mailpit', SITE_URL: '', WAITLIST_FROM: '' },
      'recette',
    );
    expect(errors).toContain('MAILER_PROVIDER doit valoir scaleway hors local');
    expect(errors).toContain("SITE_URL manquant (liste d'attente)");
    expect(errors).toContain("WAITLIST_FROM manquant (liste d'attente)");
    expect(checkFunctionSecrets({ ...good, SCW_TEM_REGION: '' }, 'recette')).toContain(
      "SCW_TEM_REGION manquant (e-mails de la liste d'attente)",
    );
  });

  it('site URL: dailyedge.fr in production, localhost allowed in recette', () => {
    const production = { ...good, OPS_ENV_NAME: 'production' };
    expect(checkFunctionSecrets(production, 'production')).toContain(
      'SITE_URL doit valoir https://dailyedge.fr en production',
    );
    expect(
      checkFunctionSecrets({ ...production, SITE_URL: 'https://dailyedge.fr' }, 'production'),
    ).toEqual([]);
    expect(checkFunctionSecrets({ ...good, SITE_URL: 'https://x.fr/path' }, 'recette')).toContain(
      'SITE_URL : https://<domaine> ou http://localhost:<port>, sans chemin',
    );
  });

  it('every sender is an address of auth.dailyedge.fr', () => {
    expect(checkSenders({ ...good, SMTP_ADMIN_EMAIL: 'connexion@auth.dailyedge.fr' })).toEqual([]);
    expect(checkSenders({ ...good, SMTP_ADMIN_EMAIL: 'connexion@dailyedge.trasenel.com' })).toEqual(
      ['SMTP_ADMIN_EMAIL doit être une adresse @auth.dailyedge.fr'],
    );
    expect(checkSenders({ WAITLIST_FROM: 'bonjour@news.dailyedge.fr' })).toHaveLength(1);
  });
});

describe('Make values (Vault)', () => {
  const make = {
    MAKE_HOOK_WAITLIST: HOOK,
    MAKE_HOOK_DIAGNOSTIC: 'https://hook.eu1.make.com/zzz999',
    MAKE_WEBHOOK_SECRET: 'make-secret-value',
  };

  it('recette: the three values must stay empty', () => {
    expect(checkMakeValues({}, 'recette')).toEqual({ errors: [], warnings: [] });
    const { errors } = checkMakeValues({ MAKE_WEBHOOK_SECRET: 'x' }, 'recette');
    expect(errors).toEqual([
      'MAKE_WEBHOOK_SECRET doit rester vide en recette (seule la production alimente Brevo)',
    ]);
    expect(checkMakeValues(make, 'recette').errors).toHaveLength(3);
  });

  it('production: waitlist hook and secret required, diagnostic hook optional', () => {
    expect(checkMakeValues(make, 'production')).toEqual({ errors: [], warnings: [] });
    expect(checkMakeValues({}, 'production').errors).toEqual([
      'MAKE_HOOK_WAITLIST manquant',
      'MAKE_WEBHOOK_SECRET manquant',
    ]);
    const noDiagnostic = checkMakeValues({ ...make, MAKE_HOOK_DIAGNOSTIC: '' }, 'production');
    expect(noDiagnostic.errors).toEqual([]);
    expect(noDiagnostic.warnings).toHaveLength(1);
    expect(
      checkMakeValues({ ...make, MAKE_HOOK_WAITLIST: 'https://evil.example/x' }, 'production')
        .errors,
    ).toHaveLength(1);
  });

  it('never shows a value, only its name and state', () => {
    const lines = describeMakeValues({ ...make, MAKE_HOOK_DIAGNOSTIC: '' }).join('\n');
    expect(lines).toContain('make_hook_waitlist (MAKE_HOOK_WAITLIST) : défini');
    expect(lines).toContain('make_hook_diagnostic (MAKE_HOOK_DIAGNOSTIC) : vide');
    expect(lines).not.toContain('hook.eu1');
    expect(lines).not.toContain('make-secret-value');
  });

  it('writes only the filled values, under their Vault names', () => {
    expect(makeVaultSecrets({ ...make, MAKE_HOOK_DIAGNOSTIC: ' ' })).toEqual({
      make_hook_waitlist: HOOK,
      make_webhook_secret: 'make-secret-value',
    });
  });

  it('Make values are never sent as function secrets', () => {
    expect(
      Object.keys(functionSecrets({ ...good, ...make })).some((k) => k.startsWith('MAKE_')),
    ).toBe(false);
  });
});

describe('JWT verification of the functions', () => {
  const toml = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8');

  it('waitlist functions are deployed without JWT (site, no session)', () => {
    const configured = parseVerifyJwt(toml);
    for (const name of ['waitlist-join', 'waitlist-confirm', 'waitlist-status']) {
      expect(configured[name], name).toBe(false);
    }
    expect(configured['assistant-chat']).toBe(true);
  });

  it('config.toml matches the expected mode of every function', () => {
    expect(checkVerifyJwt(parseVerifyJwt(toml), Object.keys(EXPECTED_VERIFY_JWT))).toEqual([]);
  });

  it('flags a wrong setting and an unknown function', () => {
    const configured = parseVerifyJwt(
      '[functions.waitlist-join]\nverify_jwt = true\n[db]\nverify_jwt = false\n',
    );
    expect(configured).toEqual({ 'waitlist-join': true });
    expect(checkVerifyJwt(configured, ['waitlist-join', 'new-fn'])).toEqual([
      'waitlist-join : verify_jwt doit valoir false dans supabase/config.toml',
      'new-fn : mode JWT attendu non défini (scripts/deploy/plan.ts)',
    ]);
  });
});
