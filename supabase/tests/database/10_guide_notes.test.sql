-- Lot 8: principle read, guide state (append only), goal achieved date, notes.
begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'a10@example.test', '{"timezone":"Europe/Paris"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'b10@example.test', '{"timezone":"Europe/Paris"}');
create temp table d as select (now() at time zone 'Europe/Paris')::date as today;
grant select on d to authenticated;
insert into public.daily_plans (id, user_id, date, mode, generated_at) values
  ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-0000000000a1',
   (select today from d), 'normal', now()),
  ('00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-0000000000a1',
   (select today - 1 from d), 'normal', now()),
  ('00000000-0000-0000-0000-00000000b101', '00000000-0000-0000-0000-0000000000b1',
   (select today from d), 'normal', now());

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- ---- Principle read --------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select lives_ok($$ select public.mark_principle_read('00000000-0000-0000-0000-00000000a101') $$,
  'principle of today marked as read');
select throws_ok($$ select public.mark_principle_read('00000000-0000-0000-0000-00000000a102') $$,
  'P0002', 'plan_not_found', 'only the plan of today');
select throws_ok($$ select public.mark_principle_read('00000000-0000-0000-0000-00000000b101') $$,
  'P0002', 'plan_not_found', 'never the plan of another user');
select throws_ok(
  $$ update public.daily_plans set principle_read_at = now() where id = '00000000-0000-0000-0000-00000000a101' $$,
  '42501', null, 'no direct write on daily_plans');
reset role;
select ok((select principle_read_at is not null from public.daily_plans
           where id = '00000000-0000-0000-0000-00000000a101'), 'read time stored');
create temp table first_read as
  select principle_read_at as at from public.daily_plans where id = '00000000-0000-0000-0000-00000000a101';
update public.daily_plans set principle_read_at = principle_read_at - interval '1 hour'
where id = '00000000-0000-0000-0000-00000000a101';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select public.mark_principle_read('00000000-0000-0000-0000-00000000a101');
reset role;
select ok((select principle_read_at < (select at from first_read) from public.daily_plans
           where id = '00000000-0000-0000-0000-00000000a101'), 'the first reading is kept');

-- ---- Guide state -------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select throws_ok(
  $$ insert into public.user_guide_state (user_id) values ('00000000-0000-0000-0000-0000000000a1') $$,
  '42501', null, 'no direct write on the guide state');
select lives_ok($$ select public.finish_guided_tour(true) $$, 'tour skipped');
select results_eq($$ select tour_skipped, tour_finished_at is not null from public.user_guide_state $$,
  $$ values (true, true) $$, 'tour state stored');
select lives_ok($$ select public.finish_guided_tour(false) $$, 'finishing again is harmless');
select is((select tour_skipped from public.user_guide_state), true, 'the first ending is kept');
select lives_ok($$ select public.mark_tip_seen('library') $$, 'tip seen');
select throws_ok($$ select public.mark_tip_seen('anything') $$, '22023', 'invalid_tip',
  'tips from a closed list');
select lives_ok($$ select public.mark_milestone_celebrated('streak_7') $$, 'milestone celebrated');
select throws_ok($$ select public.mark_milestone_celebrated('level_99') $$, '22023',
  'invalid_milestone', 'milestones from a closed list');
reset role;
update public.user_guide_state set milestones = '{"streak_7":"2026-01-01T00:00:00Z"}',
  tips_seen = '{"library":"2026-01-01"}'
where user_id = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select public.mark_milestone_celebrated('streak_7');
select public.mark_tip_seen('library');
select public.mark_milestone_celebrated('week_1');
select results_eq(
  $$ select milestones ->> 'streak_7', tips_seen ->> 'library', milestones ? 'week_1' from public.user_guide_state $$,
  $$ values ('2026-01-01T00:00:00Z'::text, '2026-01-01'::text, true) $$,
  'append only: a celebrated milestone or a seen tip is never rewritten');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.user_guide_state), 0, 'B cannot read the guide state of A');
reset role;

-- The 7-day rule for older accounts is applied by the app (tourDue, Vitest); the migration
-- backfill only covered accounts that existed when it ran.

-- ---- Goal achieved date ---------------------------------------------------------
insert into public.goals (id, user_id, title) values
  ('00000000-0000-0000-0000-00000000a1a1', '00000000-0000-0000-0000-0000000000a1', 'Goal');
update public.goals set status = 'achieved' where id = '00000000-0000-0000-0000-00000000a1a1';
select ok((select achieved_at is not null from public.goals where id = '00000000-0000-0000-0000-00000000a1a1'),
  'achieved_at set when the goal is achieved');
update public.goals set status = 'active' where id = '00000000-0000-0000-0000-00000000a1a1';
select ok((select achieved_at is null from public.goals where id = '00000000-0000-0000-0000-00000000a1a1'),
  'achieved_at cleared when reopened');

-- ---- Notes --------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select lives_ok(
  $$ insert into public.notes (entity_type, entity_id, body) values ('exercise', 'E001', 'Je le fais le matin.') $$,
  'note on an exercise');
select lives_ok(
  $$ insert into public.notes (entity_type, entity_id, body) values ('principle', 'P002', 'Mon application.') $$,
  'note on a principle');
select throws_ok(
  $$ insert into public.notes (entity_type, entity_id, body) values ('exercise', 'E001', 'Second') $$,
  '23505', null, 'one note per element');
select throws_ok(
  $$ insert into public.notes (entity_type, entity_id, body) values ('exercise', 'E999', 'Nope') $$,
  '23503', 'note_entity_not_found', 'the element must exist');
select throws_ok(
  $$ insert into public.notes (entity_type, entity_id, body) values ('exercise', 'E002', repeat('x', 2001)) $$,
  '23514', null, '2 000 characters at most');
select throws_ok(
  $$ insert into public.notes (entity_type, entity_id, body) values ('exercise', 'E002', '   ') $$,
  '23514', null, 'empty note refused');
select lives_ok(
  $$ update public.notes set body = 'Je le fais le soir.' where entity_id = 'E001' $$, 'note edited');
select throws_ok(
  $$ update public.notes set entity_id = 'E002' where entity_id = 'E001' $$,
  '42501', null, 'only the text can change');
select throws_ok(
  $$ insert into public.notes (user_id, entity_type, entity_id, body)
     values ('00000000-0000-0000-0000-0000000000b1', 'exercise', 'E003', 'Not mine') $$,
  '42501', null, 'no note for another user');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.notes), 0, 'B cannot read the notes of A');
reset role;

delete from auth.users where id = '00000000-0000-0000-0000-0000000000a1';
select is((select count(*)::int from public.notes where user_id = '00000000-0000-0000-0000-0000000000a1'),
  0, 'notes deleted with the account');

select * from finish();
rollback;
