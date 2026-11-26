-- Notes on habits: one per user habit, only on one's own habits, deleted with the habit.
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'a19@example.test', '{"timezone":"Europe/Paris"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'b19@example.test', '{"timezone":"Europe/Paris"}');
insert into public.user_habits (id, user_id, title) values
  ('00000000-0000-0000-0000-00000000a191', '00000000-0000-0000-0000-0000000000a1', 'Trouver 3 idées'),
  ('00000000-0000-0000-0000-00000000b191', '00000000-0000-0000-0000-0000000000b1', 'Marcher');

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select lives_ok(
  $$ insert into public.notes (entity_type, entity_id, body)
     values ('habit', '00000000-0000-0000-0000-00000000a191', 'Idée : un podcast.') $$,
  'note on my habit');
select throws_ok(
  $$ insert into public.notes (entity_type, entity_id, body)
     values ('habit', '00000000-0000-0000-0000-00000000a191', 'Second') $$,
  '23505', null, 'one note per habit');
select throws_ok(
  $$ insert into public.notes (entity_type, entity_id, body)
     values ('habit', '00000000-0000-0000-0000-00000000b191', 'Not mine') $$,
  '23503', 'note_entity_not_found', 'never on the habit of another user');
select throws_ok(
  $$ insert into public.notes (entity_type, entity_id, body) values ('habit', 'H01', 'Template id') $$,
  '23503', 'note_entity_not_found', 'the habit must exist');
select lives_ok(
  $$ update public.notes set body = 'Idées : un podcast, un atelier.'
     where entity_id = '00000000-0000-0000-0000-00000000a191' $$,
  'habit note edited');
select lives_ok(
  $$ insert into public.notes (entity_type, entity_id, body) values ('exercise', 'E001', 'Toujours possible') $$,
  'notes on exercises still accepted');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.notes), 0, 'B cannot read the habit notes of A');
reset role;

delete from public.user_habits where id = '00000000-0000-0000-0000-00000000a191';
select is(
  (select count(*)::int from public.notes where entity_type = 'habit'),
  0, 'note deleted with its habit');

select * from finish();
rollback;
