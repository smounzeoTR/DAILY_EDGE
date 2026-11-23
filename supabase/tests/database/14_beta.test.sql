-- Lot 10b: adult confirmation, feedback, premium granted by an admin (aal2, audited),
-- operations alerts and beta metrics.
begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000b1', 'b1@example.test', '{"timezone":"Europe/Paris"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'b2@example.test', '{"timezone":"Europe/Paris"}'),
  ('00000000-0000-0000-0000-0000000000b9', 'admin-b9@example.test', '{"timezone":"Europe/Paris"}');
update public.profiles set role = 'admin' where user_id = '00000000-0000-0000-0000-0000000000b9';
create temp table d as select (now() at time zone 'Europe/Paris')::date as today;
grant select on d to authenticated;

create function pg_temp.as_user(p_id text, p_aal text default 'aal1') returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;

-- ---- Adult confirmation ------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select throws_ok(
  $$ select public.complete_onboarding('Goal', 'PR1',
       '[{"template_id":"H01"},{"template_id":"H02"},{"template_id":"H03"}]') $$,
  '22023', 'adult_confirmation_required', 'onboarding refused without the 18+ confirmation');
select isnt(public.confirm_adult_age(), null, 'the user confirms being 18 or older');
select lives_ok(
  $$ select public.complete_onboarding('Goal', 'PR1',
       '[{"template_id":"H01"},{"template_id":"H02"},{"template_id":"H03"}]') $$,
  'onboarding accepted after the confirmation');
reset role;
select is((select adult_confirmed_at is not null from public.profiles
           where user_id = '00000000-0000-0000-0000-0000000000b1'), true, 'confirmation stored');
-- Server-side writes (service role: seeds, scripts) are not concerned
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok(
  $$ update public.profiles set onboarded_at = now()
     where user_id = '00000000-0000-0000-0000-0000000000b2' $$,
  'service writes can onboard without the confirmation');

-- ---- Feedback ----------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
set local role authenticated;
select lives_ok(
  $$ insert into public.feedback (body, app_version, build, platform, locale)
     values ('Super idée', '1.0.0', '3', 'ios', 'fr') $$,
  'a user sends feedback');
select throws_ok(
  $$ insert into public.feedback (user_id, body, app_version, platform, locale)
     values ('00000000-0000-0000-0000-0000000000b2', 'x', '1.0.0', 'ios', 'fr') $$,
  '42501', null, 'cannot send feedback as someone else');
select throws_ok(
  $$ insert into public.feedback (body, app_version, platform, locale)
     values ('   ', '1.0.0', 'ios', 'fr') $$,
  '23514', null, 'empty feedback refused');
select is((select count(*)::int from public.feedback), 1, 'a user reads their own feedback');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
set local role authenticated;
select is((select count(*)::int from public.feedback), 0, 'others never see it');
select throws_ok($$ select * from public.admin_feedback() $$, '42501', 'forbidden',
  'feedback list reserved to admins');
reset role;

-- ---- Premium granted by an admin --------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b9', 'aal1');
set local role authenticated;
select throws_ok($$ select public.admin_grant_premium('b2@example.test', (select today + 30 from d)) $$,
  '42501', 'forbidden', 'grant refused without aal2');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b9', 'aal2');
set local role authenticated;
select throws_ok($$ select public.admin_grant_premium('nobody@example.test', (select today + 30 from d)) $$,
  'P0002', 'user_not_found', 'unknown e-mail refused');
select throws_ok($$ select public.admin_grant_premium('b2@example.test', (select today - 1 from d)) $$,
  '22023', 'invalid_until', 'end date in the past refused');
select lives_ok($$ select public.admin_grant_premium(' B2@example.test ', (select today + 30 from d)) $$,
  'premium granted until a date (e-mail case and spaces ignored)');
select ok(public.is_premium('00000000-0000-0000-0000-0000000000b2'), 'the tester is premium');
select is((select count(*)::int from public.admin_list_premium() where email = 'b2@example.test'),
  1, 'listed among premium accounts');
-- Local data may hold other feedback (Maestro): the tester's one is listed with its e-mail
select is((select count(*)::int from public.admin_feedback() where email = 'b1@example.test'), 1,
  'admin reads all feedback');
select lives_ok($$ select public.admin_revoke_premium('b2@example.test') $$, 'premium revoked');
select ok(not public.is_premium('00000000-0000-0000-0000-0000000000b2'), 'no longer premium');
reset role;
select is((select array_agg(action order by created_at)::text from public.admin_audit
           where target_user_id = '00000000-0000-0000-0000-0000000000b2'),
  '{grant_premium,revoke_premium}', 'both actions audited');

-- ---- Operations alerts -------------------------------------------------------
delete from public.ops_batch_runs;
delete from public.ops_alerts;
select is(public.check_ops_alerts(now()), 1, 'no batch run: one alert');
select is(public.check_ops_alerts(now()), 0, 'once per kind and day');
select public.record_batch_run(now() - interval '10 minutes', false, '{"failed":2}');
delete from public.ops_alerts;
insert into public.llm_calls (user_id, feature, local_date, outcome, cost_eur)
values ('00000000-0000-0000-0000-0000000000b1', 'plan', (select today from d), 'success', 9);
select is(public.check_ops_alerts(now()), 2, 'failed run and AI cost above the threshold');

-- ---- Metrics -----------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b9', 'aal2');
set local role authenticated;
-- Local data may already hold AI calls: at least the 9 € inserted above
select ok((public.admin_metrics((select today - 30 from d), (select today from d)) ->> 'ai_cost_eur')::numeric >= 9,
  'metrics include the AI cost of the period');
reset role;

select * from finish();
rollback;
