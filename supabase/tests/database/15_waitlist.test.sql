-- dailyedge.fr waitlist (site lot S2): table, closed RLS, confirmation (rank, referral, token),
-- Make webhook trigger. pg_net is simulated: requests are only queued in net.http_request_queue
-- inside this rolled-back transaction, never sent.
begin;
create extension if not exists pgtap with schema extensions;

select plan(39);

-- ---- Table and closed RLS ----------------------------------------------------
select has_table('public', 'waitlist_entries', 'waitlist_entries exists');
select columns_are('public', 'waitlist_entries', array[
  'id', 'email', 'status', 'referral_code', 'referred_by', 'confirmed_referrals', 'rank',
  'utm_source', 'utm_medium', 'utm_campaign', 'landing_path', 'consent_marketing', 'consent_at',
  'confirmed_at', 'created_at', 'locale'
], 'columns are exactly those of the specification (Make contract)');
select ok((select relrowsecurity from pg_class where oid = 'public.waitlist_entries'::regclass),
  'RLS enabled on waitlist_entries');
select ok((select relrowsecurity from pg_class where oid = 'public.waitlist_tokens'::regclass),
  'RLS enabled on waitlist_tokens');
select is((select count(*)::int from pg_policies where tablename in ('waitlist_entries', 'waitlist_tokens')),
  0, 'no policy: nothing is readable or writable from the browser');
select ok(not has_table_privilege('anon', 'public.waitlist_entries', 'select'), 'anon cannot read entries');
select ok(not has_table_privilege('anon', 'public.waitlist_entries', 'insert'), 'anon cannot insert entries');
select ok(not has_table_privilege('authenticated', 'public.waitlist_entries', 'select'),
  'authenticated cannot read entries');
select ok(not has_table_privilege('anon', 'public.waitlist_tokens', 'select'), 'anon cannot read tokens');
select ok(not has_function_privilege('anon', 'public.confirm_waitlist_entry(text)', 'execute'),
  'anon cannot confirm directly');
select ok(not has_function_privilege('authenticated', 'public.confirm_waitlist_entry(text)', 'execute'),
  'authenticated cannot confirm directly');

set local role anon;
select throws_ok($$ select * from public.waitlist_entries $$, '42501', null,
  'anon select refused');
select throws_ok($$ insert into public.waitlist_entries (email, referral_code) values ('x@y.z', 'ABCDEF') $$,
  '42501', null, 'anon insert refused');
reset role;

-- ---- Constraints -------------------------------------------------------------
select throws_ok($$ insert into public.waitlist_entries (email, referral_code) values ('Upper@Example.test', 'AAAAAA') $$,
  '23514', null, 'e-mail must be lower case');
insert into public.waitlist_entries (email, referral_code) values ('dup@example.test', 'DUPDUP');
select throws_ok($$ insert into public.waitlist_entries (email, referral_code) values ('dup@example.test', 'DUPDU2') $$,
  '23505', null, 'e-mail unique');
select throws_ok($$ insert into public.waitlist_entries (email, referral_code) values ('x@example.test', 'abc') $$,
  '23514', null, 'referral code format checked');

-- ---- Rank rule ---------------------------------------------------------------
select is(public.waitlist_rank(37, 0), 37, 'rank = sign-up position');
select is(public.waitlist_rank(37, 2), 17, 'minus 10 per confirmed referral');
select is(public.waitlist_rank(12, 2), 1, 'floor 1');

-- ---- Confirmation ------------------------------------------------------------
-- 3 already confirmed entries, a sponsor (4th), a pending friend referred by the sponsor
insert into public.waitlist_entries (email, referral_code, status, confirmed_at, created_at)
select format('early%s@example.test', i), format('EARLY%s', i), 'confirmed', now(), now() - interval '10 days' + i * interval '1 minute'
from generate_series(2, 4) i;
insert into public.waitlist_entries (email, referral_code, created_at)
values ('sponsor@example.test', 'SPONS2', now() - interval '9 days');
insert into public.waitlist_entries (email, referral_code, referred_by, created_at)
values ('friend@example.test', 'FRND23', 'SPONS2', now() - interval '8 days');
select public.recompute_waitlist_ranks();

create function pg_temp.token(p_email text, p_hash text, p_expires interval default interval '48 hours')
returns void language sql as $$
  insert into public.waitlist_tokens (token_hash, entry_id, kind, expires_at)
  select p_hash, id, 'confirm', now() + p_expires from public.waitlist_entries where email = p_email;
$$;

select pg_temp.token('sponsor@example.test', repeat('a', 64));
select pg_temp.token('friend@example.test', repeat('b', 64));
select pg_temp.token('dup@example.test', repeat('c', 64), interval '-1 second');

select is((select rank from public.confirm_waitlist_entry(repeat('a', 64))), 4,
  'sponsor confirmed: rank = position among confirmed entries');
select is((select status::text from public.waitlist_entries where email = 'sponsor@example.test'),
  'confirmed', 'status confirmed');
select isnt((select confirmed_at from public.waitlist_entries where email = 'sponsor@example.test'),
  null, 'confirmed_at set');
select is((select count(*)::int from public.confirm_waitlist_entry(repeat('a', 64))), 0,
  'a confirm token works only once');
select is((select count(*)::int from public.confirm_waitlist_entry(repeat('c', 64))), 0,
  'an expired token is refused');
select is((select status::text from public.waitlist_entries where email = 'dup@example.test'),
  'pending', 'expired token: entry stays pending');
select is((select count(*)::int from public.confirm_waitlist_entry(repeat('f', 64))), 0,
  'an unknown token is refused');

select is((select rank from public.confirm_waitlist_entry(repeat('b', 64))), 5,
  'friend confirmed after the sponsor: rank 5');
select is((select confirmed_referrals from public.waitlist_entries where email = 'sponsor@example.test'),
  1, 'sponsor credited with one confirmed referral');
select is((select rank from public.waitlist_entries where email = 'sponsor@example.test'),
  1, 'sponsor moved up 10 places (4 - 10, floor 1)');

-- Re-subscription after unsubscribing: the referral never counts twice
update public.waitlist_entries set status = 'unsubscribed' where email = 'friend@example.test';
update public.waitlist_entries set status = 'pending' where email = 'friend@example.test';
select pg_temp.token('friend@example.test', repeat('d', 64));
select is((select status::text from public.confirm_waitlist_entry(repeat('d', 64))), 'confirmed',
  'a re-subscribed entry can confirm again');
select is((select confirmed_referrals from public.waitlist_entries where email = 'sponsor@example.test'),
  1, 'the second confirmation does not credit the sponsor again');

-- ---- Make webhook (pg_net simulated) -----------------------------------------
create temp table q0 as select coalesce(max(id), 0) as id from net.http_request_queue;

-- Without Vault secrets: nothing is queued
insert into public.waitlist_entries (email, referral_code) values ('nohook@example.test', 'NOHOOK');
select pg_temp.token('nohook@example.test', repeat('e', 64));
select public.confirm_waitlist_entry(repeat('e', 64));
select is((select count(*)::int from net.http_request_queue where id > (select id from q0)), 0,
  'no webhook while the Vault secrets are missing');

select vault.create_secret('https://hook.example.test/waitlist', 'make_hook_waitlist');
select vault.create_secret('test-webhook-secret', 'make_webhook_secret');

insert into public.waitlist_entries (email, referral_code, utm_source, utm_medium, utm_campaign)
values ('hook@example.test', 'HOOK23', 'gdiy', 'podcast', 'waitlist');
select pg_temp.token('hook@example.test', repeat('9', 64));
select public.confirm_waitlist_entry(repeat('9', 64));

create temp table sent as
select url, headers, convert_from(body, 'utf8')::jsonb as body
from net.http_request_queue where id > (select id from q0);

select is((select count(*)::int from sent), 1,
  'one webhook on confirmation (rank recomputation sends none)');
select is((select url from sent), 'https://hook.example.test/waitlist', 'URL read from Vault');
select is((select headers ->> 'x-webhook-secret' from sent), 'test-webhook-secret',
  'x-webhook-secret header read from Vault');
select ok((select body ->> 'type' = 'UPDATE' and body ->> 'table' = 'waitlist_entries'
    and body ? 'record' and body ? 'old_record' from sent),
  'Supabase webhook format: type, table, record, old_record');
select ok((select body -> 'record' ->> 'status' = 'confirmed'
    and body -> 'old_record' ->> 'status' = 'pending'
    and body -> 'record' ->> 'email' = 'hook@example.test'
    and body -> 'record' ->> 'referral_code' = 'HOOK23'
    and (body -> 'record' ->> 'rank')::int >= 1
    and body -> 'record' ->> 'utm_source' = 'gdiy'
    and body -> 'record' ->> 'utm_medium' = 'podcast'
    and body -> 'record' ->> 'utm_campaign' = 'waitlist' from sent),
  'record carries the fields read by Make, rank included');
select ok((select not (body -> 'record' ? 'token_hash') from sent), 'no token in the payload');

-- A rank-only update does not call Make
update public.waitlist_entries set rank = rank + 1 where email = 'hook@example.test';
select is((select count(*)::int from net.http_request_queue where id > (select id from q0)), 1,
  'an update without status change sends no webhook');

select * from finish();
rollback;
