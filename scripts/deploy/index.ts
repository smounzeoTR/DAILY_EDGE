// Deployment to the recette and production Supabase projects, one step per command:
//   npm run deploy -- <step> --env recette|production [--apply] [--confirm-production]
// Steps: check, db, functions, secrets, vault, settings, auth, catalog.
// Without --apply every step only shows what it would do. Production writes need
// --confirm-production, and db / functions refuse a version not deployed to recette first
// (fingerprints recorded in deploy/history.json, versioned).
// Values: .env.<env> at the repository root (ignored by git), from .env.deploy.example.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import postgres from 'postgres';

import {
  AUTH_KEYS,
  authConfig,
  authDiff,
  checkFunctionSecrets,
  checkSettings,
  functionSecrets,
  isEuRegion,
  missingKeys,
  PROJECT_KEYS,
  settingsSql,
  vaultSecrets,
  type Env,
  type Settings,
  type Target,
} from './plan.ts';

const root = resolve(import.meta.dirname, '../..');
const STEPS = ['check', 'db', 'functions', 'secrets', 'vault', 'settings', 'auth', 'catalog'];
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    env: { type: 'string' },
    apply: { type: 'boolean', default: false },
    'confirm-production': { type: 'boolean', default: false },
  },
});

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

const step = positionals[0] ?? '';
if (!STEPS.includes(step)) fail(`étape inconnue « ${step} » (${STEPS.join(', ')})`);
const target = values.env as Target;
if (target !== 'recette' && target !== 'production')
  fail('--env doit valoir recette ou production');
const apply = values.apply;
if (target === 'production' && apply && !values['confirm-production']) {
  fail('écriture en production : ajouter --confirm-production (après la recette)');
}

const envFile = resolve(root, `.env.${target}`);
if (!existsSync(envFile)) fail(`${relative(root, envFile)} absent (copier .env.deploy.example)`);
process.loadEnvFile(envFile);
const env: Env = process.env;
const missing = missingKeys(env, PROJECT_KEYS);
if (missing.length > 0) fail(`clés manquantes dans .env.${target} : ${missing.join(', ')}`);
const ref = env.SUPABASE_PROJECT_REF ?? '';

// ---- Helpers ------------------------------------------------------------------------------
function supabase(args: string[], options: { capture?: boolean } = {}) {
  const result = spawnSync('supabase', args, {
    cwd: root,
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: env.SUPABASE_ACCESS_TOKEN },
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.status !== 0) {
    if (options.capture) console.error(result.stderr);
    fail(`supabase ${args[0]} ${args[1] ?? ''} a échoué`);
  }
  return result.stdout ?? '';
}

function db() {
  return postgres(env.SUPABASE_DB_URL ?? '', { max: 1, ssl: 'require', onnotice: () => {} });
}

function files(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return files(path);
      return /\.test\.ts$|\.env/.test(name) ? [] : [path];
    })
    .sort();
}

function fingerprint(dir: string): string {
  const hash = createHash('sha256');
  for (const path of files(resolve(root, dir))) {
    hash.update(relative(root, path));
    hash.update(readFileSync(path));
  }
  return hash.digest('hex').slice(0, 16);
}

const historyFile = resolve(root, 'deploy/history.json');
type History = Record<string, Record<string, { fingerprint: string; at: string; commit: string }>>;
const readHistory = (): History =>
  existsSync(historyFile) ? (JSON.parse(readFileSync(historyFile, 'utf8')) as History) : {};

function record(name: string, print: string) {
  const history = readHistory();
  const commit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).stdout.trim();
  history[target] = {
    ...history[target],
    [name]: { fingerprint: print, at: new Date().toISOString(), commit },
  };
  writeFileSync(historyFile, `${JSON.stringify(history, null, 2)}\n`);
  console.log(`📝 deploy/history.json : ${target}.${name} = ${print} (à committer)`);
}

// Production: the same code must have been deployed to recette first
function requireRecette(name: string, print: string) {
  if (target !== 'production') return;
  const done = readHistory().recette?.[name];
  if (done?.fingerprint !== print) {
    fail(
      `${name} : cette version (${print}) n'a pas été déployée en recette (recette : ${done?.fingerprint ?? 'aucune'})`,
    );
  }
}

function settingsFile(): Settings {
  return JSON.parse(
    readFileSync(resolve(root, `supabase/settings/${target}.json`), 'utf8'),
  ) as Settings;
}

const dryRunNote = () => {
  if (!apply)
    console.log('\nSimulation : rien n’a été écrit. Relancer avec --apply pour appliquer.');
};

// ---- Steps --------------------------------------------------------------------------------
console.log(`Environnement : ${target} (projet ${ref})${apply ? '' : ' — simulation'}\n`);

if (step === 'check') {
  let problems = 0;
  const report = (ok: boolean, text: string) => {
    if (!ok) problems += 1;
    console.log(`${ok ? '✅' : '❌'} ${text}`);
  };
  // JSON shape of `projects list` may vary between CLI versions: array or { projects: [...] }
  type Project = { id?: string; ref?: string; region?: string; name?: string };
  const listed = JSON.parse(
    supabase(['projects', 'list', '--output-format', 'json'], { capture: true }),
  ) as Project[] | { projects?: Project[] };
  const projects = Array.isArray(listed) ? listed : (listed.projects ?? []);
  const project = projects.find((p) => (p.ref ?? p.id) === ref);
  report(Boolean(project), `projet ${ref} accessible avec le jeton`);
  if (project)
    report(isEuRegion(project.region ?? ''), `région ${project.region} dans l'Union européenne`);
  report(missingKeys(env, AUTH_KEYS).length === 0, `configuration auth et SMTP renseignée`);
  const secretErrors = checkFunctionSecrets(env, target);
  report(
    secretErrors.length === 0,
    `secrets des fonctions complets${secretErrors.length ? ` : ${secretErrors.join(' ; ')}` : ''}`,
  );
  const settingErrors = checkSettings(settingsFile());
  report(
    settingErrors.length === 0,
    `réglages supabase/settings/${target}.json${settingErrors.length ? ` : ${settingErrors.join(' ; ')}` : ''}`,
  );

  const sql = db();
  try {
    const extensions = (await sql`select extname from pg_extension`).map(
      (r) => r.extname as string,
    );
    for (const name of ['pg_cron', 'pg_net', 'supabase_vault']) {
      report(
        extensions.includes(name) || name !== 'supabase_vault',
        `extension ${name} ${extensions.includes(name) ? 'présente' : 'absente (créée par les migrations)'}`,
      );
    }
    const demoRows =
      await sql`select count(*)::int as demo from auth.users where email like '%@daily-edge.local'`;
    const demo = Number(demoRows[0]?.demo ?? 0);
    report(demo === 0, `aucun compte de démonstration (${demo})`);
    const toggle = await sql`select to_regclass('public.app_settings') is not null as exists`;
    if (toggle[0]?.exists) {
      const [row] =
        await sql`select value from public.app_settings where key = 'allow_plan_toggle'`;
      report(row === undefined || row.value === false, `interrupteur premium désactivé`);
    }
  } finally {
    await sql.end();
  }
  console.log('\nMigrations (local / distant) :');
  supabase(['migration', 'list', `--remote=${env.SUPABASE_DB_URL ?? ''}`]);
  if (problems > 0) fail(`${problems} point(s) à corriger`);
  console.log('\n✅ Prêt pour le déploiement.');
}

if (step === 'db') {
  const print = fingerprint('supabase/migrations');
  requireRecette('db', print);
  supabase(['db', 'push', `--remote=${env.SUPABASE_DB_URL ?? ''}`, '--dry-run']);
  if (apply) {
    supabase(['db', 'push', `--remote=${env.SUPABASE_DB_URL ?? ''}`, '--yes']);
    record('db', print);
    console.log('Penser à `npm run gen:types` si le schéma a changé (déjà fait en local).');
  }
  dryRunNote();
}

if (step === 'functions') {
  const print = fingerprint('supabase/functions');
  requireRecette('functions', print);
  const names = readdirSync(resolve(root, 'supabase/functions')).filter(
    (n) =>
      !n.startsWith('_') &&
      !n.startsWith('.') &&
      existsSync(resolve(root, 'supabase/functions', n, 'index.ts')),
  );
  console.log(`Fonctions : ${names.join(', ')} (empreinte ${print})`);
  if (apply) {
    supabase(['functions', 'deploy', `--remote=${ref}`, '--use-api', '--yes']);
    record('functions', print);
  }
  dryRunNote();
}

if (step === 'secrets') {
  const errors = checkFunctionSecrets(env, target);
  if (errors.length > 0) fail(errors.join(' ; '));
  const secrets = functionSecrets(env);
  console.log(`Secrets envoyés (noms seulement) : ${Object.keys(secrets).join(', ')}`);
  if (apply) {
    const dir = mkdtempSync(join(tmpdir(), 'daily-edge-secrets-'));
    const file = join(dir, 'secrets.env');
    try {
      writeFileSync(
        file,
        Object.entries(secrets)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n'),
      );
      chmodSync(file, 0o600);
      supabase(['secrets', 'set', `--remote=${ref}`, '--env-file', file, '--yes']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  dryRunNote();
}

if (step === 'vault') {
  const wanted = vaultSecrets(env);
  if ((wanted.plans_batch_secret ?? '').length < 32)
    fail('PLANS_BATCH_SECRET manquant ou trop court');
  console.log(`Vault : plans_batch_url = ${wanted.plans_batch_url}`);
  console.log(`Vault : ops_alert_url = ${wanted.ops_alert_url}`);
  console.log('Vault : plans_batch_secret = (secret, identique à PLANS_BATCH_SECRET)');
  if (apply) {
    const sql = db();
    try {
      for (const [name, value] of Object.entries(wanted)) {
        const [existing] = await sql`select id from vault.secrets where name = ${name}`;
        if (existing) await sql`select vault.update_secret(${existing.id}, ${value})`;
        else await sql`select vault.create_secret(${value}, ${name})`;
      }
      console.log('✅ Vault à jour.');
    } finally {
      await sql.end();
    }
  }
  dryRunNote();
}

if (step === 'settings') {
  const settings = settingsFile();
  const errors = checkSettings(settings);
  if (errors.length > 0) fail(errors.join(' ; '));
  console.log(settingsSql(settings));
  if (apply) {
    const sql = db();
    try {
      await sql.unsafe(settingsSql(settings));
      console.log('✅ Réglages appliqués.');
    } finally {
      await sql.end();
    }
  }
  dryRunNote();
}

if (step === 'auth') {
  const missingAuth = missingKeys(env, AUTH_KEYS);
  if (missingAuth.length > 0) fail(`clés manquantes : ${missingAuth.join(', ')}`);
  const template = readFileSync(resolve(root, 'supabase/templates/otp_code.html'), 'utf8');
  const wanted = authConfig(env, template);
  const api = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
  const headers = {
    Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };
  const current = await fetch(api, { headers });
  if (!current.ok)
    fail(`lecture de la configuration auth : ${current.status} ${await current.text()}`);
  const lines = authDiff(wanted, (await current.json()) as Record<string, unknown>);
  console.log(
    lines.length > 0 ? `Changements :\n${lines.join('\n')}` : 'Configuration auth déjà à jour.',
  );
  if (apply) {
    const res = await fetch(api, { method: 'PATCH', headers, body: JSON.stringify(wanted) });
    if (!res.ok) fail(`mise à jour auth : ${res.status} ${await res.text()}`);
    console.log('✅ Configuration auth à jour (modèle d’e-mail, SMTP, MFA TOTP, URL du site).');
  }
  dryRunNote();
}

if (step === 'catalog') {
  const args = ['scripts/import-catalog/index.ts', '--target', target];
  if (apply) args.push('--apply');
  if (values['confirm-production']) args.push('--confirm-production');
  const result = spawnSync('node', args, { cwd: root, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
