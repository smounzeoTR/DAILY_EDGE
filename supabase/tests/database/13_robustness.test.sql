-- Lot 10a: audience measurement consent, low-mood support card once per episode.
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a3', 'a13@example.test', '{"timezone":"Europe/Paris"}');
create temp table d as select (now() at time zone 'Europe/Paris')::date as today;
grant select on d to authenticated;

select is((select consent_analytics from public.profiles
           where user_id = '00000000-0000-0000-0000-0000000000a3'), false,
  'audience measurement off by default');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ update public.profiles set consent_analytics = true
     where user_id = '00000000-0000-0000-0000-0000000000a3' $$,
  'the user can give the consent');
select throws_ok($$ select public.mark_support_shown((select today from d)) $$,
  '22023', 'invalid_episode', 'an episode cannot start today');
select lives_ok($$ select public.mark_support_shown((select today - 6 from d)) $$,
  'episode marked as shown');
reset role;
update public.user_guide_state set support_seen = jsonb_build_object(
  ((select today - 6 from d))::text, '2026-01-01T00:00:00Z')
where user_id = '00000000-0000-0000-0000-0000000000a3';
set local role authenticated;
select public.mark_support_shown((select today - 6 from d));
select is((select support_seen ->> ((select today - 6 from d))::text from public.user_guide_state),
  '2026-01-01T00:00:00Z', 'once per episode: never rewritten');
select lives_ok($$ select public.mark_support_shown((select today - 20 from d)) $$,
  'another episode is recorded separately');
select is((select count(*)::int from jsonb_object_keys(
  (select support_seen from public.user_guide_state))), 2, 'two episodes');
reset role;

select * from finish();
rollback;
