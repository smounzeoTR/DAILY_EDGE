import { describe, expect, it } from 'vitest';

import {
  authDiff,
  checkFunctionSecrets,
  checkSettings,
  functionSecrets,
  isEuRegion,
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
  OPS_ALERT_FROM: 'alertes@dailyedge.trasenel.com',
  OPS_ALERT_TO: 'ops@example.test',
  SCW_SECRET_KEY: 'scw',
  SCW_PROJECT_ID: 'p',
  SUPABASE_DB_URL: 'never sent',
};

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
