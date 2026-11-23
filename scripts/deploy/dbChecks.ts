// Database checks of `deploy check` for the dailyedge.fr waitlist (read only).
// Tested against the local stack in tests/integration/deploy-checks.test.ts.
import type { Sql } from 'postgres';

import { MAKE_KEYS, type Target } from './plan.ts';

// Migrations of the waitlist (site lot S2) and of the web diagnostic (S3a): their checks apply
// once they are on the project
export const WAITLIST_MIGRATION = '20261210090000';
export const DIAGNOSTIC_MIGRATION = '20261212090000';

const SITE_FEATURES = [
  {
    name: 'liste d’attente',
    migration: WAITLIST_MIGRATION,
    tables: ['waitlist_entries', 'waitlist_tokens'],
    trigger: { table: 'waitlist_entries', name: 'waitlist_entries_make_webhook' },
  },
  {
    name: 'diagnostic',
    migration: DIAGNOSTIC_MIGRATION,
    tables: ['web_diagnostics', 'web_diagnostic_tokens'],
    trigger: { table: 'web_diagnostics', name: 'web_diagnostics_make_webhook' },
  },
] as const;

export type DbCheck = { ok: boolean; text: string } | { info: string };

export async function waitlistDbChecks(sql: Sql, target: Target): Promise<DbCheck[]> {
  const checks: DbCheck[] = [];
  const [migrations] =
    await sql`select to_regclass('supabase_migrations.schema_migrations') is not null as exists`;
  const appliedVersions = migrations?.exists
    ? new Set(
        (
          await sql`select version from supabase_migrations.schema_migrations where version = any(${SITE_FEATURES.map((f) => f.migration)})`
        ).map((r) => r.version as string),
      )
    : new Set<string>();

  for (const feature of SITE_FEATURES) {
    if (!appliedVersions.has(feature.migration)) {
      checks.push({
        info: `${feature.name} : migration pas encore appliquée (à vérifier après db)`,
      });
      continue;
    }
    for (const table of feature.tables) {
      const [t] = await sql`
        select c.relrowsecurity as rls,
               (select count(*)::int from pg_policies p
                where p.schemaname = 'public' and p.tablename = ${table}) as policies,
               has_table_privilege('anon', c.oid, 'select, insert, update, delete') as anon,
               has_table_privilege('authenticated', c.oid, 'select, insert, update, delete') as auth
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = ${table} and c.relkind = 'r'`;
      checks.push({ ok: Boolean(t), text: `table ${table} présente` });
      if (t) {
        checks.push({ ok: t.rls === true, text: `${table} : RLS active` });
        checks.push({
          ok: t.policies === 0,
          text: `${table} : aucune politique d'accès (${t.policies})`,
        });
        checks.push({
          ok: !t.anon && !t.auth,
          text: `${table} : aucun droit pour anon ni authenticated`,
        });
      }
    }
    const [trigger] = await sql`
      select t.tgenabled <> 'D' as enabled
      from pg_trigger t
      where t.tgrelid = to_regclass(${`public.${feature.trigger.table}`})
        and t.tgname = ${feature.trigger.name} and not t.tgisinternal`;
    checks.push({
      ok: Boolean(trigger?.enabled),
      text: `trigger ${feature.trigger.name} (Make) installé et actif`,
    });
  }

  // Recette never feeds Brevo: no Make value in its Vault
  if (target === 'recette') {
    const [vault] = await sql`select to_regclass('vault.secrets') is not null as exists`;
    if (vault?.exists) {
      const rows =
        await sql`select name from vault.secrets where name = any(${Object.values(MAKE_KEYS)})`;
      checks.push({
        ok: rows.length === 0,
        text: `aucun secret Make dans le Vault de recette${rows.length ? ` (présents : ${rows.map((r) => r.name as string).join(', ')})` : ''}`,
      });
    }
  }
  return checks;
}
