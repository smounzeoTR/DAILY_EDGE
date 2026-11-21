-- Lot 7: premium switch, AI enrichment of plans and reviews, AI call log, admin with MFA.
begin;
create extension if not exists pgtap with schema extensions;

select plan(47);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a9', 'a9@example.test', '{"timezone":"Europe/Paris"}'),
  ('00000000-0000-0000-0000-0000000000b9', 'b9@example.test', '{"timezone":"Europe/Paris"}'),
  ('00000000-0000-0000-0000-0000000000c9', 'admin9@example.test', '{"timezone":"Europe/Paris"}');
update public.profiles set onboarded_at = '2026-10-01', program_id = 'PR1', persona = 'entrepreneur',
  level = 'beginner', daily_minutes = 30
where user_id in ('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000b9');
update public.profiles set role = 'admin' where user_id = '00000000-0000-0000-0000-0000000000c9';

-- Isolation from local data (demo, e2e runs): rolled back at the end of the test
delete from public.llm_calls;
delete from public.daily_plans;
create temp table d as select (now() at time zone 'Europe/Paris')::date as today;
grant select on d to authenticated, service_role;
create function pg_temp.as_user(p_id uuid, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
create function pg_temp.items(p_plan uuid) returns text language sql as $$
  select string_agg(exercise_id || ':' || origin || ':' || coalesce(personalized_instructions, '-'),
                    ',' order by position)
  from public.plan_items where plan_id = p_plan;
$$;
grant execute on function pg_temp.items(uuid) to service_role;

-- ---- Server settings and premium switch ---------------------------------------
update public.app_settings set value = 'false' where key = 'allow_plan_toggle';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a9');
set local role authenticated;
select throws_ok($$ select * from public.app_settings $$, '42501', null,
  'users cannot read server settings');
select is(public.get_app_flags(), '{"allow_plan_toggle": false}'::jsonb, 'flag off by default');
select throws_ok($$ select public.dev_set_plan('premium') $$, '42501', 'plan_toggle_disabled',
  'plan switch refused while the setting is off');
select throws_ok(
  $$ update public.subscriptions set plan = 'premium' where user_id = '00000000-0000-0000-0000-0000000000a9' $$,
  '42501', null, 'subscriptions cannot be written directly');
reset role;
update public.app_settings set value = 'true' where key = 'allow_plan_toggle';
set local role authenticated;
select is(public.get_app_flags(), '{"allow_plan_toggle": true}'::jsonb, 'flag readable when on');
select lives_ok($$ select public.dev_set_plan('premium') $$, 'plan switch allowed when on');
select ok(public.is_premium('00000000-0000-0000-0000-0000000000a9'), 'premium after the switch');
select ok(not public.is_premium('00000000-0000-0000-0000-0000000000b9'),
  'a user cannot see whether another user is premium');
reset role;
select ok(not public.is_premium('00000000-0000-0000-0000-0000000000b9'), 'free plan is not premium');
update public.subscriptions set plan = 'premium', current_period_end = now() - interval '1 day'
where user_id = '00000000-0000-0000-0000-0000000000b9';
select ok(not public.is_premium('00000000-0000-0000-0000-0000000000b9'), 'expired period is not premium');
update public.subscriptions set status = 'canceled', current_period_end = null
where user_id = '00000000-0000-0000-0000-0000000000b9';
select ok(not public.is_premium('00000000-0000-0000-0000-0000000000b9'), 'inactive status is not premium');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a9');
set local role authenticated;
select lives_ok($$ select public.dev_set_plan('free') $$, 'back to free');
select ok(not public.is_premium('00000000-0000-0000-0000-0000000000a9'), 'free again');

-- ---- Server-only AI objects --------------------------------------------------------
select throws_ok($$ select * from public.llm_calls $$, '42501', null, 'users cannot read llm_calls');
select throws_ok(
  $$ select public.apply_plan_enrichment(gen_random_uuid(), now(), '{}') $$,
  '42501', null, 'users cannot apply an enrichment');
select throws_ok(
  $$ select public.apply_review_enrichment(gen_random_uuid(), '{}') $$,
  '42501', null, 'users cannot enrich a review');
reset role;

-- ---- Plan enrichment, program mode (instructions only) -------------------------------
set local role service_role;
create temp table s1 as select public.save_daily_plan('00000000-0000-0000-0000-0000000000a9', (select today from d),
  '{"mode":"normal","program_day":1,"next_program_day":1,"program_id":"PR1","principle_id":"P002",
    "why_today":"Rules why","ai_status":"pending","items":[{"exercise_id":"E001","position":1,"adopted":false}]}',
  '{"rules_fired":["program_step"],"candidates":[],"why":null,"latency_ms":1}') as r;
select ok((select (r ->> 'decision_id') is not null from s1), 'save_daily_plan returns the decision id');
create temp table p1 as
  select id, generated_at from public.daily_plans
  where user_id = '00000000-0000-0000-0000-0000000000a9' and date = (select today from d);
select is((select ai_status from public.daily_plans where id = (select id from p1)), 'pending',
  'plan saved as pending enrichment');
select is(public.apply_plan_enrichment((select id from p1), now() - interval '1 minute',
  '{"status":"enriched","replace":false,"why_today":"AI why","items":[{"exercise_id":"E001","instructions":"Custom"}]}'),
  'stale', 'a recomputed plan (other generated_at) is never enriched');
select is(pg_temp.items((select id from p1)), 'E001:engine:-', 'nothing written on a stale plan');
select is(public.apply_plan_enrichment((select id from p1), (select generated_at from p1),
  '{"status":"enriched","replace":false,"why_today":"AI why","items":[{"exercise_id":"E001","instructions":"Custom"}]}'),
  'applied', 'program mode enrichment applied');
select is(pg_temp.items((select id from p1)), 'E001:engine:Custom', 'instructions personalized, exercise kept');
select results_eq(
  $$ select why_today, ai_status, principle_id from public.daily_plans where id = (select id from p1) $$,
  $$ values ('AI why'::text, 'enriched'::text, 'P002'::text) $$,
  'why rewritten, status enriched, principle kept');

-- Touched before the enrichment arrives: rules plan kept
select public.save_daily_plan('00000000-0000-0000-0000-0000000000a9', (select today from d),
  '{"mode":"normal","program_day":1,"next_program_day":1,"program_id":"PR1","principle_id":"P002",
    "why_today":"Rules why","ai_status":"pending","items":[{"exercise_id":"E001","position":1,"adopted":false}]}',
  '{"rules_fired":["program_step"],"candidates":[],"why":null,"latency_ms":1}');
select is(pg_temp.items((select id from p1)), 'E001:engine:-', 'a recomputation drops the personalization');
update public.plan_items set status = 'done' where plan_id = (select id from p1);
select is(public.apply_plan_enrichment((select id from p1),
  (select generated_at from public.daily_plans where id = (select id from p1)),
  '{"status":"enriched","replace":false,"why_today":"AI why","items":[{"exercise_id":"E001","instructions":"Custom"}]}'),
  'stale', 'a touched plan is never enriched');
select results_eq(
  $$ select why_today, ai_status from public.daily_plans where id = (select id from p1) $$,
  $$ values ('Rules why'::text, 'fallback'::text) $$, 'touched plan keeps the rules, marked fallback');
reset role;

-- ---- Plan enrichment, catalogue mode (AI choice replaces the engine items) ------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b9');
set local role authenticated;
select public.add_exercise_to_today('E010');
reset role;
set local role service_role;
select public.save_daily_plan('00000000-0000-0000-0000-0000000000b9', (select today from d),
  '{"mode":"normal","program_day":null,"next_program_day":29,"program_id":null,"principle_id":"P002",
    "why_today":"Rules why","ai_status":"pending","items":[{"exercise_id":"E001","position":1,"adopted":false}]}',
  '{"rules_fired":["catalog_mode"],"candidates":[],"why":null,"latency_ms":1}');
create temp table p2 as
  select id, generated_at from public.daily_plans
  where user_id = '00000000-0000-0000-0000-0000000000b9' and date = (select today from d);
select is(public.apply_plan_enrichment((select id from p2), (select generated_at from p2),
  '{"status":"enriched","replace":true,"why_today":"AI why","items":[{"exercise_id":"E010","instructions":"X"}]}'),
  'conflict', 'an exercise added by the user cannot be proposed again');
select is(pg_temp.items((select id from p2)), 'E001:engine:-,E010:user:-', 'conflict keeps the rules plan');
update public.daily_plans set ai_status = 'pending' where id = (select id from p2);
select is(public.apply_plan_enrichment((select id from p2), (select generated_at from p2),
  '{"status":"enriched","replace":true,"why_today":"AI why","items":[{"exercise_id":"E003","instructions":"Three"},{"exercise_id":"E002","instructions":"Two"}]}'),
  'applied', 'catalogue mode enrichment applied');
select is(pg_temp.items((select id from p2)), 'E003:engine:Three,E002:engine:Two,E010:user:-',
  'AI choice first, user addition after');
select is((select principle_id from public.daily_plans where id = (select id from p2)),
  (select principle_id from public.exercise_principles where exercise_id = 'E003' order by position limit 1),
  'principle of the first AI exercise');
select is(public.apply_plan_enrichment((select id from p2), (select generated_at from p2), '{"status":"fallback"}'),
  'fallback', 'fallback result accepted');

-- ---- Review enrichment: texts only ------------------------------------------------------
insert into public.weekly_reviews (id, user_id, week_start, proposals, stats, generated_at) values (
  '00000000-0000-0000-0000-00000000c901', '00000000-0000-0000-0000-0000000000a9', '2026-11-16',
  '[{"type":"daily_minutes","priority":4,"params":{"minutes":15,"average":12}},
    {"type":"level_up","priority":3,"params":{"to":"intermediate"}}]', '{}', now());
select is(public.apply_review_enrichment('00000000-0000-0000-0000-00000000c901',
  '{"status":"enriched","summary":"Nice week","texts":["Only one"]}'),
  'fallback', 'a different number of texts falls back');
select is(public.apply_review_enrichment('00000000-0000-0000-0000-00000000c901',
  '{"status":"enriched","summary":"Nice week","texts":["Text A","Text B"]}'),
  'applied', 'review enrichment applied');
select results_eq(
  $$ select summary, ai_status, proposals from public.weekly_reviews where id = '00000000-0000-0000-0000-00000000c901' $$,
  $$ values ('Nice week'::text, 'enriched'::text,
     '[{"type":"daily_minutes","priority":4,"params":{"minutes":15,"average":12},"text":"Text A"},
       {"type":"level_up","priority":3,"params":{"to":"intermediate"},"text":"Text B"}]'::jsonb) $$,
  'summary and texts written, types and parameters unchanged');
reset role;

-- ---- Administration: admin role and a two-factor session --------------------------------
insert into public.llm_calls (user_id, feature, local_date, model, outcome, attempts, input_tokens,
  output_tokens, cost_eur, latency_ms, decision_id)
values ('00000000-0000-0000-0000-0000000000a9', 'plan', (select today from d), 'mock', 'success', 1, 2000,
  400, 0.0004, 900, (select (r ->> 'decision_id')::uuid from s1)),
  ('00000000-0000-0000-0000-0000000000a9', 'plan', (select today from d), 'mock', 'cache_hit', 0, 0, 0, 0,
  null, null);

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c9', 'aal1');
set local role authenticated;
select ok(not public.is_admin(), 'admin without aal2 is not admin');
select throws_ok($$ select * from public.admin_exercise_stats(current_date - 7, current_date) $$,
  '42501', 'forbidden', 'admin without aal2 refused (stats)');
select throws_ok($$ select * from public.admin_engine_log('a9@example.test') $$,
  '42501', 'forbidden', 'admin without aal2 refused (engine log)');
select throws_ok($$ select * from public.admin_ai_cost_daily(7) $$,
  '42501', 'forbidden', 'admin without aal2 refused (AI cost)');
select is((select count(*)::int from public.engine_decisions), 0,
  'admin without aal2 cannot read the engine log table');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c9', 'aal2');
select ok(public.is_admin(), 'admin with aal2 is admin');
select is(
  (select proposed from public.admin_exercise_stats((select today from d), (select today from d))
   where exercise_id = 'E003'),
  1, 'exercise stats count engine proposals');
select ok(
  (select count(*) from public.admin_engine_log('A9@example.test') where jsonb_array_length(llm_calls) = 1) = 1,
  'engine log found by e-mail (case-insensitive), with its AI call');
select throws_ok($$ select * from public.admin_engine_log('nobody@example.test') $$,
  'P0002', 'user_not_found', 'unknown e-mail reported');
select results_eq(
  $$ select calls, cache_hits, cost_eur from public.admin_ai_cost_daily(7) where feature = 'plan' $$,
  $$ values (1, 1, 0.0004::numeric) $$, 'AI cost per day from llm_calls');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a9', 'aal2');
select ok(not public.is_admin(), 'a regular user with aal2 is not admin');
select throws_ok($$ select * from public.admin_ai_cost_daily(7) $$,
  '42501', 'forbidden', 'a regular user is refused');
reset role;

select * from finish();
rollback;
