-- dailyedge.fr web diagnostic (site lot S3a): table and closed RLS, one unclaimed diagnostic per
-- address, one result e-mail per address per 24 h, marketing consent confirmation (single use,
-- 48 h), Make webhook only when the consent becomes confirmed, 90-day purge.
-- pg_net is simulated: requests are only queued in this rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;

select plan(39);

-- ---- Table and closed RLS ----------------------------------------------------
select columns_are('public', 'web_diagnostics', array[
  'id', 'email', 'answers', 'profile', 'recommended_program_id', 'consent_marketing',
  'marketing_confirmed_at', 'utm_source', 'utm_medium', 'utm_campaign', 'landing_path',
  'referral_code', 'locale', 'claimed_by_user_id', 'result_email_sent_at', 'created_at',
  'updated_at', 'expires_at'
], 'columns of the specification (§ 7) plus the consent confirmation and the e-mail limit');
select ok((select relrowsecurity from pg_class where oid = 'public.web_diagnostics'::regclass),
  'RLS enabled on web_diagnostics');
select ok((select relrowsecurity from pg_class where oid = 'public.web_diagnostic_tokens'::regclass),
  'RLS enabled on web_diagnostic_tokens');
select is((select count(*)::int from pg_policies where tablename in ('web_diagnostics', 'web_diagnostic_tokens')),
  0, 'no policy');
select ok(not has_table_privilege('anon', 'public.web_diagnostics', 'select, insert, update, delete'),
  'anon has no right');
select ok(not has_table_privilege('authenticated', 'public.web_diagnostics', 'select, insert, update, delete'),
  'authenticated has no right');
select ok(not has_function_privilege('anon', 'public.confirm_diagnostic_marketing(text)', 'execute'),
  'anon cannot confirm directly');
select ok(not has_function_privilege('anon',
  'public.save_web_diagnostic(text, jsonb, text, text, boolean, text, text, text, text, text, text, text)', 'execute'),
  'anon cannot save directly');

set local role anon;
select throws_ok($$ select * from public.web_diagnostics $$, '42501', null, 'anon select refused');
reset role;

select throws_ok($$ insert into public.web_diagnostics (email, answers, profile, recommended_program_id, marketing_confirmed_at)
  values ('x@example.test', '{}', 'reveur', 'PR1', now()) $$,
  '23514', null, 'a confirmed marketing consent requires the consent');

-- ---- Save: one unclaimed diagnostic per address, e-mail limit -------------------
create function pg_temp.save(p_email text, p_consent boolean, p_hash text, p_program text default 'PR1')
returns table (diagnostic_id uuid, send_email boolean, marketing_pending boolean)
language sql as $$
  select * from public.save_web_diagnostic(p_email, '{"domain":"clarity_goals"}', 'reveur', p_program,
    p_consent, 'gdiy', 'podcast', 'launch', '/gdiy', null, 'fr', p_hash);
$$;

create temp table first as select * from pg_temp.save('a@example.test', true, repeat('a', 64));
select is((select send_email from first), true, 'first diagnostic: the result e-mail is sent');
select is((select marketing_pending from first), true, 'consent given: confirmation pending');
select is((select count(*)::int from public.web_diagnostic_tokens where diagnostic_id = (select diagnostic_id from first)),
  1, 'a confirmation token is stored (hash)');
select isnt((select result_email_sent_at from public.web_diagnostics where email = 'a@example.test'),
  null, 'the send is reserved');
select ok((select expires_at between now() + interval '89 days' and now() + interval '91 days'
  from public.web_diagnostics where email = 'a@example.test'), 'expires after 90 days');

create temp table second as select * from pg_temp.save('a@example.test', true, repeat('b', 64), 'PR4');
select is((select diagnostic_id from second), (select diagnostic_id from first),
  'a new diagnostic replaces the unclaimed one of the address');
select is((select recommended_program_id from public.web_diagnostics where email = 'a@example.test'),
  'PR4', 'answers and result replaced');
select is((select send_email from second), false, 'second within 24 h: no e-mail');
select is((select count(*)::int from public.web_diagnostic_tokens where token_hash = repeat('b', 64)),
  0, 'no new token without an e-mail');
select is((select count(*)::int from public.web_diagnostics where email = 'a@example.test'),
  1, 'still one diagnostic for the address');

-- 24 hours later: a new e-mail, the previous link replaced
update public.web_diagnostics set result_email_sent_at = now() - interval '25 hours' where email = 'a@example.test';
create temp table third as select * from pg_temp.save('a@example.test', true, repeat('c', 64));
select is((select send_email from third), true, 'after 24 h: a new e-mail');
select isnt((select used_at from public.web_diagnostic_tokens where token_hash = repeat('a', 64)),
  null, 'the previous confirmation link no longer works');

-- Release after a failed send
select public.release_web_diagnostic_email((select diagnostic_id from third));
select is((select result_email_sent_at from public.web_diagnostics where email = 'a@example.test'),
  null, 'a failed send releases the reservation');
select is((select send_email from pg_temp.save('a@example.test', true, repeat('d', 64))), true,
  'so a new attempt can send the e-mail');

-- ---- Marketing confirmation and Make webhook -------------------------------------
create temp table q0 as select coalesce(max(id), 0) as id from net.http_request_queue;
select vault.create_secret('https://hook.eu1.make.com/diagnostic-test', 'make_hook_diagnostic');
select vault.create_secret('test-webhook-secret', 'make_webhook_secret');
delete from public.make_webhook_requests;

select is(public.confirm_diagnostic_marketing(repeat('f', 64)), false, 'unknown token refused');
select is(public.confirm_diagnostic_marketing(repeat('d', 64)), true, 'valid token: consent confirmed');
select isnt((select marketing_confirmed_at from public.web_diagnostics where email = 'a@example.test'),
  null, 'marketing_confirmed_at set');
select is(public.confirm_diagnostic_marketing(repeat('d', 64)), false, 'the link works only once');

create temp table sent as
select url, headers, convert_from(body, 'utf8')::jsonb as body
from net.http_request_queue where id > (select id from q0);
select is((select count(*)::int from sent), 1, 'one webhook when the consent becomes confirmed');
select is((select url from sent), 'https://hook.eu1.make.com/diagnostic-test', 'URL read from Vault');
select ok((select body ->> 'type' = 'UPDATE' and body ->> 'table' = 'web_diagnostics'
    and body -> 'record' ->> 'consent_marketing' = 'true'
    and body -> 'record' ->> 'marketing_confirmed_at' is not null
    and body -> 'old_record' ->> 'marketing_confirmed_at' is null
    and body -> 'record' ->> 'email' = 'a@example.test'
    and body -> 'record' ->> 'profile' = 'reveur'
    and body -> 'record' ->> 'recommended_program_id' is not null
    and body -> 'record' ->> 'utm_source' = 'gdiy' from sent),
  'payload: the fields read by Make, consent confirmed now and not before');
select is((select headers ->> 'x-webhook-secret' from sent), 'test-webhook-secret', 'secret header');
select is((select count(*)::int from public.make_webhook_requests where source_table = 'web_diagnostics'),
  1, 'request recorded for the ops-checks alert');

-- Another update (new diagnostic, already confirmed): no second webhook; consent kept
update public.web_diagnostics set result_email_sent_at = null where email = 'a@example.test';
select pg_temp.save('a@example.test', false, null);
select is((select count(*)::int from net.http_request_queue where id > (select id from q0)), 1,
  'no second webhook for an already confirmed consent');
select is((select consent_marketing from public.web_diagnostics where email = 'a@example.test'), true,
  'a confirmed consent stays');

-- Without consent: the token never confirms anything
select pg_temp.save('nocons@example.test', false, repeat('e', 64));
select is((select count(*)::int from public.web_diagnostic_tokens t join public.web_diagnostics d on d.id = t.diagnostic_id
  where d.email = 'nocons@example.test'), 0, 'no consent: no confirmation token');

-- Expired token
select pg_temp.save('late@example.test', true, repeat('7', 64));
update public.web_diagnostic_tokens set expires_at = now() - interval '1 second' where token_hash = repeat('7', 64);
select is(public.confirm_diagnostic_marketing(repeat('7', 64)), false, 'expired token (48 h) refused');

-- ---- Purge after 90 days (unclaimed only) ----------------------------------------
update public.web_diagnostics set expires_at = now() - interval '1 day' where email in ('late@example.test', 'nocons@example.test');
select is(public.purge_web_diagnostics(), 2, 'expired unclaimed diagnostics deleted');
select is((select count(*)::int from public.web_diagnostic_tokens where token_hash = repeat('7', 64)),
  0, 'their tokens go with them');

select * from finish();
rollback;
