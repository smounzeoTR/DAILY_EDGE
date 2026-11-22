-- Assistant cost guards: default quota 15, monthly cost cap per user, cached tokens columns.
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c2', 'c12@example.test', '{"timezone":"Europe/Paris"}'),
  ('00000000-0000-0000-0000-0000000000d2', 'd12@example.test', '{"timezone":"Europe/Paris"}');
create temp table d as select (now() at time zone 'Europe/Paris')::date as today;

select is(public.assistant_daily_limit(), 15, 'default daily quota: 15 messages');
select is(public.assistant_monthly_cap(), 2::numeric, 'default monthly cost cap: 2 EUR');

insert into public.llm_calls (user_id, feature, local_date, outcome, attempts, cost_eur,
  cache_read_tokens, cache_write_tokens) values
  ('00000000-0000-0000-0000-0000000000c2', 'assistant', (select today from d), 'success', 1, 1.5, 2000, 300),
  ('00000000-0000-0000-0000-0000000000c2', 'assistant', (select today from d), 'success', 1, 0.4, 0, 0),
  -- Other features and other months are not counted
  ('00000000-0000-0000-0000-0000000000c2', 'plan', (select today from d), 'success', 1, 5, 0, 0),
  ('00000000-0000-0000-0000-0000000000c2', 'assistant', (select today - 40 from d), 'success', 1, 5, 0, 0);

select is(public.assistant_month_cost('00000000-0000-0000-0000-0000000000c2'), 1.9::numeric,
  'assistant cost of the current month only');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
set local role authenticated;
select is((public.assistant_quota() ->> 'monthly_cap_reached')::boolean, false, 'under the cap');
select throws_ok($$ select public.assistant_month_cost('00000000-0000-0000-0000-0000000000d2') $$,
  '42501', null, 'users cannot read the cost of another user');
reset role;
insert into public.llm_calls (user_id, feature, local_date, outcome, attempts, cost_eur) values
  ('00000000-0000-0000-0000-0000000000c2', 'assistant', (select today from d), 'success', 1, 0.2);
set local role authenticated;
select is((public.assistant_quota() ->> 'monthly_cap_reached')::boolean, true, 'cap reached at 2 EUR');
reset role;
update public.app_settings set value = '5' where key = 'assistant_monthly_cost_cap_eur';
set local role authenticated;
select is((public.assistant_quota() ->> 'monthly_cap_reached')::boolean, false,
  'the cap is configurable without deployment');
reset role;
select is((select sum(cache_read_tokens)::int from public.llm_calls
           where user_id = '00000000-0000-0000-0000-0000000000c2'), 2000, 'cached tokens logged');

select * from finish();
rollback;
