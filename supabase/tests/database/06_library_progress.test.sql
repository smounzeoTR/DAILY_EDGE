-- Lot 5: add_exercise_to_today, adoption by save_daily_plan, origins, done days, favorites.
begin;
create extension if not exists pgtap with schema extensions;

select plan(34);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c5', 'lib@example.test', '{"timezone":"Europe/Paris"}'),
  ('00000000-0000-0000-0000-0000000000c6', 'adopt@example.test', '{"timezone":"Europe/Paris"}'),
  ('00000000-0000-0000-0000-0000000000c7', 'other@example.test', '{"timezone":"Europe/Paris"}');
update public.profiles set onboarded_at = now(), program_id = 'PR1'
where user_id in ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000c6');

create temp table d as select (now() at time zone 'Europe/Paris')::date as today;
grant select on d to authenticated, service_role;
create temp table pid (user_id uuid primary key, plan_id uuid);
grant select, insert, update on pid to authenticated, service_role;
create function pg_temp.items(p_user uuid) returns text language sql as $$
  select string_agg(exercise_id || ':' || origin || ':' || position || ':' || status, ',' order by position)
  from public.plan_items where user_id = p_user;
$$;
grant execute on function pg_temp.items(uuid) to authenticated, service_role;

-- ---- add_exercise_to_today ------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c5","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ select public.add_exercise_to_today('E002') $$, 'adds without a plan');
select is(
  (select row(count(*), bool_and(generated_at is null), max(date) = (select today from d))::text from public.daily_plans),
  row(1::bigint, true, true)::text,
  'creates an empty plan for today (not generated yet)'
);
select is(pg_temp.items('00000000-0000-0000-0000-0000000000c5'), 'E002:user:1:todo', 'user item added');
select throws_ok($$ select public.add_exercise_to_today('E002') $$, '22023', 'already_in_plan', 'no duplicate');
reset role;
update public.exercises set status = 'review' where id = 'E005';
set local role authenticated;
select throws_ok($$ select public.add_exercise_to_today('E005') $$, '22023', 'invalid_exercise', 'unpublished refused');
select lives_ok($$ select public.add_exercise_to_today('E003') $$, 'second addition');
select lives_ok($$ select public.add_exercise_to_today('E004') $$, 'third addition');
select throws_ok($$ select public.add_exercise_to_today('E006') $$, '22023', 'daily_limit', 'at most 3 additions a day');
reset role;

-- An empty (not generated) plan is still due for the fallback batch
select is(
  (select count(*)::int from public.users_due_for_plan(
     ((select today from d)::timestamp + interval '2 hours 30 minutes') at time zone 'Europe/Paris')
   where user_id = '00000000-0000-0000-0000-0000000000c5'),
  1, 'plan without generated_at is due'
);

-- ---- save_daily_plan: adoption, user items kept -----------------------------
set local role service_role;
create temp table r (step text, result jsonb);
insert into r select 'adopt', public.save_daily_plan(
  '00000000-0000-0000-0000-0000000000c5', (select today from d),
  '{"mode":"normal","program_day":1,"next_program_day":1,"principle_id":"P002",
    "why_today":"S1","items":[{"exercise_id":"E002","position":1,"adopted":true}]}',
  '{"rules_fired":["program_step","adopted_user_item"],"candidates":[],"why":null,"latency_ms":1}'
);
select is((select result ->> 'status' from r where step = 'adopt'), 'created', 'first computation of an empty plan = created');
select is(
  pg_temp.items('00000000-0000-0000-0000-0000000000c5'),
  'E002:engine:1:todo,E003:user:2:todo,E004:user:3:todo',
  'step exercise adopted at position 1, other additions kept after it'
);
select isnt(
  (select generated_at from public.daily_plans where user_id = '00000000-0000-0000-0000-0000000000c5'),
  null, 'generated_at set'
);
reset role;
select is(
  (select count(*)::int from public.users_due_for_plan(
     ((select today from d)::timestamp + interval '2 hours 30 minutes') at time zone 'Europe/Paris')
   where user_id = '00000000-0000-0000-0000-0000000000c5'),
  0, 'generated plan no longer due'
);

-- The adopted item no longer counts in the daily limit
set local role authenticated;
select lives_ok($$ select public.add_exercise_to_today('E006') $$, 'adoption frees an addition slot');
reset role;

-- A done user addition keeps the plan untouched; recompute keeps it
update public.plan_items set status = 'done'
where user_id = '00000000-0000-0000-0000-0000000000c5' and exercise_id = 'E003';
set local role service_role;
insert into r select 'recompute', public.save_daily_plan(
  '00000000-0000-0000-0000-0000000000c5', (select today from d),
  '{"mode":"minimal","program_day":1,"next_program_day":1,"principle_id":"P002",
    "why_today":"S1","items":[{"exercise_id":"E041","position":1}]}',
  '{"rules_fired":["minimal_low_energy"],"candidates":[],"why":null,"latency_ms":1}'
);
select is((select result ->> 'status' from r where step = 'recompute'), 'recomputed', 'done addition does not touch the plan');
select is(
  pg_temp.items('00000000-0000-0000-0000-0000000000c5'),
  'E041:engine:1:todo,E002:user:2:todo,E003:user:3:done,E004:user:4:todo,E006:user:5:todo',
  'engine items replaced, additions kept with their status, adopted item back to an addition'
);
reset role;

-- Engine item done: plan touched
update public.plan_items set status = 'done'
where user_id = '00000000-0000-0000-0000-0000000000c5' and exercise_id = 'E041';
set local role service_role;
insert into r select 'touched', public.save_daily_plan(
  '00000000-0000-0000-0000-0000000000c5', (select today from d),
  '{"mode":"normal","program_day":1,"next_program_day":1,"principle_id":"P002",
    "why_today":"S1","items":[{"exercise_id":"E001","position":1}]}',
  '{"rules_fired":[],"candidates":[],"why":null,"latency_ms":1}'
);
select is((select result ->> 'status' from r where step = 'touched'), 'unchanged', 'done engine item: unchanged');
reset role;

-- ---- Adoption of an item already done: the plan is touched afterwards -------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c6","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ select public.add_exercise_to_today('E001') $$, 'step exercise added before generation');
select lives_ok(
  $$ select public.set_plan_item_result(
       (select id from public.plan_items where exercise_id = 'E001'), 'done', 'Mon objectif') $$,
  'done before the plan is computed'
);
reset role;
set local role service_role;
insert into r select 'adopt-done', public.save_daily_plan(
  '00000000-0000-0000-0000-0000000000c6', (select today from d),
  '{"mode":"normal","program_day":1,"next_program_day":1,"principle_id":"P002",
    "why_today":"S1","items":[{"exercise_id":"E001","position":1,"adopted":true}]}',
  '{"rules_fired":["adopted_user_item"],"candidates":[],"why":null,"latency_ms":1}'
);
select is(pg_temp.items('00000000-0000-0000-0000-0000000000c6'), 'E001:engine:1:done', 'adopted with its status');
insert into r select 'adopt-again', public.save_daily_plan(
  '00000000-0000-0000-0000-0000000000c6', (select today from d),
  '{"mode":"normal","program_day":1,"next_program_day":1,"principle_id":"P002",
    "why_today":"S1","items":[{"exercise_id":"E004","position":1}]}',
  '{"rules_fired":[],"candidates":[],"why":null,"latency_ms":1}'
);
select is((select result ->> 'status' from r where step = 'adopt-again'), 'unchanged', 'adopted done item: plan touched');
reset role;

-- ---- Engine history: skips count engine items only --------------------------
insert into public.daily_plans (id, user_id, date, mode, generated_at) values
  ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c6', (select today from d) - 5, 'normal', now()),
  ('70000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c6', (select today from d) - 4, 'normal', now());
insert into public.plan_items (plan_id, user_id, exercise_id, status, origin) values
  ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c6', 'E010', 'skipped', 'user'),
  ('70000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c6', 'E010', 'too_hard', 'user'),
  ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c6', 'E011', 'skipped', 'engine'),
  ('70000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c6', 'E011', 'too_hard', 'engine');
set local role service_role;
select is(
  (select skips from public.engine_exercise_history('00000000-0000-0000-0000-0000000000c6') where exercise_id = 'E010'),
  0, 'user additions skipped twice: no skip counted'
);
select is(
  (select skips from public.engine_exercise_history('00000000-0000-0000-0000-0000000000c6') where exercise_id = 'E011'),
  2, 'engine items skipped twice: 2 skips'
);
reset role;

-- ---- my_done_days ----------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c5","role":"authenticated"}', true);
set local role authenticated;
select is(public.my_done_days(), array[(select today from d)], 'done days of the user (any origin)');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c7","role":"authenticated"}', true);
set local role authenticated;
select is(public.my_done_days(), '{}'::date[], 'nothing for another user');
reset role;
set local role anon;
select throws_ok($$ select public.my_done_days() $$, '42501', null, 'anon cannot call my_done_days');
select throws_ok($$ select public.add_exercise_to_today('E001') $$, '42501', null, 'anon cannot add');
reset role;

-- ---- Favorites: own rows only ----------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c5","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ insert into public.favorites (user_id, entity_type, entity_id)
     values ('00000000-0000-0000-0000-0000000000c5', 'exercise', 'E002'),
            ('00000000-0000-0000-0000-0000000000c5', 'principle', 'P026') $$,
  'favorites added'
);
select is((select count(*)::int from public.favorites), 2, 'own favorites visible');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c7","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.favorites), 0, 'other user sees none');
select throws_ok(
  $$ insert into public.favorites (user_id, entity_type, entity_id)
     values ('00000000-0000-0000-0000-0000000000c5', 'exercise', 'E003') $$,
  '42501', null, 'cannot add a favorite for someone else'
);
delete from public.favorites where entity_id = 'E002';
reset role;
select is(
  (select count(*)::int from public.favorites where user_id = '00000000-0000-0000-0000-0000000000c5'),
  2, 'cannot delete someone else''s favorite'
);
select is(
  (select count(*)::int from public.plan_items where user_id = '00000000-0000-0000-0000-0000000000c7'),
  0, 'other user has no plan items'
);
select is(
  (select origin::text from public.plan_items where exercise_id = 'E006' and user_id = '00000000-0000-0000-0000-0000000000c5'),
  'user', 'origin default for additions is user'
);

select * from finish();
rollback;
