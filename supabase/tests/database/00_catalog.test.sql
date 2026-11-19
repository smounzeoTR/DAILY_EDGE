-- Catalogue loaded by seed.sql and readable according to RLS.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

-- Expected counts (lot 1 acceptance)
select is((select count(*)::int from public.sources), 15, '15 sources');
select is((select count(*)::int from public.principles), 115, '115 principles');
select is((select count(*)::int from public.exercises), 287, '287 exercises');
select is((select count(*)::int from public.habit_templates), 42, '42 habit templates');
select is((select count(*)::int from public.programs), 4, '4 programs');
select is((select count(*)::int from public.program_steps), 112, '112 program steps');

-- Every exercise has a main principle (position 1)
select is(
  (select count(*)::int from public.exercises e
   where not exists (
     select 1 from public.exercise_principles ep
     where ep.exercise_id = e.id and ep.position = 1
   )),
  0,
  'every exercise has a main principle'
);

-- Retire one exercise to check that unpublished content is hidden
update public.exercises set status = 'retired' where id = 'E001';

set local role anon;
select is((select count(*)::int from public.exercises), 286, 'anon reads published exercises only');
select is((select count(*)::int from public.program_steps), 112, 'anon reads program steps');
select throws_ok(
  $$ insert into public.sources (id, author, title_fr, title_original) values ('S99', 'x', 'x', 'x') $$,
  '42501',
  null,
  'anon cannot write content'
);
reset role;

-- A regular user cannot modify content (no admin policy match)
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'reader@example.test');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;
update public.exercises set title_fr = 'hacked' where id = 'E002';
reset role;
select is(
  (select title_fr from public.exercises where id = 'E002'),
  'Ce que je donne en échange',
  'regular user cannot update content'
);

-- An admin sees unpublished content and can edit it
update public.profiles set role = 'admin' where user_id = '00000000-0000-0000-0000-0000000000c1';
set local role authenticated;
select is((select count(*)::int from public.exercises), 287, 'admin reads all statuses');
update public.exercises set status = 'published' where id = 'E001';
reset role;
select is(
  (select status::text from public.exercises where id = 'E001'),
  'published',
  'admin can update content'
);

select * from finish();
rollback;
