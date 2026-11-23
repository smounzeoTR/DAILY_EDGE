-- Program columns are server-only; save_daily_plan is idempotent and transactional.
begin;
create extension if not exists pgtap with schema extensions;

select plan(23);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'd1@example.test');
-- Lot 10b: onboarding requires the 18+ confirmation
update public.profiles set adult_confirmed_at = now()
  where user_id::text like '00000000-0000-0000-0000-%';

-- ---- program_day / program_start_date are not user-writable ---------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ update public.profiles set program_day = 20 where user_id = '00000000-0000-0000-0000-0000000000d1' $$,
  '42501', null, 'user cannot change program_day'
);
select throws_ok(
  $$ update public.profiles set program_start_date = '2020-01-01' where user_id = '00000000-0000-0000-0000-0000000000d1' $$,
  '42501', null, 'user cannot change program_start_date'
);
select lives_ok(
  $$ update public.profiles set display_name = 'D' where user_id = '00000000-0000-0000-0000-0000000000d1' $$,
  'other profile fields stay editable'
);
-- complete_onboarding (security definer) still writes them
select lives_ok(
  $$ select public.complete_onboarding('Goal', 'PR1',
       '[{"template_id":"H01"},{"template_id":"H02"},{"template_id":"H03"}]') $$,
  'complete_onboarding works without user grants on program columns'
);
select is(
  (select program_day from public.profiles where user_id = '00000000-0000-0000-0000-0000000000d1'),
  1::smallint, 'complete_onboarding sets program_day = 1'
);
select isnt(
  (select program_start_date from public.profiles where user_id = '00000000-0000-0000-0000-0000000000d1'),
  null, 'complete_onboarding sets program_start_date'
);

-- ---- save_daily_plan is server-only ---------------------------------------
select throws_ok(
  $$ select public.save_daily_plan('00000000-0000-0000-0000-0000000000d1', '2026-12-10', '{}', '{}') $$,
  '42501', null, 'authenticated cannot call save_daily_plan'
);
reset role;
set local role anon;
select throws_ok(
  $$ select public.save_daily_plan('00000000-0000-0000-0000-0000000000d1', '2026-12-10', '{}', '{}') $$,
  '42501', null, 'anon cannot call save_daily_plan'
);
reset role;

-- ---- As the server --------------------------------------------------------
set local role service_role;
create temp table r (step text, result jsonb);

insert into r select 'create', public.save_daily_plan(
  '00000000-0000-0000-0000-0000000000d1', '2026-12-10',
  '{"mode":"normal","program_day":1,"next_program_day":1,"principle_id":"P002","introduced_habit_id":"H01",
    "why_today":"Semaine 1","items":[{"exercise_id":"E001","position":1}]}',
  '{"rules_fired":["program_step"],"candidates":[],"why":{"key":"program_week","params":{"week":1}},"latency_ms":12}'
);
select is((select result ->> 'status' from r where step = 'create'), 'created', 'plan created');
select is(
  (select count(*)::int from public.plan_items pi join public.daily_plans dp on dp.id = pi.plan_id
   where dp.user_id = '00000000-0000-0000-0000-0000000000d1'),
  1, 'one item written'
);
select is(
  (select row(rules_fired, why ->> 'key', latency_ms)::text from public.engine_decisions
   where user_id = '00000000-0000-0000-0000-0000000000d1'),
  row(array['program_step'], 'program_week'::text, 12)::text,
  'decision logged with why key'
);
select is(
  (select introduced_habit_id from public.daily_plans where user_id = '00000000-0000-0000-0000-0000000000d1'),
  'H01', 'introduced habit stored'
);

-- Untouched plan: recomputed in place
insert into r select 'recompute', public.save_daily_plan(
  '00000000-0000-0000-0000-0000000000d1', '2026-12-10',
  '{"mode":"minimal","program_day":1,"next_program_day":1,"principle_id":"P002","introduced_habit_id":null,
    "why_today":"Courte","items":[{"exercise_id":"E041","position":1}]}',
  '{"rules_fired":["minimal_low_energy"],"candidates":[],"why":{"key":"low_energy","params":{}},"latency_ms":8}'
);
select is((select result ->> 'status' from r where step = 'recompute'), 'recomputed', 'untouched plan recomputed');
select is(
  (select result ->> 'plan_id' from r where step = 'recompute'),
  (select result ->> 'plan_id' from r where step = 'create'),
  'same plan id'
);
select is(
  (select array_agg(pi.exercise_id) from public.plan_items pi join public.daily_plans dp on dp.id = pi.plan_id
   where dp.user_id = '00000000-0000-0000-0000-0000000000d1'),
  array['E041'], 'items replaced'
);
select is(
  (select count(*)::int from public.engine_decisions where user_id = '00000000-0000-0000-0000-0000000000d1'),
  2, 'each computation is logged'
);

-- Touched plan: returned unchanged
update public.plan_items set status = 'done'
where user_id = '00000000-0000-0000-0000-0000000000d1';
insert into r select 'touched', public.save_daily_plan(
  '00000000-0000-0000-0000-0000000000d1', '2026-12-10',
  '{"mode":"normal","program_day":1,"next_program_day":1,"principle_id":"P002",
    "why_today":"X","items":[{"exercise_id":"E001","position":1}]}',
  '{"rules_fired":[],"candidates":[],"why":null,"latency_ms":1}'
);
select is((select result ->> 'status' from r where step = 'touched'), 'unchanged', 'touched plan kept');
select is(
  (select array_agg(pi.exercise_id) from public.plan_items pi join public.daily_plans dp on dp.id = pi.plan_id
   where dp.user_id = '00000000-0000-0000-0000-0000000000d1'),
  array['E041'], 'touched items untouched'
);
select is(
  (select count(*)::int from public.engine_decisions where user_id = '00000000-0000-0000-0000-0000000000d1'),
  2, 'no decision logged for an unchanged plan'
);

-- Next day advances the program; saving an older date never moves it back
select public.save_daily_plan(
  '00000000-0000-0000-0000-0000000000d1', '2026-12-11',
  '{"mode":"normal","program_day":2,"next_program_day":2,"principle_id":"P006",
    "why_today":"S1","items":[{"exercise_id":"E004","position":1}]}',
  '{"rules_fired":["program_advanced"],"candidates":[],"why":null,"latency_ms":1}'
);
select is(
  (select program_day from public.profiles where user_id = '00000000-0000-0000-0000-0000000000d1'),
  2::smallint, 'program day follows the latest plan'
);
select public.save_daily_plan(
  '00000000-0000-0000-0000-0000000000d1', '2026-12-09',
  '{"mode":"normal","program_day":1,"next_program_day":1,"principle_id":"P002",
    "why_today":"S1","items":[{"exercise_id":"E001","position":1}]}',
  '{"rules_fired":[],"candidates":[],"why":null,"latency_ms":1}'
);
select is(
  (select program_day from public.profiles where user_id = '00000000-0000-0000-0000-0000000000d1'),
  2::smallint, 'older date does not move the program back'
);
select is(
  (select count(*)::int from public.daily_plans where user_id = '00000000-0000-0000-0000-0000000000d1' and date = '2026-12-10'),
  1, 'one plan per date'
);
reset role;

-- The user reads its plans but cannot write them
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.daily_plans), 3, 'user reads its plans');
reset role;

select * from finish();
rollback;
