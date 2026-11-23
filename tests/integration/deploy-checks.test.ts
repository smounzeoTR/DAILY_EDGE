// `deploy check` database checks of the waitlist, against the local database.
// Each failing case runs in a transaction that is rolled back.
import { execSync } from 'node:child_process';

import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

import { waitlistDbChecks, type DbCheck } from '../../scripts/deploy/dbChecks.ts';

type Status = { DB_URL: string };
const status = JSON.parse(execSync('supabase status -o json', { encoding: 'utf8' })) as Status;
const sql = postgres(status.DB_URL, { max: 1, onnotice: () => {} });

afterAll(async () => {
  await sql.end();
});

const failed = (checks: DbCheck[]) =>
  checks.filter((c): c is { ok: boolean; text: string } => 'ok' in c && !c.ok).map((c) => c.text);

class Rollback extends Error {}

/** Runs the checks after `setup`, inside a transaction that is always rolled back. */
async function checksAfter(setup: string, target: 'recette' | 'production' = 'recette') {
  let result: DbCheck[] = [];
  await sql
    .begin(async (tx) => {
      await tx.unsafe(setup);
      result = await waitlistDbChecks(tx as unknown as postgres.Sql, target);
      throw new Rollback();
    })
    .catch((err: unknown) => {
      if (!(err instanceof Rollback)) throw err;
    });
  return result;
}

describe('deploy check: waitlist', () => {
  it('passes on the migrated local database', async () => {
    const checks = await waitlistDbChecks(sql, 'recette');
    expect(failed(checks)).toEqual([]);
    const texts = checks.map((c) => ('text' in c ? c.text : c.info));
    expect(texts).toContain('waitlist_entries : RLS active');
    expect(texts).toContain('trigger waitlist_entries_make_webhook (Make) installé et actif');
    expect(texts).toContain('aucun secret Make dans le Vault de recette');
  });

  it('fails when a public access policy exists', async () => {
    const checks = await checksAfter(
      'create policy "public read" on public.waitlist_entries for select to anon using (true)',
    );
    expect(failed(checks)).toEqual(["waitlist_entries : aucune politique d'accès (1)"]);
  });

  it('fails when RLS is disabled or the browser roles get a grant', async () => {
    const checks = await checksAfter(`
      alter table public.waitlist_tokens disable row level security;
      grant select on public.waitlist_entries to authenticated;`);
    expect(failed(checks)).toEqual([
      'waitlist_entries : aucun droit pour anon ni authenticated',
      'waitlist_tokens : RLS active',
    ]);
  });

  it('fails when the Make trigger is missing or disabled', async () => {
    expect(
      failed(
        await checksAfter(
          'alter table public.waitlist_entries disable trigger waitlist_entries_make_webhook',
        ),
      ),
    ).toEqual(['trigger waitlist_entries_make_webhook (Make) installé et actif']);
    expect(
      failed(
        await checksAfter('drop trigger waitlist_entries_make_webhook on public.waitlist_entries'),
      ),
    ).toEqual(['trigger waitlist_entries_make_webhook (Make) installé et actif']);
  });

  it('recette fails with a Make secret in Vault; production does not check it', async () => {
    const setup = "select vault.create_secret('https://hook.eu1.make.com/x', 'make_hook_waitlist')";
    expect(failed(await checksAfter(setup, 'recette'))).toEqual([
      'aucun secret Make dans le Vault de recette (présents : make_hook_waitlist)',
    ]);
    expect(failed(await checksAfter(setup, 'production'))).toEqual([]);
  });

  it('before the migration: information only, no failure', async () => {
    const checks = await checksAfter(
      "delete from supabase_migrations.schema_migrations where version = '20261210090000'",
    );
    expect(failed(checks)).toEqual([]);
    expect(checks).toContainEqual({
      info: 'liste d’attente : migration pas encore appliquée (à vérifier après db)',
    });
  });
});
