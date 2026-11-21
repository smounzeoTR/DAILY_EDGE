-- Lot 4: exercise results, check-in, proposed habit, habit log window, fallback selection.
begin;
create extension if not exists pgtap with schema extensions;

select plan(38);

-- U: Paris user, onboarded, with plans today and yesterday (local dates)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e9', 'u@example.test', '{"timezone":"Europe/Paris"}');
update public.profiles set onboarded_at = now(), program_id = 'PR1'
where user_id = '00000000-0000-0000-0000-0000000000e9';

create temp table d as select (now() at time zone 'Europe/Paris')::date as today;
grant select on d to authenticated;

insert into public.daily_plans (id, user_id, date, mode) values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e9', (select today from d), 'normal'),
  ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e9', (select today from d) - 1, 'normal');
insert into public.plan_items (id, plan_id, user_id, exercise_id, position) values
  -- E001: free text proof
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e9', 'E001', 1),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e9',
   (select id from public.exercises where proof_type = 'numeric' order by id limit 1), 2),
  ('60000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e9',
   (select id from public.exercises where proof_type = 'checkbox' order by id limit 1), 3),
  ('60000000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e9', 'E001', 1);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e9","role":"authenticated"}', true);
set local role authenticated;

-- ---- set_plan_item_result -------------------------------------------------
select throws_ok(
  $$ select public.set_plan_item_result('60000000-0000-0000-0000-000000000001', 'done') $$,
  '22023', 'invalid_proof', 'free text proof is required for "done"'
);
select lives_ok(
  $$ select public.set_plan_item_result('60000000-0000-0000-0000-000000000001', 'done', '  Signer 5 clients  ', 4::smallint) $$,
  'done with proof and rating'
);
select is(
  (select row(status, proof_value, rating, completed_at is not null)::text from public.plan_items
   where id = '60000000-0000-0000-0000-000000000001'),
  row('done'::public.plan_item_status, 'Signer 5 clients'::text, 4::smallint, true)::text,
  'result stored (proof trimmed, completed_at set)'
);
select throws_ok(
  $$ select public.set_plan_item_result('60000000-0000-0000-0000-000000000001', 'skipped', null, 3::smallint) $$,
  '22023', 'invalid_rating', 'no rating unless done'
);
select throws_ok(
  $$ select public.set_plan_item_result('60000000-0000-0000-0000-000000000001', 'done', 'x', 6::smallint) $$,
  '22023', 'invalid_rating', 'rating between 1 and 5'
);
select lives_ok(
  $$ select public.set_plan_item_result('60000000-0000-0000-0000-000000000001', 'too_hard') $$,
  'result can be corrected during the day'
);
select is(
  (select row(status, proof_value, rating, completed_at)::text from public.plan_items
   where id = '60000000-0000-0000-0000-000000000001'),
  row('too_hard'::public.plan_item_status, null::text, null::smallint, null::timestamptz)::text,
  'correction clears proof, rating and completion'
);
select throws_ok(
  $$ select public.set_plan_item_result('60000000-0000-0000-0000-000000000001', 'todo') $$,
  '22023', 'invalid_status', 'never back to todo'
);
select throws_ok(
  $$ select public.set_plan_item_result('60000000-0000-0000-0000-000000000009', 'done', 'x') $$,
  '22023', 'day_closed', 'yesterday plan is closed'
);
select throws_ok(
  $$ select public.set_plan_item_result('60000000-0000-0000-0000-000000000002', 'done', 'abc') $$,
  '22023', 'invalid_proof', 'numeric proof must be a number'
);
select lives_ok(
  $$ select public.set_plan_item_result('60000000-0000-0000-0000-000000000002', 'done', '12,5') $$,
  'numeric proof accepted'
);
select lives_ok(
  $$ select public.set_plan_item_result('60000000-0000-0000-0000-000000000003', 'done', 'ignored') $$,
  'checkbox done'
);
select is(
  (select proof_value from public.plan_items where id = '60000000-0000-0000-0000-000000000003'),
  null, 'checkbox stores no proof'
);
select throws_ok(
  $$ update public.plan_items set rating = 5 where id = '60000000-0000-0000-0000-000000000003' $$,
  '42501', null, 'no direct update of plan items'
);

-- ---- upsert_checkin -------------------------------------------------------
select is(
  public.upsert_checkin(15::smallint, 'Un appel client', null, 2::smallint, 3::smallint),
  (select today from d),
  'check-in on the local date'
);
select is(
  (select row(energy, mood, minutes_tomorrow)::text from public.checkins),
  row(null::smallint, null::smallint, 15::smallint)::text,
  'without consent, energy and mood are not stored'
);
select throws_ok(
  $$ insert into public.checkins (user_id, date, minutes_tomorrow) values ('00000000-0000-0000-0000-0000000000e9', '2020-01-01', 5) $$,
  '42501', null, 'no direct write on check-ins'
);
reset role;
update public.profiles set consent_checkin = true where user_id = '00000000-0000-0000-0000-0000000000e9';
set local role authenticated;
select lives_ok(
  $$ select public.upsert_checkin(30::smallint, 'Deux appels', 'RAS', 4::smallint, 5::smallint) $$,
  'check-in can be modified the same evening'
);
select is(
  (select row(count(*), max(energy), max(mood), max(minutes_tomorrow), max(reflection))::text from public.checkins),
  row(1::bigint, 4::smallint, 5::smallint, 30::smallint, 'Deux appels'::text)::text,
  'with consent: one check-in, updated'
);

-- ---- add_habit_from_template ----------------------------------------------
select lives_ok($$ select public.add_habit_from_template('H05') $$, 'proposed habit added');
select is(
  (select row(title, cue, minimal_version, frequency = (select frequency from public.habit_templates where id = 'H05'))::text
   from public.user_habits where template_id = 'H05'),
  row(null::text, null::text, null::text, true)::text,
  'texts left empty, frequency copied'
);
select throws_ok(
  $$ select public.add_habit_from_template('H05') $$,
  '22023', 'already_added', 'no duplicate habit'
);
reset role;
update public.habit_templates set status = 'review' where id = 'H06';
set local role authenticated;
select throws_ok(
  $$ select public.add_habit_from_template('H06') $$,
  '22023', 'invalid_template', 'unpublished template rejected'
);

-- ---- habit logs: today or yesterday only ----------------------------------
create temp table h as select id from public.user_habits where template_id = 'H05';
select lives_ok(
  $$ insert into public.habit_logs (user_habit_id, user_id, date, minimal)
     values ((select id from h), '00000000-0000-0000-0000-0000000000e9', (select today from d), true) $$,
  'log today (minimal version)'
);
select lives_ok(
  $$ insert into public.habit_logs (user_habit_id, user_id, date)
     values ((select id from h), '00000000-0000-0000-0000-0000000000e9', (select today from d) - 1) $$,
  'log yesterday'
);
select throws_ok(
  $$ insert into public.habit_logs (user_habit_id, user_id, date)
     values ((select id from h), '00000000-0000-0000-0000-0000000000e9', (select today from d) - 2) $$,
  '42501', null, 'log on J-2 refused'
);
select throws_ok(
  $$ insert into public.habit_logs (user_habit_id, user_id, date)
     values ((select id from h), '00000000-0000-0000-0000-0000000000e9', (select today from d) + 1) $$,
  '42501', null, 'log tomorrow refused'
);
reset role;
insert into public.habit_logs (user_habit_id, user_id, date)
values ((select id from h), '00000000-0000-0000-0000-0000000000e9', (select today from d) - 2);
set local role authenticated;
delete from public.habit_logs where date = (select today from d) - 2;
reset role;
select is(
  (select count(*)::int from public.habit_logs
   where user_id = '00000000-0000-0000-0000-0000000000e9' and date = (select today from d) - 2),
  1, 'J-2 log cannot be deleted'
);

-- ---- users_due_for_plan: 2:00 to 4:59 local time, no plan yet --------------
set local role authenticated;
select throws_ok(
  $$ select * from public.users_due_for_plan(now()) $$,
  '42501', null, 'users cannot list due users'
);
select throws_ok(
  $$ select public.trigger_plans_batch() $$,
  '42501', null, 'users cannot trigger the batch'
);
reset role;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f5', 'paris1@example.test', '{"timezone":"Europe/Paris"}'),
  ('00000000-0000-0000-0000-0000000000f6', 'paris2@example.test', '{"timezone":"Europe/Paris"}'),
  ('00000000-0000-0000-0000-0000000000f7', 'paris3@example.test', '{"timezone":"Europe/Paris"}'),
  ('00000000-0000-0000-0000-0000000000f8', 'ny@example.test', '{"timezone":"America/New_York"}');
update public.profiles set onboarded_at = '2026-11-01'
where user_id in ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000f8');
-- paris2 already has its plan for 2026-12-15; paris3 is not onboarded
insert into public.daily_plans (user_id, date, mode, generated_at) values ('00000000-0000-0000-0000-0000000000f6', '2026-12-15', 'normal', now());

create temp table t (user_id uuid);
insert into t values
  ('00000000-0000-0000-0000-0000000000f5'), ('00000000-0000-0000-0000-0000000000f6'),
  ('00000000-0000-0000-0000-0000000000f7'), ('00000000-0000-0000-0000-0000000000f8');
create function pg_temp.due(p_now timestamptz) returns text language sql as $$
  select coalesce(string_agg(split_part(u.email, '@', 1) || ':' || x.local_date, ',' order by u.email), '')
  from public.users_due_for_plan(p_now) x
  join auth.users u on u.id = x.user_id
  where x.user_id in (select user_id from t);
$$;

-- Winter: Paris = UTC+1, New York = UTC-5
select is(pg_temp.due('2026-12-15 00:59:00+00'), '', 'Paris 01:59: not yet');
select is(pg_temp.due('2026-12-15 01:00:00+00'), 'paris1:2026-12-15', 'Paris 02:00: due (with plan / not onboarded excluded)');
select is(pg_temp.due('2026-12-15 03:59:00+00'), 'paris1:2026-12-15', 'Paris 04:59: still due (catch-up window)');
select is(pg_temp.due('2026-12-15 04:00:00+00'), '', 'Paris 05:00: window closed');
select is(pg_temp.due('2026-12-15 07:00:00+00'), 'ny:2026-12-15', 'New York 02:00: due, Paris not');
select is(pg_temp.due('2026-12-15 09:59:00+00'), 'ny:2026-12-15', 'New York 04:59: due');
select is(pg_temp.due('2026-12-15 10:00:00+00'), '', 'New York 05:00: window closed');
select is(
  (select count(*)::int from public.users_due_for_plan('2026-12-15 07:30:00+00', 0) where user_id in (select user_id from t)),
  0, 'limit applied'
);

select * from finish();
rollback;
