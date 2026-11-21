-- Goal deadline checked by the database on every change.
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a8', 'a8@example.test', '{"timezone":"Europe/Paris"}');
create temp table d as select (now() at time zone 'Europe/Paris')::date as today;
grant select on d to authenticated;
-- An expired goal (server insert) and an active one
insert into public.goals (id, user_id, title, deadline) values
  ('00000000-0000-0000-0000-00000000a801', '00000000-0000-0000-0000-0000000000a8', 'Expired',
   (select today - 10 from d)),
  ('00000000-0000-0000-0000-00000000a802', '00000000-0000-0000-0000-0000000000a8', 'Active',
   (select today + 30 from d));

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a8","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$ update public.goals set deadline = (select today - 1 from d)
     where id = '00000000-0000-0000-0000-00000000a802' $$,
  '22023', 'invalid_goal_deadline', 'past deadline refused on update');
select throws_ok(
  $$ update public.goals set deadline = (select today from d)
     where id = '00000000-0000-0000-0000-00000000a802' $$,
  '22023', 'invalid_goal_deadline', 'today refused (must be in the future)');
select lives_ok(
  $$ update public.goals set deadline = (select today + 60 from d)
     where id = '00000000-0000-0000-0000-00000000a802' $$,
  'future deadline accepted');
select lives_ok(
  $$ update public.goals set title = 'Expired, renamed', current_value = 2
     where id = '00000000-0000-0000-0000-00000000a801' $$,
  'expired goal stays editable when the deadline is unchanged');
select lives_ok(
  $$ update public.goals set deadline = (select today - 10 from d), title = 'Same deadline'
     where id = '00000000-0000-0000-0000-00000000a801' $$,
  'unchanged deadline sent again is accepted');
select lives_ok(
  $$ update public.goals set deadline = null where id = '00000000-0000-0000-0000-00000000a801' $$,
  'deadline can be removed');
select throws_ok(
  $$ insert into public.goals (user_id, title, deadline)
     values ('00000000-0000-0000-0000-0000000000a8', 'Direct', (select today - 1 from d)) $$,
  '22023', 'invalid_goal_deadline', 'past deadline refused on a direct insert by the user');
reset role;

select is(
  (select deadline from public.goals where id = '00000000-0000-0000-0000-00000000a802'),
  (select today + 60 from d), 'only the valid change was stored');

select * from finish();
rollback;
