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
  // dailyedge.fr waitlist (waitlist-join, waitlist-confirm, waitlist-status)
  'MAILER_PROVIDER',
  'SCW_TEM_REGION',
  'SITE_URL',
  'WAITLIST_FROM',
  // Web diagnostic (diagnostic-submit): store buttons of the result e-mail, hidden while empty
  'APP_STORE_URL',
  'PLAY_STORE_URL',
] as const;

// Every sender of the app and of the site uses this domain (Scaleway TEM)
export const SENDER_DOMAIN = 'auth.dailyedge.fr';
export const PRODUCTION_SITE_URL = 'https://dailyedge.fr';

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
  // Scaleway expects the project ID (a UUID), not the project or organization name
  if (filled(env, 'SCW_PROJECT_ID') && !UUID_PATTERN.test((env.SCW_PROJECT_ID ?? '').trim())) {
    errors.push(
      'SCW_PROJECT_ID doit être l’identifiant du projet Scaleway, au format UUID (console > projet > Settings > Project ID)',
    );
  }
  errors.push(...checkWaitlistSecrets(env, target));
  return errors;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Waitlist functions: real e-mails through Scaleway, site URL used in links and as CORS origin
export function checkWaitlistSecrets(env: Env, target: Target): string[] {
  const errors = missingKeys(env, ['MAILER_PROVIDER', 'SITE_URL', 'WAITLIST_FROM']).map(
    (k) => `${k} manquant (liste d'attente)`,
  );
  if (filled(env, 'MAILER_PROVIDER') && env.MAILER_PROVIDER !== 'scaleway') {
    errors.push('MAILER_PROVIDER doit valoir scaleway hors local');
  }
  if (env.MAILER_PROVIDER === 'scaleway') {
    for (const k of ['SCW_SECRET_KEY', 'SCW_PROJECT_ID', 'SCW_TEM_REGION']) {
      if (!filled(env, k)) errors.push(`${k} manquant (e-mails de la liste d'attente)`);
    }
  }
  for (const k of ['APP_STORE_URL', 'PLAY_STORE_URL']) {
    const value = (env[k] ?? '').trim();
    if (value && !/^https:\/\/\S+$/.test(value)) errors.push(`${k} : URL https attendue (ou vide)`);
  }
  const site = (env.SITE_URL ?? '').trim();
  if (site) {
    if (target === 'production' && site !== PRODUCTION_SITE_URL) {
      errors.push(`SITE_URL doit valoir ${PRODUCTION_SITE_URL} en production`);
    }
    // Recette: the site is built on the Mac (localhost) until it is hosted (lot S5)
    const recetteOk =
      /^https:\/\/[^/]+$/.test(site) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(site);
    if (target === 'recette' && !recetteOk) {
      errors.push('SITE_URL : https://<domaine> ou http://localhost:<port>, sans chemin');
    }
  }
  return errors;
}

/** Senders (connexion, alerts, waitlist) must all be addresses of auth.dailyedge.fr. */
export function checkSenders(env: Env): string[] {
  const errors: string[] = [];
  for (const k of ['SMTP_ADMIN_EMAIL', 'OPS_ALERT_FROM', 'WAITLIST_FROM']) {
    const value = (env[k] ?? '').trim();
    if (value && !value.toLowerCase().endsWith(`@${SENDER_DOMAIN}`)) {
      errors.push(`${k} doit être une adresse @${SENDER_DOMAIN}`);
    }
  }
  return errors;
}

// ---- Make (Brevo synchronisation): Vault values, production only ------------------------
export const MAKE_KEYS = {
  MAKE_HOOK_WAITLIST: 'make_hook_waitlist',
  MAKE_HOOK_DIAGNOSTIC: 'make_hook_diagnostic',
  MAKE_WEBHOOK_SECRET: 'make_webhook_secret',
} as const;

const MAKE_HOOK_PATTERN = /^https:\/\/hook\.[a-z0-9]+\.make\.com\/[A-Za-z0-9]+$/;

/**
 * Only production feeds Brevo: in recette the three values must stay empty.
 * Production: the waitlist hook and the secret are required; the diagnostic hook (lot S3)
 * may stay empty for now (warning).
 */
export function checkMakeValues(
  env: Env,
  target: Target,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (target === 'recette') {
    for (const k of Object.keys(MAKE_KEYS)) {
      if (filled(env, k))
        errors.push(`${k} doit rester vide en recette (seule la production alimente Brevo)`);
    }
    return { errors, warnings };
  }
  for (const k of ['MAKE_HOOK_WAITLIST', 'MAKE_WEBHOOK_SECRET']) {
    if (!filled(env, k)) errors.push(`${k} manquant`);
  }
  for (const k of ['MAKE_HOOK_WAITLIST', 'MAKE_HOOK_DIAGNOSTIC']) {
    if (filled(env, k) && !MAKE_HOOK_PATTERN.test((env[k] ?? '').trim())) {
      errors.push(`${k} : URL de webhook Make attendue (https://hook.<région>.make.com/…)`);
    }
  }
  if (!filled(env, 'MAKE_HOOK_DIAGNOSTIC')) {
    warnings.push(
      'MAKE_HOOK_DIAGNOSTIC vide : les diagnostics du site (mode launch) ne seront pas envoyés à Brevo',
    );
  }
  return { errors, warnings };
}

/** Name and state of each Make value, never the value itself. */
export function describeMakeValues(env: Env): string[] {
  return Object.entries(MAKE_KEYS).map(
    ([k, vault]) => `${vault} (${k}) : ${filled(env, k) ? 'défini' : 'vide'}`,
  );
}

/** Make values to write to Vault (filled ones only; an empty value is never written). */
export function makeVaultSecrets(env: Env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, vault] of Object.entries(MAKE_KEYS)) {
    if (filled(env, k)) out[vault] = (env[k] ?? '').trim();
  }
  return out;
}

// ---- Edge Functions: JWT verification at deployment (supabase/config.toml) ---------------
// Without JWT: called by the site without a session (waitlist) or protected by a server
// secret (batch, alerts). With JWT: called by the signed-in app.
export const EXPECTED_VERIFY_JWT: Record<string, boolean> = {
  'generate-plan': true,
  'generate-review': true,
  'export-my-data': true,
  'assistant-chat': true,
  'generate-plans-batch': false,
  'ops-alert': false,
  'waitlist-join': false,
  'waitlist-confirm': false,
  'waitlist-status': false,
  'diagnostic-submit': false,
  'diagnostic-confirm-marketing': false,
  'altcha-challenge': false,
};

/** verify_jwt of each [functions.<name>] block of config.toml. */
export function parseVerifyJwt(configToml: string): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  let current: string | null = null;
  for (const line of configToml.split('\n')) {
    const header = line.match(/^\s*\[functions\.([A-Za-z0-9_-]+)\]\s*$/);
    if (header) {
      current = header[1] ?? null;
      continue;
    }
    if (/^\s*\[/.test(line)) current = null;
    const setting = line.match(/^\s*verify_jwt\s*=\s*(true|false)\s*$/);
    if (current && setting) out[current] = setting[1] === 'true';
  }
  return out;
}

/** Deployed functions without an expected setting, or configured differently. */
export function checkVerifyJwt(configured: Record<string, boolean>, deployed: string[]): string[] {
  const errors: string[] = [];
  for (const name of deployed) {
    const expected = EXPECTED_VERIFY_JWT[name];
    if (expected === undefined) {
      errors.push(`${name} : mode JWT attendu non défini (scripts/deploy/plan.ts)`);
    } else if (configured[name] !== expected) {
      errors.push(`${name} : verify_jwt doit valoir ${expected} dans supabase/config.toml`);
    }
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
