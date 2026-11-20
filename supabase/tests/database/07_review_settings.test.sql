-- Lot 6: adoption trace, weekly review, settings RPCs, account deletion and purge.
begin;
create extension if not exists pgtap with schema extensions;

select plan(58);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a6', 'a6@example.test', '{"timezone":"Europe/Paris"}'),
  ('00000000-0000-0000-0000-0000000000b6', 'b6@example.test', '{"timezone":"Europe/Paris"}'),
  ('00000000-0000-0000-0000-0000000000d6', 'ny6@example.test', '{"timezone":"America/New_York"}');
update public.profiles set onboarded_at = '2026-10-01', program_id = 'PR1', persona = 'entrepreneur',
  level = 'beginner', daily_minutes = 30
where user_id in ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-0000000000b6',
                  '00000000-0000-0000-0000-0000000000d6');

create temp table d as select (now() at time zone 'Europe/Paris')::date as today;
grant select on d to authenticated, service_role;
create function pg_temp.items(p_user uuid) returns text language sql as $$
  select string_agg(exercise_id || ':' || origin || ':' || adopted, ',' order by position)
  from public.plan_items where user_id = p_user;
$$;
grant execute on function pg_temp.items(uuid) to authenticated, service_role;
create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- ---- Adoption trace ---------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a6');
set local role authenticated;
select lives_ok($$ select public.add_exercise_to_today('E001') $$, 'step exercise added before generation');
reset role;
set local role service_role;
select public.save_daily_plan('00000000-0000-0000-0000-0000000000a6', (select today from d),
  '{"mode":"normal","program_day":1,"next_program_day":1,"program_id":"PR1","principle_id":"P002",
    "why_today":"S1","items":[{"exercise_id":"E001","position":1,"adopted":true}]}',
  '{"rules_fired":["adopted_user_item"],"candidates":[],"why":null,"latency_ms":1}');
select is(pg_temp.items('00000000-0000-0000-0000-0000000000a6'), 'E001:engine:true', 'adoption is traced');
select is(
  (select program_id from public.daily_plans where user_id = '00000000-0000-0000-0000-0000000000a6'),
  'PR1', 'program of the plan stored'
);
-- Recomputed in minimal mode: the adopted exercise is no longer kept
select public.save_daily_plan('00000000-0000-0000-0000-0000000000a6', (select today from d),
  '{"mode":"minimal","program_day":1,"next_program_day":1,"program_id":"PR1","principle_id":"P002",
    "why_today":"S1","items":[{"exercise_id":"E041","position":1}]}',
  '{"rules_fired":["minimal_low_energy"],"candidates":[],"why":null,"latency_ms":1}');
select is(
  pg_temp.items('00000000-0000-0000-0000-0000000000a6'),
  'E041:engine:false,E001:user:false',
  'adopted exercise not kept: back to a user addition (not removed)'
);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a6');
set local role authenticated;
select lives_ok($$ select public.add_exercise_to_today('E002') $$, 'second addition');
select lives_ok($$ select public.add_exercise_to_today('E003') $$, 'third addition');
select throws_ok(
  $$ select public.add_exercise_to_today('E004') $$, '22023', 'daily_limit',
  'the reverted exercise counts again in the limit of 3'
);
reset role;

-- ---- Weekly review: save, due users ------------------------------------------
insert into public.user_habits (id, user_id, template_id, frequency) values
  ('80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a6', 'H01', 'daily'),
  ('80000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a6', 'H02', 'daily');
insert into public.goals (id, user_id, title, target_value, current_value, deadline)
values ('90000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a6', 'Goal', 10, 1, (select today from d) + 30);

set local role service_role;
create temp table rv (k text primary key, v jsonb);
insert into rv select 'old', public.save_weekly_review('00000000-0000-0000-0000-0000000000a6', '2026-10-05', '{}', '[]');
insert into rv select 'cur', public.save_weekly_review(
  '00000000-0000-0000-0000-0000000000a6', '2026-11-16', '{"exercisesDone":3}',
  ('[
    {"type":"habit_simplify","priority":1,"params":{"user_habit_id":"80000000-0000-0000-0000-000000000001"}},
    {"type":"goal_deadline","priority":2,"params":{"goal_id":"90000000-0000-0000-0000-000000000001","deadline":"' || ((select today from d) + 90) || '"}},
    {"type":"level_up","priority":3,"params":{"from":"beginner","to":"intermediate"}},
    {"type":"daily_minutes","priority":4,"params":{"minutes":15}},
    {"type":"habit_replace","priority":1,"params":{"user_habit_id":"80000000-0000-0000-0000-000000000002","template_id":"H05"}},
    {"type":"update_goal_progress","priority":2,"params":{"goal_id":"90000000-0000-0000-0000-000000000001"}},
    {"type":"goal_deadline","priority":2,"params":{"goal_id":"90000000-0000-0000-0000-000000000001","deadline":"' || ((select today from d) + 120) || '"}}
  ]')::jsonb);
select is((select v ->> 'status' from rv where k = 'cur'), 'created', 'review saved');
select is(
  (public.save_weekly_review('00000000-0000-0000-0000-0000000000a6', '2026-11-16', '{}', '[]')) ->> 'status',
  'unchanged', 'one review per week (idempotent)'
);
select throws_ok(
  $$ select public.save_weekly_review('00000000-0000-0000-0000-0000000000a6', '2026-11-17', '{}', '[]') $$,
  '22023', 'week_must_start_on_monday', 'weeks start on Monday'
);
reset role;

-- Sunday 2026-11-22: Paris = UTC+1, New York = UTC-5
create function pg_temp.due_reviews(p_now timestamptz) returns text language sql as $$
  select coalesce(string_agg(split_part(u.email, '@', 1) || ':' || x.week_start, ',' order by u.email), '')
  from public.users_due_for_review(p_now) x join auth.users u on u.id = x.user_id
  where u.email in ('b6@example.test', 'ny6@example.test', 'a6@example.test');
$$;
select is(pg_temp.due_reviews('2026-11-22 16:59:00+00'), '', 'Paris Sunday 17:59: not yet');
select is(pg_temp.due_reviews('2026-11-22 17:00:00+00'), 'b6:2026-11-16', 'Paris Sunday 18:00: due (a6 has its review)');
select is(pg_temp.due_reviews('2026-11-22 22:59:00+00'), 'b6:2026-11-16', 'Paris Sunday 23:59: still due');
select is(pg_temp.due_reviews('2026-11-22 23:00:00+00'), 'ny6:2026-11-16', 'New York Sunday 18:00: due, Paris now Monday');
select is(pg_temp.due_reviews('2026-11-21 17:00:00+00'), '', 'Saturday: never');

-- ---- answer_review_proposal ---------------------------------------------------
create temp table cur as select (v ->> 'review_id')::uuid as id from rv where k = 'cur';
create temp table old as select (v ->> 'review_id')::uuid as id from rv where k = 'old';
grant select on cur, old to authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a6');
set local role authenticated;
select lives_ok($$ select public.answer_review_proposal((select id from cur), 0, true) $$, 'accept: simplify habit');
select is(
  (select simplified from public.user_habits where id = '80000000-0000-0000-0000-000000000001'),
  true, 'habit simplified'
);
select throws_ok(
  $$ select public.answer_review_proposal((select id from cur), 0, false) $$,
  '22023', 'already_answered', 'one answer per proposal'
);
select lives_ok($$ select public.answer_review_proposal((select id from cur), 1, false) $$, 'refuse: deadline');
select is(
  (select deadline from public.goals where id = '90000000-0000-0000-0000-000000000001'),
  (select today from d) + 30, 'refused proposal has no effect'
);
select lives_ok($$ select public.answer_review_proposal((select id from cur), 6, true) $$, 'accept: deadline');
select is(
  (select deadline from public.goals where id = '90000000-0000-0000-0000-000000000001'),
  (select today from d) + 120, 'stored deadline applied'
);
select lives_ok($$ select public.answer_review_proposal((select id from cur), 2, true) $$, 'accept: level up');
select lives_ok($$ select public.answer_review_proposal((select id from cur), 3, true) $$, 'accept: daily minutes');
select is(
  (select row(level, daily_minutes)::text from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a6'),
  row('intermediate'::public.user_level, 15::smallint)::text,
  'level and daily minutes applied'
);
select lives_ok($$ select public.answer_review_proposal((select id from cur), 4, true) $$, 'accept: replace habit');
select is(
  (select string_agg(template_id || ':' || active, ',' order by template_id) from public.user_habits),
  'H01:true,H02:false,H05:true', 'old habit deactivated, template added'
);
select lives_ok($$ select public.answer_review_proposal((select id from cur), 5, true) $$, 'accept: update progress');
select is(
  (select jsonb_object_keys_count from (select count(*)::int as jsonb_object_keys_count from jsonb_object_keys((select accepted from public.weekly_reviews where id = (select id from cur)))) x),
  7, 'every answer recorded'
);
select is(
  (select (accepted -> '1' ->> 'accept')::boolean from public.weekly_reviews where id = (select id from cur)),
  false, 'refusal recorded'
);
select throws_ok(
  $$ select public.answer_review_proposal((select id from cur), 7, true) $$,
  '22023', 'invalid_index', 'unknown proposal'
);
select throws_ok(
  $$ select public.answer_review_proposal((select id from old), 0, true) $$,
  '22023', 'review_closed', 'only the current review can be answered'
);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b6');
set local role authenticated;
select throws_ok(
  $$ select public.answer_review_proposal((select id from cur), 0, true) $$,
  'P0002', 'not_found', 'cannot answer the review of another user'
);
select is((select count(*)::int from public.weekly_reviews), 0, 'cannot read the review of another user');
reset role;

-- ---- Settings ----------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a6');
set local role authenticated;
select lives_ok($$ select public.change_program('PR3') $$, 'program changed');
select is(
  (select row(program_id, persona, program_day, program_start_date = (select today from d))::text
   from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a6'),
  row('PR3'::text, 'career_changer'::public.persona, 1::smallint, true)::text,
  'restart at day 1 today, persona from the program'
);
select throws_ok($$ select public.change_program('PR9') $$, '22023', 'invalid_program', 'unknown program');

-- At most 6 active habits (3 active now: H01, H05 + onboarding none)
select lives_ok(
  $$ insert into public.user_habits (user_id, template_id, frequency) values
     ('00000000-0000-0000-0000-0000000000a6', 'H06', 'daily'),
     ('00000000-0000-0000-0000-0000000000a6', 'H07', 'daily'),
     ('00000000-0000-0000-0000-0000000000a6', 'H08', 'daily'),
     ('00000000-0000-0000-0000-0000000000a6', 'H09', 'daily') $$,
  'up to 6 active habits'
);
select throws_ok(
  $$ select public.add_habit_from_template('H10') $$, '22023', 'too_many_habits', '7th active habit refused'
);
update public.user_habits set active = false where template_id = 'H09';
select lives_ok($$ select public.add_habit_from_template('H02') $$, 'inactive habit reactivated');
select is(
  (select count(*)::int from public.user_habits where template_id = 'H02'), 1, 'no duplicate on reactivation'
);

-- Goals
select throws_ok(
  $$ select public.replace_active_goal('New', 5, 'clients', (select today from d)) $$,
  '22023', 'invalid_goal_deadline', 'new goal deadline must be in the future'
);
select lives_ok(
  $$ select public.replace_active_goal('New goal', 5, 'clients', (select today from d) + 60) $$, 'new goal'
);
select is(
  (select string_agg(title || ':' || status, ',' order by created_at) from public.goals),
  'Goal:abandoned,New goal:active', 'previous goal abandoned, new one active'
);
select is((select current_value_updated_at from public.goals where title = 'New goal'), null, 'no value yet');
update public.goals set current_value = 2 where title = 'New goal';
select isnt((select current_value_updated_at from public.goals where title = 'New goal'), null, 'value entry is dated');

-- Consent withdrawn: erase mood and energy
reset role;
insert into public.checkins (user_id, date, energy, mood, minutes_tomorrow) values
  ('00000000-0000-0000-0000-0000000000a6', (select today from d) - 1, 3, 4, 15),
  ('00000000-0000-0000-0000-0000000000a6', (select today from d) - 2, 2, 2, 5);
set local role authenticated;
select is(public.erase_mood_energy(), 2, 'two check-ins cleaned');
select is(
  (select count(*)::int from public.checkins where energy is not null or mood is not null), 0,
  'no mood or energy left'
);

-- ---- Account deletion ----------------------------------------------------------
select throws_ok(
  $$ update public.profiles set deletion_requested_at = now() - interval '40 days'
     where user_id = '00000000-0000-0000-0000-0000000000a6' $$,
  '42501', null, 'deletion date not writable directly'
);
select isnt(public.request_account_deletion(), null, 'deletion requested');
select lives_ok($$ select public.cancel_account_deletion() $$, 'deletion cancelled');
select is(
  (select deletion_requested_at from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a6'),
  null, 'request cleared'
);
select throws_ok(
  $$ select public.purge_deleted_accounts(now()) $$, '42501', null, 'users cannot purge'
);
reset role;

-- Purge with a fixed date: 31 days -> deleted with all data, 29 days -> kept
update public.profiles set deletion_requested_at = '2026-11-01 10:00:00+00'
where user_id = '00000000-0000-0000-0000-0000000000a6';
update public.profiles set deletion_requested_at = '2026-11-03 10:00:00+00'
where user_id = '00000000-0000-0000-0000-0000000000b6';
select is(
  (select count(*)::int from public.users_due_for_plan('2026-12-02 01:30:00+00')
   where user_id = '00000000-0000-0000-0000-0000000000a6'),
  0, 'pending deletion: no plan'
);
set local role service_role;
select is(public.purge_deleted_accounts('2026-12-02 10:00:00+00'), 1, 'one account purged');
reset role;
select is(
  (select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000000a6'), 0,
  '31 days: account deleted'
);
select is(
  (select (select count(*) from public.profiles where user_id = '00000000-0000-0000-0000-0000000000a6')
        + (select count(*) from public.plan_items where user_id = '00000000-0000-0000-0000-0000000000a6')
        + (select count(*) from public.goals where user_id = '00000000-0000-0000-0000-0000000000a6')
        + (select count(*) from public.weekly_reviews where user_id = '00000000-0000-0000-0000-0000000000a6')
        + (select count(*) from public.engine_decisions where user_id = '00000000-0000-0000-0000-0000000000a6'))::int,
  0, 'all data deleted by cascade'
);
select is(
  (select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000000b6'), 1,
  '29 days: account kept'
);

select * from finish();
rollback;
