-- Lot 9: plan adjusted at the user's request, swap rules, assistant actions, quota, purge.
begin;
create extension if not exists pgtap with schema extensions;

select plan(36);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a9', 'a9@example.test', '{"timezone":"Europe/Paris"}'),
  ('00000000-0000-0000-0000-0000000000b9', 'b9@example.test', '{"timezone":"Europe/Paris"}');
update public.profiles set onboarded_at = '2026-10-01', program_id = 'PR1', persona = 'entrepreneur',
  level = 'beginner', daily_minutes = 30
where user_id in ('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000b9');

create temp table d as select (now() at time zone 'Europe/Paris')::date as today;
create temp table step as
  select * from public.program_steps where program_id = 'PR1' and day_index = 1;
-- Valid swap: same principle as the step, fits 30 min; invalid: another principle
create temp table swap_ok as
  select e.id from public.exercises e
  join public.exercise_principles ep on ep.exercise_id = e.id
  where ep.principle_id = (select principle_id from step) and e.status = 'published'
    and e.duration_min <= 30 and e.id <> (select main_exercise_id from step)
  order by e.id limit 1;
create temp table swap_ko as
  select e.id from public.exercises e
  where e.status = 'published' and e.duration_min <= 30
    and not exists (select 1 from public.exercise_principles ep
                    where ep.exercise_id = e.id and ep.principle_id = (select principle_id from step))
  order by e.id limit 1;
grant select on d, step, swap_ok, swap_ko to authenticated, service_role;

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.save_program_plan(p_user uuid) returns jsonb language sql as $$
  select public.save_daily_plan(p_user, (select today from d),
    jsonb_build_object('mode', 'normal', 'program_day', 1, 'next_program_day', 1, 'program_id', 'PR1',
      'principle_id', (select principle_id from step), 'why_today', 'Rules',
      'items', jsonb_build_array(jsonb_build_object('exercise_id', (select main_exercise_id from step),
        'position', 1, 'adopted', false))),
    '{"rules_fired":["program_step"],"candidates":[],"why":null,"latency_ms":1}');
$$;
create function pg_temp.items(p_user uuid) returns text language sql as $$
  select string_agg(exercise_id || ':' || origin, ',' order by position)
  from public.plan_items where user_id = p_user;
$$;
grant execute on function pg_temp.items(uuid) to authenticated, service_role;

select ok(public.assistant_daily_limit() = 15, 'assistant daily limit read from app_settings (15)');
select ok(public.today_available_minutes('00000000-0000-0000-0000-0000000000a9', (select today from d)) = 30,
  'available minutes from the profile when there is no check-in');

-- ---- Shorter version: adjusted at the user's request -------------------------------
select pg_temp.save_program_plan('00000000-0000-0000-0000-0000000000a9');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a9');
set local role authenticated;
select lives_ok($$ select public.shorten_today_plan(10) $$, 'plan shortened');
select is(pg_temp.items('00000000-0000-0000-0000-0000000000a9'),
  (select minimal_exercise_id from step) || ':engine', 'program mode: minimal exercise of the step');
select results_eq(
  $$ select mode::text, user_adjusted_at is not null from public.daily_plans
     where user_id = '00000000-0000-0000-0000-0000000000a9' $$,
  $$ values ('minimal', true) $$, 'mode minimal and user_adjusted_at set');
reset role;
select is((select pg_temp.save_program_plan('00000000-0000-0000-0000-0000000000a9') ->> 'status'),
  'unchanged', 'an adjusted plan is never recomputed by the engine');
select is(pg_temp.items('00000000-0000-0000-0000-0000000000a9'),
  (select minimal_exercise_id from step) || ':engine', 'the shorter version stays in place');
select is(public.apply_plan_enrichment(
  (select id from public.daily_plans where user_id = '00000000-0000-0000-0000-0000000000a9'),
  (select generated_at from public.daily_plans where user_id = '00000000-0000-0000-0000-0000000000a9'),
  '{"status":"enriched","replace":false,"why_today":"AI","items":[]}'),
  'stale', 'an adjusted plan is never enriched by the AI');
select ok(exists (select 1 from public.engine_decisions
                  where user_id = '00000000-0000-0000-0000-0000000000a9'
                    and 'user_shortened' = any(rules_fired)),
  'adjustment logged in engine_decisions');

-- ---- Swap in program mode: same principle, fits the time ----------------------------
select pg_temp.save_program_plan('00000000-0000-0000-0000-0000000000b9');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b9');
set local role authenticated;
select throws_ok(format('select public.swap_today_exercise(%L)', (select id from swap_ko)),
  '22023', 'invalid_swap', 'program mode: an exercise of another principle is refused');
select throws_ok($$ select public.swap_today_exercise('E999') $$,
  '22023', 'invalid_swap', 'unknown exercise refused');
select lives_ok(format('select public.swap_today_exercise(%L)', (select id from swap_ok)),
  'program mode: same principle, fits the time: accepted');
select is(pg_temp.items('00000000-0000-0000-0000-0000000000b9'), (select id from swap_ok) || ':engine',
  'the new exercise stays an engine item (counts for progress)');
reset role;
-- Touched plan: no adjustment
update public.plan_items set status = 'skipped' where user_id = '00000000-0000-0000-0000-0000000000b9';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b9');
set local role authenticated;
select throws_ok($$ select public.shorten_today_plan(5) $$, '22023', 'plan_touched',
  'a touched plan cannot be shortened');
reset role;

-- ---- Swap in catalogue mode: any published exercise that fits ----------------------
delete from public.daily_plans where user_id = '00000000-0000-0000-0000-0000000000b9';
select public.save_daily_plan('00000000-0000-0000-0000-0000000000b9', (select today from d),
  '{"mode":"normal","program_day":null,"next_program_day":29,"program_id":null,"principle_id":"P002",
    "why_today":"Rules","items":[{"exercise_id":"E001","position":1,"adopted":false}]}',
  '{"rules_fired":["catalog_mode"],"candidates":[],"why":null,"latency_ms":1}');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b9');
set local role authenticated;
select lives_ok(format('select public.swap_today_exercise(%L)', (select id from swap_ko)),
  'catalogue mode: any published exercise that fits');
select throws_ok(
  format('select public.swap_today_exercise(%L)',
    (select id from public.exercises where status = 'published' and duration_min > 30 limit 1)),
  '22023', 'invalid_swap', 'an exercise longer than the time available is refused');
reset role;

-- ---- Assistant tables: read own rows only, no direct write ---------------------------
insert into public.assistant_threads (id, user_id, last_message_at) values
  ('00000000-0000-0000-0000-00000000a9a1', '00000000-0000-0000-0000-0000000000a9', now()),
  ('00000000-0000-0000-0000-00000000b9b1', '00000000-0000-0000-0000-0000000000b9', now()),
  ('00000000-0000-0000-0000-00000000a9a2', '00000000-0000-0000-0000-0000000000a9', now() - interval '91 days');
insert into public.assistant_messages (thread_id, user_id, role, content) values
  ('00000000-0000-0000-0000-00000000a9a1', '00000000-0000-0000-0000-0000000000a9', 'user', 'Bonjour'),
  ('00000000-0000-0000-0000-00000000a9a1', '00000000-0000-0000-0000-0000000000a9', 'user', 'Encore');
insert into public.assistant_actions (id, user_id, thread_id, type, params, expires_at) values
  ('00000000-0000-0000-0000-0000000a9ac1', '00000000-0000-0000-0000-0000000000a9',
   '00000000-0000-0000-0000-00000000a9a1', 'update_goal_progress', '{"value":3}', now() + interval '1 hour'),
  ('00000000-0000-0000-0000-0000000a9ac2', '00000000-0000-0000-0000-0000000000a9',
   '00000000-0000-0000-0000-00000000a9a1', 'update_goal_progress', '{"value":4}', now() - interval '1 minute'),
  ('00000000-0000-0000-0000-0000000a9ac3', '00000000-0000-0000-0000-0000000000a9',
   '00000000-0000-0000-0000-00000000a9a1', 'adapt_today', '{"minutes":10}', now() + interval '1 hour');
insert into public.goals (user_id, title) values ('00000000-0000-0000-0000-0000000000a9', 'Goal');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a9');
set local role authenticated;
select is((select count(*)::int from public.assistant_threads), 2, 'A reads only her threads');
select throws_ok(
  $$ insert into public.assistant_messages (thread_id, user_id, role, content)
     values ('00000000-0000-0000-0000-00000000a9a1', '00000000-0000-0000-0000-0000000000a9', 'user', 'x') $$,
  '42501', null, 'no direct write on messages');
select throws_ok(
  $$ update public.assistant_actions set status = 'applied' $$, '42501', null,
  'no direct write on actions');
select is((public.assistant_quota() ->> 'used')::int, 2, 'quota counts the user messages of today');

-- ---- Actions: confirmation rules ----------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b9');
select throws_ok($$ select public.confirm_assistant_action('00000000-0000-0000-0000-0000000a9ac1') $$,
  'P0002', 'action_not_found', 'confirmation by another user refused');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a9');
select throws_ok($$ select public.confirm_assistant_action('00000000-0000-0000-0000-0000000a9ac2') $$,
  '22023', 'action_expired', 'expired action refused');
select lives_ok($$ select public.confirm_assistant_action('00000000-0000-0000-0000-0000000a9ac1') $$,
  'own pending action confirmed');
select throws_ok($$ select public.confirm_assistant_action('00000000-0000-0000-0000-0000000a9ac1') $$,
  '22023', 'action_already_resolved', 'an action is applied once');
reset role;
select is((select current_value from public.goals where user_id = '00000000-0000-0000-0000-0000000000a9'),
  3::numeric, 'goal progress written by the confirmed action only');
select is((select status from public.assistant_actions where id = '00000000-0000-0000-0000-0000000a9ac1'),
  'applied', 'action marked applied');
-- adapt_today rechecked at confirmation: today's plan already shortened then touched -> refused
update public.plan_items set status = 'done', completed_at = now()
where user_id = '00000000-0000-0000-0000-0000000000a9';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a9');
set local role authenticated;
select throws_ok($$ select public.confirm_assistant_action('00000000-0000-0000-0000-0000000a9ac3') $$,
  '22023', 'plan_touched', 'rules checked again at confirmation (plan touched meanwhile)');
select lives_ok($$ select public.cancel_assistant_action('00000000-0000-0000-0000-0000000a9ac3') $$,
  'pending action cancelled');
select throws_ok($$ select public.cancel_assistant_action('00000000-0000-0000-0000-0000000a9ac3') $$,
  'P0002', 'action_not_found', 'a resolved action cannot be cancelled');

-- ---- Deletion and purge ----------------------------------------------------------
select throws_ok($$ select public.delete_assistant_thread('00000000-0000-0000-0000-00000000b9b1') $$,
  'P0002', 'thread_not_found', 'never the thread of another user');
reset role;
select is(public.purge_assistant_history(now()), 1, 'threads idle for more than 90 days purged');
select is((select count(*)::int from public.assistant_threads
           where id = '00000000-0000-0000-0000-00000000a9a2'), 0, 'old thread gone');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a9');
set local role authenticated;
select lives_ok($$ select public.delete_assistant_history() $$, 'whole history deleted');
reset role;
select is((select count(*)::int from public.assistant_threads
           where user_id = '00000000-0000-0000-0000-0000000000a9'), 0, 'no thread left for A');
select is((select count(*)::int from public.assistant_messages
           where user_id = '00000000-0000-0000-0000-0000000000a9'), 0, 'messages deleted with the threads');
select is((select count(*)::int from public.assistant_threads
           where user_id = '00000000-0000-0000-0000-0000000000b9'), 1, 'B keeps her thread');

select * from finish();
rollback;
