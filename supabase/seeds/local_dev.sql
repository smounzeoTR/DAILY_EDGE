-- LOCAL DEVELOPMENT ONLY (loaded by `supabase db reset`). Never run in production.
-- Production: create these Vault secrets by hand (see CLAUDE.md) with the real
-- project URL and a random secret, also set as the PLANS_BATCH_SECRET function secret.
select vault.create_secret(
  'http://host.docker.internal:54321/functions/v1/generate-plans-batch',
  'plans_batch_url',
  'URL of the generate-plans-batch Edge Function'
);
select vault.create_secret(
  'local-dev-plans-batch-secret',
  'plans_batch_secret',
  'Shared secret checked by generate-plans-batch'
);
