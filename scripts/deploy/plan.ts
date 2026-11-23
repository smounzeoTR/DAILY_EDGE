// Deployment rules (pure, tested): environment file checks, function secrets, Vault values,
// server settings and auth configuration for the recette and production Supabase projects.
export type Env = Record<string, string | undefined>;
export type Target = 'recette' | 'production';

// Keys of .env.<target> read by the deployment (see .env.deploy.example)
export const PROJECT_KEYS = [
  'SUPABASE_PROJECT_REF',
  'SUPABASE_URL',
  'SUPABASE_DB_URL',
  'SUPABASE_ACCESS_TOKEN',
] as const;
export const AUTH_KEYS = [
  'AUTH_SITE_URL',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_ADMIN_EMAIL',
  'SMTP_SENDER_NAME',
] as const;

// Secrets sent to the Edge Functions (supabase secrets set); nothing else leaves the file
export const FUNCTION_SECRET_KEYS = [
  'PLANS_BATCH_SECRET',
  'LLM_PROVIDER',
  'LLM_MODEL',
  'LLM_ANTHROPIC_EFFORT',
  'LLM_PRICE_IN_EUR_PER_MTOK',
  'LLM_PRICE_OUT_EUR_PER_MTOK',
  'LLM_PRICE_CACHE_READ_EUR_PER_MTOK',
  'LLM_PRICE_CACHE_WRITE_EUR_PER_MTOK',
  'LLM_ASSISTANT_PROVIDER',
  'LLM_ASSISTANT_MODEL',
  'LLM_ASSISTANT_EFFORT',
  'LLM_ASSISTANT_PRICE_IN_EUR_PER_MTOK',
  'LLM_ASSISTANT_PRICE_OUT_EUR_PER_MTOK',
  'LLM_ASSISTANT_PRICE_CACHE_READ_EUR_PER_MTOK',
  'LLM_ASSISTANT_PRICE_CACHE_WRITE_EUR_PER_MTOK',
  'ANTHROPIC_API_KEY',
  'OPS_ALERT_EMAIL_PROVIDER',
  'OPS_ENV_NAME',
  'OPS_ALERT_FROM',
  'OPS_ALERT_TO',
  'SCW_SECRET_KEY',
  'SCW_PROJECT_ID',
  'SCW_REGION',
] as const;

const filled = (env: Env, key: string) => (env[key] ?? '').trim() !== '';

export function missingKeys(env: Env, keys: readonly string[]): string[] {
  return keys.filter((k) => !filled(env, k));
}

export function checkFunctionSecrets(env: Env, target: Target): string[] {
  const errors = missingKeys(env, [
    'PLANS_BATCH_SECRET',
    'LLM_PROVIDER',
    'LLM_ASSISTANT_PROVIDER',
    'OPS_ALERT_EMAIL_PROVIDER',
    'OPS_ENV_NAME',
  ]).map((k) => `${k} manquant`);
  if ((env.PLANS_BATCH_SECRET ?? '').length < 32) {
    errors.push('PLANS_BATCH_SECRET doit faire au moins 32 caractères (openssl rand -hex 32)');
  }
  for (const prefix of ['LLM_', 'LLM_ASSISTANT_']) {
    const provider = env[`${prefix}PROVIDER`];
    if (provider === 'mock') errors.push(`${prefix}PROVIDER=mock interdit hors local`);
    if (provider === 'anthropic') {
      for (const k of ['MODEL', 'PRICE_IN_EUR_PER_MTOK', 'PRICE_OUT_EUR_PER_MTOK']) {
        if (!filled(env, `${prefix}${k}`)) errors.push(`${prefix}${k} manquant`);
      }
      if (!filled(env, 'ANTHROPIC_API_KEY')) errors.push('ANTHROPIC_API_KEY manquant');
    }
  }
  if (env.OPS_ALERT_EMAIL_PROVIDER === 'scaleway') {
    for (const k of ['SCW_SECRET_KEY', 'SCW_PROJECT_ID', 'OPS_ALERT_FROM', 'OPS_ALERT_TO']) {
      if (!filled(env, k)) errors.push(`${k} manquant (alertes par e-mail)`);
    }
  }
  if (filled(env, 'OPS_ENV_NAME') && env.OPS_ENV_NAME !== target) {
    errors.push(`OPS_ENV_NAME doit valoir ${target}`);
  }
  return errors;
}

export function functionSecrets(env: Env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of FUNCTION_SECRET_KEYS) if (filled(env, k)) out[k] = (env[k] ?? '').trim();
  return out;
}

// Vault values read by pg_cron (fallback batch and operations alerts)
export function vaultSecrets(env: Env): Record<string, string> {
  const base = (env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  return {
    plans_batch_url: `${base}/functions/v1/generate-plans-batch`,
    ops_alert_url: `${base}/functions/v1/ops-alert`,
    plans_batch_secret: env.PLANS_BATCH_SECRET ?? '',
  };
}

export type Settings = Record<string, boolean | number | string>;

export function checkSettings(settings: Settings): string[] {
  const errors: string[] = [];
  if (settings.allow_plan_toggle !== false) {
    errors.push('allow_plan_toggle doit valoir false hors local');
  }
  for (const k of [
    'assistant_daily_messages',
    'assistant_monthly_cost_cap_eur',
    'ops_ai_daily_cost_alert_eur',
  ]) {
    if (typeof settings[k] !== 'number' || (settings[k] as number) <= 0) {
      errors.push(`${k} doit être un nombre positif`);
    }
  }
  return errors;
}

export function settingsSql(settings: Settings): string {
  const rows = Object.entries(settings)
    .map(
      ([k, v]) =>
        `('${k.replaceAll("'", "''")}', '${JSON.stringify(v).replaceAll("'", "''")}'::jsonb)`,
    )
    .join(',\n  ');
  return (
    `insert into public.app_settings (key, value) values\n  ${rows}\n` +
    `on conflict (key) do update set value = excluded.value, updated_at = now();`
  );
}

// Supabase Management API auth configuration (PATCH /v1/projects/{ref}/config/auth)
export function authConfig(env: Env, template: string): Record<string, unknown> {
  const subject = 'Ton code Daily Edge · Your Daily Edge code';
  return {
    site_url: env.AUTH_SITE_URL,
    uri_allow_list: env.AUTH_SITE_URL,
    disable_signup: false,
    external_email_enabled: true,
    external_anonymous_users_enabled: false,
    mailer_otp_length: 6,
    mailer_otp_exp: 3600,
    mailer_subjects_magic_link: subject,
    mailer_templates_magic_link_content: template,
    mailer_subjects_confirmation: subject,
    mailer_templates_confirmation_content: template,
    smtp_host: env.SMTP_HOST,
    smtp_port: env.SMTP_PORT,
    smtp_user: env.SMTP_USER,
    smtp_pass: env.SMTP_PASS,
    smtp_admin_email: env.SMTP_ADMIN_EMAIL,
    smtp_sender_name: env.SMTP_SENDER_NAME,
    rate_limit_email_sent: 60,
    mfa_totp_enroll_enabled: true,
    mfa_totp_verify_enabled: true,
  };
}

// Differences between the wanted and the current auth configuration (secrets masked)
export function authDiff(
  wanted: Record<string, unknown>,
  current: Record<string, unknown>,
): string[] {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(wanted)) {
    if (k === 'smtp_pass') {
      lines.push(`  smtp_pass : (secret, toujours renvoyé)`);
      continue;
    }
    if (JSON.stringify(current[k] ?? null) === JSON.stringify(v ?? null)) continue;
    const show = (x: unknown) =>
      typeof x === 'string' && x.length > 60 ? `${x.slice(0, 57)}…` : JSON.stringify(x);
    lines.push(`  ${k} : ${show(current[k])} → ${show(v)}`);
  }
  return lines;
}

// Project region must be in the European Union
export const isEuRegion = (region: string) => /^eu-/.test(region);
