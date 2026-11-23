-- Lot 10b: beta launch. Adult confirmation (18+), feedback, premium granted by an admin
-- (aal2, audited), operations alerts (fallback batch, daily AI cost) and beta metrics.

-- ---------------------------------------------------------------------------
-- Adult confirmation: required before an app user completes onboarding
-- ---------------------------------------------------------------------------
alter table public.profiles add column adult_confirmed_at timestamptz;

create function public.confirm_adult_age()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  -- The first confirmation is kept
  update public.profiles
  set adult_confirmed_at = coalesce(adult_confirmed_at, now())
  where user_id = (select auth.uid())
  returning adult_confirmed_at into v_at;
  return v_at;
end;
$$;
revoke all on function public.confirm_adult_age() from public, anon;
grant execute on function public.confirm_adult_age() to authenticated;

-- App users (JWT role authenticated) cannot be onboarded without the confirmation;
-- server-side writes (service role, seeds) are not concerned.
create function public.require_adult_on_onboarding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.onboarded_at is not null and old.onboarded_at is null
     and new.adult_confirmed_at is null
     and coalesce((select auth.role()), '') = 'authenticated' then
    raise exception using errcode = '22023', message = 'adult_confirmation_required';
  end if;
  return new;
end;
$$;
revoke all on function public.require_adult_on_onboarding() from public, anon, authenticated;
create trigger profiles_require_adult before update of onboarded_at on public.profiles
  for each row execute function public.require_adult_on_onboarding();

-- ---------------------------------------------------------------------------
-- Feedback ("Donner mon avis"): free text with the app version
-- ---------------------------------------------------------------------------
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 2000),
  app_version text not null check (length(app_version) between 1 and 40),
  build text check (length(build) <= 40),
  platform text not null check (platform in ('ios', 'android', 'web')),
  locale text not null check (locale in ('fr', 'en')),
  created_at timestamptz not null default now()
);
create index feedback_created_idx on public.feedback (created_at desc);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
grant select, insert on public.feedback to authenticated;
grant all on public.feedback to service_role;
create policy feedback_select_own on public.feedback
  for select to authenticated using (user_id = (select auth.uid()));
create policy feedback_insert_own on public.feedback
  for insert to authenticated with check (user_id = (select auth.uid()));

-- At most 20 feedbacks per user and day (abuse guard)
create function public.limit_feedback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.feedback
      where user_id = new.user_id and created_at > now() - interval '1 day') >= 20 then
    raise exception using errcode = '54000', message = 'feedback_limit';
  end if;
  return new;
end;
$$;
revoke all on function public.limit_feedback() from public, anon, authenticated;
create trigger feedback_limit before insert on public.feedback
  for each row execute function public.limit_feedback();

-- ---------------------------------------------------------------------------
-- Administration audit trail (never readable by users)
-- ---------------------------------------------------------------------------
create table public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_user_id uuid references auth.users (id) on delete set null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon, authenticated;
grant all on public.admin_audit to service_role;

-- ---------------------------------------------------------------------------
-- Premium granted by an admin to a beta tester (aal2 via require_admin)
-- ---------------------------------------------------------------------------
create function public.admin_grant_premium(p_email text, p_until date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_end timestamptz;
begin
  perform public.require_admin();
  if p_until is null or p_until < v_today or p_until > v_today + 366 then
    raise exception using errcode = '22023', message = 'invalid_until';
  end if;
  select id into v_user_id from auth.users where lower(email) = lower(trim(p_email));
  if v_user_id is null then
    raise exception using errcode = 'P0002', message = 'user_not_found';
  end if;
  -- Valid until the end of that day (Paris time)
  v_end := ((p_until + 1)::timestamp at time zone 'Europe/Paris');
  insert into public.subscriptions (user_id, plan, provider, status, current_period_end)
  values (v_user_id, 'premium', 'beta_grant', 'active', v_end)
  on conflict (user_id) do update
    set plan = 'premium', provider = 'beta_grant', status = 'active',
        current_period_end = excluded.current_period_end, updated_at = now();
  insert into public.admin_audit (admin_id, action, target_user_id, detail)
  values ((select auth.uid()), 'grant_premium', v_user_id, jsonb_build_object('until', p_until));
  return jsonb_build_object('user_id', v_user_id, 'until', p_until);
end;
$$;
revoke all on function public.admin_grant_premium(text, date) from public, anon;
grant execute on function public.admin_grant_premium(text, date) to authenticated;

create function public.admin_revoke_premium(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  perform public.require_admin();
  select id into v_user_id from auth.users where lower(email) = lower(trim(p_email));
  if v_user_id is null then
    raise exception using errcode = 'P0002', message = 'user_not_found';
  end if;
  update public.subscriptions
  set plan = 'free', provider = null, current_period_end = null, updated_at = now()
  where user_id = v_user_id;
  insert into public.admin_audit (admin_id, action, target_user_id)
  values ((select auth.uid()), 'revoke_premium', v_user_id);
end;
$$;
revoke all on function public.admin_revoke_premium(text) from public, anon;
grant execute on function public.admin_revoke_premium(text) to authenticated;

-- Premium accounts (beta grants and others), soonest end first
create function public.admin_list_premium()
returns table (email text, provider text, until timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select u.email::text, s.provider, s.current_period_end
  from public.subscriptions s
  join auth.users u on u.id = s.user_id
  where s.plan = 'premium' and s.status = 'active'
    and (s.current_period_end is null or s.current_period_end > now())
  order by s.current_period_end nulls last, u.email;
end;
$$;
revoke all on function public.admin_list_premium() from public, anon;
grant execute on function public.admin_list_premium() to authenticated;

-- Feedback for the administration (newest first)
create function public.admin_feedback(p_limit integer default 100)
returns table (
  id uuid,
  email text,
  body text,
  app_version text,
  build text,
  platform text,
  locale text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select f.id, u.email::text, f.body, f.app_version, f.build, f.platform, f.locale, f.created_at
  from public.feedback f
  left join auth.users u on u.id = f.user_id
  order by f.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;
revoke all on function public.admin_feedback(integer) from public, anon;
grant execute on function public.admin_feedback(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Operations: fallback batch runs and alerts
-- ---------------------------------------------------------------------------
create table public.ops_batch_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  ok boolean not null,
  summary jsonb not null default '{}'
);
create index ops_batch_runs_started_idx on public.ops_batch_runs (started_at desc);
alter table public.ops_batch_runs enable row level security;
revoke all on public.ops_batch_runs from anon, authenticated;
grant all on public.ops_batch_runs to service_role;

create table public.ops_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('batch_missing', 'batch_failed', 'ai_cost')),
  day date not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  -- One alert per kind and day
  unique (kind, day)
);
alter table public.ops_alerts enable row level security;
revoke all on public.ops_alerts from anon, authenticated;
grant all on public.ops_alerts to service_role;

-- Daily AI cost above which an alert is raised (euros, all users)
insert into public.app_settings (key, value) values ('ops_ai_daily_cost_alert_eur', '5');

-- Records the end of a batch run (called by generate-plans-batch)
create function public.record_batch_run(p_started_at timestamptz, p_ok boolean, p_summary jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ops_batch_runs (started_at, ok, summary)
  values (p_started_at, p_ok, coalesce(p_summary, '{}'));
  -- Keep 60 days of runs
  delete from public.ops_batch_runs where started_at < now() - interval '60 days';
$$;
revoke all on function public.record_batch_run(timestamptz, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.record_batch_run(timestamptz, boolean, jsonb) to service_role;

-- Raises the alerts due at p_now; returns how many were created
create function public.check_ops_alerts(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (p_now at time zone 'Europe/Paris')::date;
  v_created integer := 0;
  v_rows integer;
  v_last public.ops_batch_runs;
  v_cost numeric;
  v_threshold numeric;
begin
  select * into v_last from public.ops_batch_runs
  where started_at <= p_now order by started_at desc limit 1;

  -- The hourly batch has not finished for more than 2 hours
  if v_last.id is null or v_last.started_at < p_now - interval '2 hours' then
    insert into public.ops_alerts (kind, day, detail)
    values ('batch_missing', v_day, jsonb_build_object('last_run', v_last.started_at))
    on conflict (kind, day) do nothing;
    get diagnostics v_rows = row_count;
    v_created := v_created + v_rows;
  elsif not v_last.ok then
    insert into public.ops_alerts (kind, day, detail)
    values ('batch_failed', v_day,
            jsonb_build_object('run', v_last.started_at, 'summary', v_last.summary))
    on conflict (kind, day) do nothing;
    get diagnostics v_rows = row_count;
    v_created := v_created + v_rows;
  end if;

  select coalesce(sum(cost_eur), 0) into v_cost from public.llm_calls
  where (created_at at time zone 'Europe/Paris')::date = v_day;
  select (value #>> '{}')::numeric into v_threshold
  from public.app_settings where key = 'ops_ai_daily_cost_alert_eur';
  if v_threshold is not null and v_cost > v_threshold then
    insert into public.ops_alerts (kind, day, detail)
    values ('ai_cost', v_day, jsonb_build_object('cost_eur', round(v_cost, 4), 'threshold_eur', v_threshold))
    on conflict (kind, day) do nothing;
    get diagnostics v_rows = row_count;
    v_created := v_created + v_rows;
  end if;
  return v_created;
end;
$$;
revoke all on function public.check_ops_alerts(timestamptz) from public, anon, authenticated;
grant execute on function public.check_ops_alerts(timestamptz) to service_role;

-- Hourly job: raises the alerts, then asks the ops-alert Edge Function to e-mail the pending ones.
-- URL in Vault (ops_alert_url); the shared secret is plans_batch_secret.
create function public.run_ops_checks()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  perform public.check_ops_alerts(now());
  if not exists (select 1 from public.ops_alerts where notified_at is null) then
    return null;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'ops_alert_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'plans_batch_secret';
  if v_url is null or v_secret is null then
    raise warning 'ops alert e-mail not configured (vault secrets missing)';
    return null;
  end if;
  return net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-batch-secret', v_secret),
    timeout_milliseconds := 30000
  );
end;
$$;
revoke all on function public.run_ops_checks() from public, anon, authenticated;

select cron.schedule('ops-checks', '30 * * * *', 'select public.run_ops_checks()');

-- Alerts for the administration (newest first)
create function public.admin_ops_alerts(p_limit integer default 50)
returns table (
  id uuid,
  kind text,
  day date,
  detail jsonb,
  created_at timestamptz,
  notified_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select a.id, a.kind, a.day, a.detail, a.created_at, a.notified_at
  from public.ops_alerts a
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;
revoke all on function public.admin_ops_alerts(integer) from public, anon;
grant execute on function public.admin_ops_alerts(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Beta metrics (specification § 9) over [p_from, p_to], Paris dates.
-- Activity day: an exercise done, a habit checked or a check-in.
-- D7 / D30 retention: onboarding cohort of the period, active on at least one day
-- in [D+7, D+13] / [D+30, D+36] (cohort members whose window has not ended are left out).
-- ---------------------------------------------------------------------------
create function public.admin_metrics(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_from date;
  v_to date;
  v_result jsonb;
begin
  perform public.require_admin();
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 366 then
    raise exception using errcode = '22023', message = 'invalid_period';
  end if;
  v_from := p_from;
  v_to := least(p_to, v_today);

  with activity as (
    select dp.user_id, dp.date as day
    from public.daily_plans dp
    join public.plan_items pi on pi.plan_id = dp.id and pi.status = 'done'
    union
    select c.user_id, c.date from public.checkins c
    union
    select h.user_id, h.date from public.habit_logs h where h.done
  ),
  signups as (
    select u.id as user_id, p.onboarded_at
    from auth.users u
    join public.profiles p on p.user_id = u.id
    where (u.created_at at time zone p.timezone)::date between v_from and v_to
  ),
  cohort as (
    select p.user_id, (p.onboarded_at at time zone p.timezone)::date as d0
    from public.profiles p
    where p.onboarded_at is not null
      and (p.onboarded_at at time zone p.timezone)::date between v_from and v_to
  ),
  d7 as (
    select count(*) as total,
      count(*) filter (where exists (
        select 1 from activity a
        where a.user_id = c.user_id and a.day between c.d0 + 7 and c.d0 + 13)) as kept
    from cohort c where c.d0 + 13 < v_today
  ),
  d30 as (
    select count(*) as total,
      count(*) filter (where exists (
        select 1 from activity a
        where a.user_id = c.user_id and a.day between c.d0 + 30 and c.d0 + 36)) as kept
    from cohort c where c.d0 + 36 < v_today
  ),
  active_days as (
    select a.user_id, a.day from activity a where a.day between v_from and v_to
  ),
  checkin_days as (
    select count(*) as total,
      count(*) filter (where exists (
        select 1 from public.checkins c where c.user_id = ad.user_id and c.date = ad.day)) as with_checkin
    from active_days ad
  ),
  items as (
    select pi.status, pi.rating
    from public.plan_items pi
    join public.daily_plans dp on dp.id = pi.plan_id
    where pi.origin = 'engine' and dp.date between v_from and least(v_to, v_today - 1)
  ),
  proposals as (
    select
      coalesce(sum(jsonb_array_length(wr.proposals)), 0) as total,
      coalesce(sum((select count(*) from jsonb_each(wr.accepted) e
                    where (e.value ->> 'accept')::boolean)), 0) as accepted
    from public.weekly_reviews wr
    where (wr.generated_at at time zone 'Europe/Paris')::date between v_from and v_to
  ),
  cost as (
    select coalesce(sum(cost_eur), 0) as eur from public.llm_calls
    where (created_at at time zone 'Europe/Paris')::date between v_from and v_to
  ),
  actives as (select count(distinct user_id) as n from active_days)
  select jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'signups', (select count(*) from signups),
    'onboarded', (select count(*) filter (where onboarded_at is not null) from signups),
    'd7_total', (select total from d7),
    'd7_kept', (select kept from d7),
    'd30_total', (select total from d30),
    'd30_kept', (select kept from d30),
    'active_users', (select n from actives),
    'active_days', (select total from checkin_days),
    'active_days_with_checkin', (select with_checkin from checkin_days),
    'exercises_total', (select count(*) from items),
    'exercises_done', (select count(*) filter (where status = 'done') from items),
    'rating_avg', (select round(avg(rating), 2) from items where rating is not null),
    'ratings', (select count(rating) from items),
    'proposals_total', (select total from proposals),
    'proposals_accepted', (select accepted from proposals),
    'ai_cost_eur', (select round(eur, 4) from cost),
    -- Per active user, scaled to 30 days
    'ai_cost_per_active_user_month_eur', (
      select case when a.n = 0 then null
        else round(c.eur / a.n * 30.0 / (v_to - v_from + 1), 4) end
      from cost c, actives a)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.admin_metrics(date, date) from public, anon;
grant execute on function public.admin_metrics(date, date) to authenticated;
