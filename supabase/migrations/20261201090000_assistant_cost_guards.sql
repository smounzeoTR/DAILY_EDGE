-- Assistant cost guards and prompt caching: cached tokens logged per call, default daily quota
-- down to 15 messages, monthly cost cap per user (assistant_monthly_cost_cap_eur, 2 EUR).

alter table public.llm_calls
  add column cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  add column cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0);

-- 15 messages a day by default (a value changed by hand is kept)
update public.app_settings set value = '15'
where key = 'assistant_daily_messages' and value = '30'::jsonb;
insert into public.app_settings (key, value) values ('assistant_monthly_cost_cap_eur', '2')
on conflict (key) do nothing;

create or replace function public.assistant_daily_limit()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::integer from public.app_settings
                   where key = 'assistant_daily_messages'), 15);
$$;

create function public.assistant_monthly_cap()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::numeric from public.app_settings
                   where key = 'assistant_monthly_cost_cap_eur'), 2);
$$;
revoke all on function public.assistant_monthly_cap() from public, anon;
grant execute on function public.assistant_monthly_cap() to authenticated, service_role;

-- Assistant cost of the user's current month (local time), all calls included
create function public.assistant_month_cost(p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(c.cost_eur), 0)
  from public.llm_calls c
  join public.profiles p on p.user_id = c.user_id
  where c.user_id = p_user_id
    and c.feature = 'assistant'
    and date_trunc('month', c.local_date) = date_trunc('month', (now() at time zone p.timezone)::date);
$$;
revoke all on function public.assistant_month_cost(uuid) from public, anon, authenticated;
grant execute on function public.assistant_month_cost(uuid) to service_role;

-- Messages sent today, daily limit, and whether the monthly cost cap is reached
create or replace function public.assistant_quota()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'used', (
      select count(*) from public.assistant_messages m
      join public.profiles p on p.user_id = m.user_id
      where m.user_id = (select auth.uid()) and m.role = 'user'
        and (m.created_at at time zone p.timezone)::date = public.current_user_local_date()
    ),
    'limit', public.assistant_daily_limit(),
    'monthly_cap_reached',
      public.assistant_month_cost((select auth.uid())) >= public.assistant_monthly_cap()
  );
$$;
