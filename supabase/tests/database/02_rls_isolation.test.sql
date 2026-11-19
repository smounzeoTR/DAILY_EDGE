-- User B can neither read nor modify user A's data.
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

-- Users: A = ...a1, B = ...b1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@example.test');

-- Data owned by A (inserted as postgres, as Edge Functions would)
insert into public.goals (id, user_id, title)
  values ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Goal A');
insert into public.user_habits (id, user_id, title)
  values ('20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Habit A');
insert into public.habit_logs (user_habit_id, user_id, date)
  values ('20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', '2026-11-20');
insert into public.checkins (user_id, date, energy, mood)
  values ('00000000-0000-0000-0000-0000000000a1', '2026-11-20', 3, 4);
insert into public.favorites (user_id, entity_type, entity_id)
  values ('00000000-0000-0000-0000-0000000000a1', 'exercise', 'E001');
insert into public.daily_plans (id, user_id, date, principle_id, mode)
  values ('30000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', '2026-11-20', 'P001', 'normal');
insert into public.plan_items (plan_id, user_id, exercise_id)
  values ('30000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'E001');
insert into public.weekly_reviews (user_id, week_start)
  values ('00000000-0000-0000-0000-0000000000a1', '2026-11-16');
insert into public.profile_stats (user_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.engine_decisions (user_id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1');

-- Composite FK: a plan item cannot point to another user's plan
select throws_ok(
  $$ insert into public.plan_items (plan_id, user_id, exercise_id)
     values ('30000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'E002') $$,
  '23503',
  null,
  'plan item user_id must match its plan'
);

-- ---- Act as B --------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.profiles), 1, 'B sees only its own profile');
select is((select count(*)::int from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a1'), 0, 'B cannot read A profile');
select is((select count(*)::int from public.subscriptions where user_id = '00000000-0000-0000-0000-0000000000a1'), 0, 'B cannot read A subscription');
select is((select count(*)::int from public.goals), 0, 'B cannot read A goals');
select is((select count(*)::int from public.user_habits), 0, 'B cannot read A habits');
select is((select count(*)::int from public.habit_logs), 0, 'B cannot read A habit logs');
select is((select count(*)::int from public.checkins), 0, 'B cannot read A check-ins');
select is((select count(*)::int from public.favorites), 0, 'B cannot read A favorites');
select is((select count(*)::int from public.daily_plans), 0, 'B cannot read A plans');
select is((select count(*)::int from public.plan_items), 0, 'B cannot read A plan items');
select is((select count(*)::int from public.weekly_reviews), 0, 'B cannot read A weekly reviews');
select is((select count(*)::int from public.profile_stats), 0, 'B cannot read A stats');
select is((select count(*)::int from public.engine_decisions), 0, 'engine log is admin-only, even own rows');

-- Writes on A's rows silently affect nothing
update public.goals set title = 'hacked' where user_id = '00000000-0000-0000-0000-0000000000a1';
delete from public.user_habits where user_id = '00000000-0000-0000-0000-0000000000a1';
update public.plan_items set status = 'done' where user_id = '00000000-0000-0000-0000-0000000000a1';

select throws_ok(
  $$ insert into public.goals (user_id, title) values ('00000000-0000-0000-0000-0000000000a1', 'x') $$,
  '42501',
  null,
  'B cannot create a goal for A'
);
select throws_ok(
  $$ insert into public.habit_logs (user_habit_id, user_id, date)
     values ('20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', '2026-11-21') $$,
  '23503',
  null,
  'B cannot log on A habit with its own user_id (composite FK)'
);
select throws_ok(
  $$ insert into public.habit_logs (user_habit_id, user_id, date)
     values ('20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', '2026-11-21') $$,
  '42501',
  null,
  'B cannot log on A habit with A user_id (RLS)'
);
select throws_ok(
  $$ insert into public.plan_items (plan_id, user_id, exercise_id)
     values ('30000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'E002') $$,
  '42501',
  null,
  'users cannot create plan items'
);
select throws_ok(
  $$ update public.profiles set role = 'admin' where user_id = '00000000-0000-0000-0000-0000000000b1' $$,
  '42501',
  null,
  'B cannot make itself admin'
);
select lives_ok(
  $$ update public.profiles set display_name = 'B' where user_id = '00000000-0000-0000-0000-0000000000b1' $$,
  'B can update its own profile fields'
);
select lives_ok(
  $$ with h as (
       insert into public.user_habits (user_id, title)
       values ('00000000-0000-0000-0000-0000000000b1', 'Habit B')
       returning id, user_id
     )
     insert into public.habit_logs (user_habit_id, user_id, date)
     select id, user_id, '2026-11-21' from h $$,
  'B can create its own habit and log'
);

reset role;

-- ---- Back as postgres: A's data untouched --------------------------------
select is(
  (select title from public.goals where id = '10000000-0000-0000-0000-0000000000a1'),
  'Goal A',
  'A goal not modified by B'
);
select is(
  (select count(*)::int from public.user_habits where user_id = '00000000-0000-0000-0000-0000000000a1'),
  1,
  'A habit not deleted by B'
);
select is(
  (select status::text from public.plan_items where user_id = '00000000-0000-0000-0000-0000000000a1'),
  'todo',
  'A plan item not modified by B'
);

-- ---- Act as A: own rows visible ------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.goals), 1, 'A reads its own goal');
reset role;

-- ---- Anonymous: no access to user tables ---------------------------------
set local role anon;
select throws_ok($$ select * from public.goals $$, '42501', null, 'anon cannot read user tables');
reset role;

select * from finish();
rollback;
