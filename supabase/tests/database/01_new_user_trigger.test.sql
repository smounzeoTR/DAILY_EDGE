-- Sign-up creates a profile and a free subscription.
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'en@example.test',
   '{"locale":"en","display_name":"  Sam  ","timezone":"America/New_York"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'bad@example.test',
   '{"locale":"de","timezone":"Not/AZone"}');

select is(
  (select locale from public.profiles where user_id = '00000000-0000-0000-0000-0000000000e1'),
  'en',
  'locale taken from metadata'
);
select is(
  (select display_name from public.profiles where user_id = '00000000-0000-0000-0000-0000000000e1'),
  'Sam',
  'display name trimmed'
);
select is(
  (select timezone from public.profiles where user_id = '00000000-0000-0000-0000-0000000000e1'),
  'America/New_York',
  'valid timezone kept'
);
select is(
  (select locale from public.profiles where user_id = '00000000-0000-0000-0000-0000000000e2'),
  'fr',
  'unsupported locale falls back to fr'
);
select is(
  (select timezone from public.profiles where user_id = '00000000-0000-0000-0000-0000000000e2'),
  'Europe/Paris',
  'invalid timezone falls back to Europe/Paris'
);
select is(
  (select role::text from public.profiles where user_id = '00000000-0000-0000-0000-0000000000e2'),
  'user',
  'new users are not admins'
);
select is(
  (select count(*)::int from public.subscriptions
   where user_id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2')
     and plan = 'free' and status = 'active'),
  2,
  'free subscription created'
);

select * from finish();
rollback;
