-- complete_onboarding writes goal, profile and 3 habits atomically.
begin;
create extension if not exists pgtap with schema extensions;

select plan(29);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'f1@example.test', '{"locale":"fr"}'),
  ('00000000-0000-0000-0000-0000000000f2', 'f2@example.test', '{"locale":"fr"}');

-- Valid habits: H01 with a custom cue, H02 with its default cue (not stored), H03 without cue
create temp table habits_ok as
select jsonb_build_array(
  jsonb_build_object('template_id', 'H01', 'cue', '  Après mon café  '),
  jsonb_build_object('template_id', 'H02', 'cue', (select default_cue_fr from public.habit_templates where id = 'H02')),
  jsonb_build_object('template_id', 'H03')
) as v;
grant select on habits_ok to authenticated, anon;

-- ---- Anonymous -----------------------------------------------------------
set local role anon;
select throws_ok(
  $$ select public.complete_onboarding('Goal', 'PR1', (select v from habits_ok)) $$,
  '42501',
  null,
  'anon cannot call complete_onboarding'
);
reset role;

-- ---- User F1 -------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;

-- Validation errors (each leaves nothing behind)
select throws_ok(
  $$ select public.complete_onboarding('   ', 'PR1', (select v from habits_ok)) $$,
  '22023', 'invalid_goal_title', 'empty goal title rejected'
);
select throws_ok(
  $$ select public.complete_onboarding('Goal', 'PR1', (select v from habits_ok), p_goal_deadline => current_date - 1) $$,
  '22023', 'invalid_goal_deadline', 'past deadline rejected'
);
select throws_ok(
  $$ select public.complete_onboarding('Goal', 'PR1', (select v from habits_ok),
       p_goal_deadline => (now() at time zone 'Europe/Paris')::date) $$,
  '22023', 'invalid_goal_deadline', 'deadline today rejected (must be in the future)'
);
select throws_ok(
  $$ select public.complete_onboarding('Goal', 'PR9', (select v from habits_ok)) $$,
  '22023', 'invalid_program', 'unknown program rejected'
);
select throws_ok(
  $$ select public.complete_onboarding('Goal', 'PR1', '[{"template_id":"H01"},{"template_id":"H02"}]') $$,
  '22023', 'invalid_habits', 'two habits rejected'
);
select throws_ok(
  $$ select public.complete_onboarding('Goal', 'PR1', '[{"template_id":"H01"},{"template_id":"H01"},{"template_id":"H02"}]') $$,
  '22023', 'invalid_habits', 'duplicate habit rejected'
);
select throws_ok(
  $$ select public.complete_onboarding('Goal', 'PR1', '[{"template_id":"H01"},{"template_id":"H02"},{"template_id":"H99"}]') $$,
  '22023', 'invalid_habits', 'unknown habit template rejected'
);
reset role;

-- Unpublished template is invisible to users, hence rejected
update public.habit_templates set status = 'review' where id = 'H04';
set local role authenticated;
select throws_ok(
  $$ select public.complete_onboarding('Goal', 'PR1', '[{"template_id":"H01"},{"template_id":"H02"},{"template_id":"H04"}]') $$,
  '22023', 'invalid_habits', 'unpublished habit template rejected'
);
reset role;

-- Atomicity: nothing written by the failed calls
select is((select count(*)::int from public.goals where user_id = '00000000-0000-0000-0000-0000000000f1'), 0, 'no goal after failures');
select is((select count(*)::int from public.user_habits where user_id = '00000000-0000-0000-0000-0000000000f1'), 0, 'no habit after failures');
select is((select onboarded_at from public.profiles where user_id = '00000000-0000-0000-0000-0000000000f1'), null, 'profile not onboarded after failures');

-- Success (program PR4 -> persona derived from the program)
set local role authenticated;
select lives_ok(
  $$ select public.complete_onboarding(
       p_goal_title => '  Signer 5 clients  ',
       p_program_id => 'PR4',
       p_habits => (select v from habits_ok),
       p_goal_target_value => 5,
       p_goal_unit => 'clients',
       p_goal_deadline => current_date + 90,
       p_goal_why => 'Liberté',
       p_situation => 'entrepreneur',
       p_priority_domains => array['money_wealth', 'business_career']::public.domain[],
       p_blockers => array['fear']::public.blocker[],
       p_daily_minutes => 30::smallint,
       p_chronotype => 'morning',
       p_motivation_style => 'challenge',
       p_level => 'intermediate',
       p_notify_morning => '08:00',
       p_notify_evening => '21:30',
       p_consent_checkin => true,
       p_consent_ai => false,
       p_locale => 'en',
       p_timezone => 'America/New_York'
     ) $$,
  'valid onboarding succeeds'
);
reset role;

select is(
  (select title from public.goals where user_id = '00000000-0000-0000-0000-0000000000f1'),
  'Signer 5 clients', 'goal title trimmed'
);
select is(
  (select row(target_value, unit, deadline = current_date + 90, why)::text from public.goals
   where user_id = '00000000-0000-0000-0000-0000000000f1'),
  row(5::numeric, 'clients'::text, true, 'Liberté'::text)::text,
  'goal fields written'
);
select is(
  (select row(persona, program_id, program_day, program_start_date = (now() at time zone 'America/New_York')::date)::text
   from public.profiles where user_id = '00000000-0000-0000-0000-0000000000f1'),
  row('financial_beginner'::public.persona, 'PR4'::text, 1::smallint, true)::text,
  'persona from program, program day 1, start date in user timezone'
);
select is(
  (select row(locale, timezone, daily_minutes, level, notify_morning, notify_evening)::text
   from public.profiles where user_id = '00000000-0000-0000-0000-0000000000f1'),
  row('en'::text, 'America/New_York'::text, 30::smallint, 'intermediate'::public.user_level, '08:00'::time, '21:30'::time)::text,
  'profile preferences written'
);
select is(
  (select row(consent_checkin, consent_ai, consent_at is not null, onboarded_at is not null)::text
   from public.profiles where user_id = '00000000-0000-0000-0000-0000000000f1'),
  row(true, false, true, true)::text,
  'consents and onboarded_at written'
);
select is(
  (select priority_domains from public.profiles where user_id = '00000000-0000-0000-0000-0000000000f1'),
  array['money_wealth', 'business_career']::public.domain[],
  'priority domains written in order'
);
select is(
  (select count(*)::int from public.user_habits where user_id = '00000000-0000-0000-0000-0000000000f1'),
  3, 'three habits created'
);
select is(
  (select count(*)::int from public.user_habits
   where user_id = '00000000-0000-0000-0000-0000000000f1' and title is null and minimal_version is null),
  3, 'template texts are not copied'
);
select is(
  (select cue from public.user_habits where user_id = '00000000-0000-0000-0000-0000000000f1' and template_id = 'H01'),
  'Après mon café', 'custom cue stored (trimmed)'
);
select is(
  (select cue from public.user_habits where user_id = '00000000-0000-0000-0000-0000000000f1' and template_id = 'H02'),
  null, 'default cue not stored'
);
select is(
  (select cue from public.user_habits where user_id = '00000000-0000-0000-0000-0000000000f1' and template_id = 'H03'),
  null, 'missing cue stays null'
);

-- Second call rejected
set local role authenticated;
select throws_ok(
  $$ select public.complete_onboarding('Again', 'PR1', (select v from habits_ok)) $$,
  '22023', 'already_onboarded', 'second call rejected'
);
reset role;

-- F2 with defaults only; F1 data stays invisible to F2
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ select public.complete_onboarding('Goal F2', 'PR1', (select v from habits_ok)) $$,
  'defaults are enough'
);
select is(
  (select row(persona, daily_minutes, consent_at is null, locale)::text from public.profiles),
  row('entrepreneur'::public.persona, 15::smallint, true, 'fr'::text)::text,
  'defaults applied (15 min, no consent date, locale kept)'
);
select is((select count(*)::int from public.user_habits), 3, 'F2 only sees its own habits');
reset role;

-- A habit without template still needs its own title
select throws_ok(
  $$ insert into public.user_habits (user_id, title) values ('00000000-0000-0000-0000-0000000000f2', null) $$,
  '23514', null, 'habit without template requires a title'
);

select * from finish();
rollback;
