-- Anti-abuse of the site (lot S4): closed tables, rate limits on a hashed IP with a salt of the
-- day destroyed every day, hits purged after 48 h, ALTCHA ids used once, waitlist e-mails limited.
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- ---- Closed tables ---------------------------------------------------------------
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('rate_limit_salts', 'rate_limit_hits',
    'altcha_used_challenges', 'waitlist_email_sends') and c.relrowsecurity), 4, 'RLS enabled on the 4 tables');
select is((select count(*)::int from pg_policies where tablename in ('rate_limit_salts', 'rate_limit_hits',
  'altcha_used_challenges', 'waitlist_email_sends')), 0, 'no policy');
select ok(not has_table_privilege('anon', 'public.rate_limit_hits', 'select'), 'anon cannot read the hits');
select ok(not has_table_privilege('service_role', 'public.rate_limit_salts', 'select'),
  'the salts are not readable by the Edge Functions (service role)');
select ok(not has_function_privilege('anon', 'public.site_rate_limit(text, text, jsonb)', 'execute'),
  'anon cannot call the rate limit');

-- ---- Rate limit --------------------------------------------------------------------
delete from public.rate_limit_hits;
delete from public.rate_limit_salts;
select is(public.site_rate_limit('test', '192.0.2.1', '[{"max": 2, "seconds": 600}]'), true, 'first hit allowed');
select is(public.site_rate_limit('test', '192.0.2.1', '[{"max": 2, "seconds": 600}]'), true, 'second hit allowed');
select is(public.site_rate_limit('test', '192.0.2.1', '[{"max": 2, "seconds": 600}]'), false, 'third hit refused');
select is((select count(*)::int from public.rate_limit_hits), 2, 'a refused hit is not recorded');
select is(public.site_rate_limit('test', '192.0.2.2', '[{"max": 2, "seconds": 600}]'), true,
  'another IP has its own counter');
select is(public.site_rate_limit('other', '192.0.2.1', '[{"max": 2, "seconds": 600}]'), true,
  'another action has its own counter');
select is((select count(*)::int from public.rate_limit_hits where ip_hash !~ '^[0-9a-f]{64}$'), 0,
  'only hashes are stored');
select is((select count(*)::int from public.rate_limit_salts), 1, 'one salt for the day, created on demand');

-- The hash depends on the salt of the day: tomorrow, the same IP gives another hash
create temp table h1 as select ip_hash from public.rate_limit_hits where action = 'other';
update public.rate_limit_salts set salt = extensions.gen_random_bytes(32);
delete from public.rate_limit_hits where action = 'other';
select public.site_rate_limit('other', '192.0.2.1', '[{"max": 2, "seconds": 600}]');
select isnt((select ip_hash from public.rate_limit_hits where action = 'other'), (select ip_hash from h1),
  'a new salt gives a new hash for the same IP');

-- Several windows: the daily one applies too
delete from public.rate_limit_hits;
insert into public.rate_limit_hits (action, ip_hash, created_at)
select 'daily', encode(extensions.digest((select salt from public.rate_limit_salts) || convert_to('192.0.2.9', 'UTF8'), 'sha256'), 'hex'),
  now() - interval '2 hours' from generate_series(1, 3);
select is(public.site_rate_limit('daily', '192.0.2.9', '[{"max": 10, "seconds": 600}, {"max": 3, "seconds": 86400}]'),
  false, 'the daily window refuses even when the short one allows');

-- ---- Daily purge -----------------------------------------------------------------------
insert into public.rate_limit_salts (day) values ((now() at time zone 'utc')::date - 1);
insert into public.rate_limit_hits (action, ip_hash, created_at)
values ('old', repeat('a', 64), now() - interval '49 hours');
select public.purge_site_abuse_data();
select is((select count(*)::int from public.rate_limit_salts where day < (now() at time zone 'utc')::date), 0,
  'the salt of a past day is destroyed');
select is((select count(*)::int from public.rate_limit_hits where action = 'old'), 0, 'hits older than 48 h deleted');
select ok((select count(*) from cron.job where jobname = 'purge-site-abuse-data') = 1, 'hourly purge scheduled');

-- ---- ALTCHA anti-replay ------------------------------------------------------------------
select is(public.altcha_mark_used('challenge-1', now() + interval '10 minutes'), true, 'first use accepted');
select is(public.altcha_mark_used('challenge-1', now() + interval '10 minutes'), false, 'replay refused');

-- ---- Waitlist: 3 e-mails per address per 24 h ----------------------------------------------
insert into public.waitlist_entries (email, referral_code) values ('limit@example.test', 'LIMIT2');
select public.waitlist_reserve_email(id) from public.waitlist_entries where email = 'limit@example.test';
select public.waitlist_reserve_email(id) from public.waitlist_entries where email = 'limit@example.test';
select is((select public.waitlist_reserve_email(id) from public.waitlist_entries where email = 'limit@example.test'),
  true, 'third e-mail allowed');
select is((select public.waitlist_reserve_email(id) from public.waitlist_entries where email = 'limit@example.test'),
  false, 'fourth e-mail within 24 h refused');

select * from finish();
rollback;
