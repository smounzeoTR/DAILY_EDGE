-- Make webhook of the waitlist, hardened: nothing sent and no error when Vault is absent or empty,
-- any exception caught (the confirmation always succeeds), requests recorded, alert raised by
-- ops-checks for non-2xx answers from Make. pg_net is simulated (rolled-back transaction).
begin;
create extension if not exists pgtap with schema extensions;

select plan(21);

create function pg_temp.pending(p_email text, p_hash text) returns void language sql as $$
  insert into public.waitlist_entries (email, referral_code)
  values (p_email, translate(upper(substr(md5(p_email), 1, 6)), '01', 'AB'));
  insert into public.waitlist_tokens (token_hash, entry_id, kind, expires_at)
  select p_hash, id, 'confirm', now() + interval '48 hours'
  from public.waitlist_entries where email = p_email;
$$;

create temp table q0 as select coalesce(max(id), 0) as id from net.http_request_queue;

create function pg_temp.queued() returns integer language sql as $$
  select count(*)::integer from net.http_request_queue where id > (select id from q0);
$$;

create function pg_temp.set_secret(p_name text, p_value text) returns void language plpgsql as $$
begin
  delete from vault.secrets where name = p_name;
  if p_value is not null then
    perform vault.create_secret(p_value, p_name);
  end if;
end;
$$;

delete from vault.secrets where name in ('make_hook_waitlist', 'make_webhook_secret');

-- ---- Absent from Vault ---------------------------------------------------------
select pg_temp.pending('absent@example.test', repeat('1', 64));
select lives_ok($$ select public.confirm_waitlist_entry(repeat('1', 64)) $$,
  'Vault absent: the confirmation raises no error');
select is((select status::text from public.waitlist_entries where email = 'absent@example.test'),
  'confirmed', 'Vault absent: entry confirmed');
select is(pg_temp.queued(), 0, 'Vault absent: nothing sent');

-- ---- Empty values ----------------------------------------------------------------
select pg_temp.set_secret('make_hook_waitlist', '');
select pg_temp.set_secret('make_webhook_secret', 'test-secret');
select pg_temp.pending('empty-url@example.test', repeat('2', 64));
select lives_ok($$ select public.confirm_waitlist_entry(repeat('2', 64)) $$,
  'empty URL: no error');
select is((select status::text from public.waitlist_entries where email = 'empty-url@example.test'),
  'confirmed', 'empty URL: entry confirmed');
select is(pg_temp.queued(), 0, 'empty URL: nothing sent');

select pg_temp.set_secret('make_hook_waitlist', '   ');
select pg_temp.pending('blank-url@example.test', repeat('3', 64));
select lives_ok($$ select public.confirm_waitlist_entry(repeat('3', 64)) $$,
  'blank URL: no error');
select is(pg_temp.queued(), 0, 'blank URL: nothing sent');

-- URL present, secret missing
select pg_temp.set_secret('make_hook_waitlist', 'https://hook.eu1.make.com/test-hook');
select pg_temp.set_secret('make_webhook_secret', null);
select pg_temp.pending('no-secret@example.test', repeat('4', 64));
select lives_ok($$ select public.confirm_waitlist_entry(repeat('4', 64)) $$,
  'secret missing: no error');
select is(pg_temp.queued(), 0, 'secret missing: nothing sent');

-- ---- Any exception is caught -----------------------------------------------------
select pg_temp.set_secret('make_webhook_secret', 'test-secret');
-- The next request id is already taken in make_webhook_requests: the insert fails inside the trigger
insert into public.make_webhook_requests (request_id, source_table, url_host)
select nextval('net.http_request_queue_id_seq') + 1, 'waitlist_entries', 'taken';
select pg_temp.pending('exception@example.test', repeat('5', 64));
select lives_ok($$ select public.confirm_waitlist_entry(repeat('5', 64)) $$,
  'an exception in the webhook never reaches the confirmation');
select is((select status::text from public.waitlist_entries where email = 'exception@example.test'),
  'confirmed', 'exception: entry still confirmed');
select is(pg_temp.queued(), 0, 'exception: the partial webhook work is rolled back');

-- ---- Configured: one request, recorded -------------------------------------------
delete from public.make_webhook_requests;
select pg_temp.pending('ok@example.test', repeat('6', 64));
select public.confirm_waitlist_entry(repeat('6', 64));
select is(pg_temp.queued(), 1, 'configured: one webhook queued');
select is((select count(*)::int from public.make_webhook_requests), 1, 'request recorded');
select is((select url_host from public.make_webhook_requests), 'hook.eu1.make.com',
  'host recorded, never the full URL');
select ok((select request_id = (select max(id) from net.http_request_queue) from public.make_webhook_requests),
  'recorded id is the pg_net request id');

-- ---- ops-checks: failed Make webhooks --------------------------------------------
delete from public.ops_alerts;
delete from public.make_webhook_requests;
-- Keep the batch alerts out of the way
insert into public.ops_batch_runs (started_at, ok) values (now(), true);
insert into public.make_webhook_requests (request_id, source_table, url_host, created_at) values
  (-1, 'waitlist_entries', 'hook.eu1.make.com', now() - interval '1 hour'),
  (-2, 'waitlist_entries', 'hook.eu1.make.com', now() - interval '2 hours'),
  (-3, 'waitlist_entries', 'hook.eu1.make.com', now() - interval '3 hours'),
  (-4, 'waitlist_entries', 'example.test', now() - interval '1 hour'),
  (-5, 'waitlist_entries', 'hook.eu1.make.com', now() - interval '30 hours');
insert into net._http_response (id, status_code, timed_out, error_msg) values
  (-1, 200, false, null),
  (-2, 401, false, null),
  (-3, null, true, 'Timeout was reached'),
  (-4, 500, false, null),
  (-5, 500, false, null);

select is(public.check_ops_alerts(now()), 1, 'non-2xx answers from Make raise one alert');
select is((select (detail ->> 'failed')::int from public.ops_alerts where kind = 'make_webhook_failed'),
  2, 'counts the failures of the last 24 h to Make only (401 and timeout)');
select is((select detail -> 'statuses' from public.ops_alerts where kind = 'make_webhook_failed'),
  '["401", "erreur"]'::jsonb, 'statuses listed');

delete from public.ops_alerts;
delete from net._http_response where id in (-2, -3);
select is(public.check_ops_alerts(now()), 0, 'only 2xx answers: no alert');

select * from finish();
rollback;
