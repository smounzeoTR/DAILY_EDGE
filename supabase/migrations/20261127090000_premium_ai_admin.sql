-- Lot 7: premium switch, AI call log (llm_calls), AI enrichment of plans and reviews,
-- read-only administration with mandatory MFA (aal2).

-- ---------------------------------------------------------------------------
-- Server settings (never readable or writable by users)
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
grant all on public.app_settings to service_role;

-- Prototype premium switch: off by default (true only in seeds/local_dev.sql)
insert into public.app_settings (key, value) values ('allow_plan_toggle', 'false');

create function public.app_setting_enabled(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select value = 'true'::jsonb from public.app_settings where key = p_key), false);
$$;
revoke all on function public.app_setting_enabled(text) from public, anon, authenticated;
grant execute on function public.app_setting_enabled(text) to service_role;

-- Flags the app needs (no other setting is exposed)
create function public.get_app_flags()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('allow_plan_toggle', public.app_setting_enabled('allow_plan_toggle'));
$$;
revoke all on function public.get_app_flags() from public, anon;
grant execute on function public.get_app_flags() to authenticated;

-- ---------------------------------------------------------------------------
-- Premium: single point of truth
-- ---------------------------------------------------------------------------
create function public.is_premium(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- A user may only ask about themselves (server and admins: anyone)
    (
      (select auth.uid()) is null
      or (select auth.uid()) = p_user_id
      or public.is_admin()
    )
    and exists (
      select 1 from public.subscriptions s
      where s.user_id = p_user_id
        and s.plan = 'premium'
        and s.status = 'active'
        and (s.current_period_end is null or s.current_period_end > now())
    );
$$;
revoke all on function public.is_premium(uuid) from public, anon;
grant execute on function public.is_premium(uuid) to authenticated, service_role;

-- Prototype only: switch one's own plan when the server setting allows it
create function public.dev_set_plan(p_plan public.subscription_plan)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if not public.app_setting_enabled('allow_plan_toggle') then
    raise exception using errcode = '42501', message = 'plan_toggle_disabled';
  end if;
  update public.subscriptions
  set plan = p_plan, status = 'active', provider = 'dev', current_period_end = null
  where user_id = v_user_id;
end;
$$;
revoke all on function public.dev_set_plan(public.subscription_plan) from public, anon;
grant execute on function public.dev_set_plan(public.subscription_plan) to authenticated;

-- ---------------------------------------------------------------------------
-- AI enrichment state of plans and reviews
-- ---------------------------------------------------------------------------
alter table public.daily_plans
  add column ai_status text check (ai_status in ('pending', 'enriched', 'fallback'));
alter table public.weekly_reviews
  add column ai_status text check (ai_status in ('pending', 'enriched', 'fallback'));

-- ---------------------------------------------------------------------------
-- AI call log: one row per logical call (a retry is the same call)
-- ---------------------------------------------------------------------------
create type public.llm_feature as enum ('plan', 'review', 'assistant');
-- success: output used or applied; fallback: rules kept (see fallback_reason);
-- cache_hit: output reused for an identical input (no provider call);
-- quota_exceeded: daily cap reached (no provider call)
create type public.llm_outcome as enum ('success', 'fallback', 'cache_hit', 'quota_exceeded');

create table public.llm_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  feature public.llm_feature not null,
  -- User's local date of the call (daily caps)
  local_date date not null,
  provider text,
  model text,
  outcome public.llm_outcome not null,
  fallback_reason text,
  attempts smallint not null default 0 check (attempts between 0 and 5),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_eur numeric(12, 6) not null default 0 check (cost_eur >= 0),
  latency_ms integer check (latency_ms >= 0),
  input_hash text,
  -- Validated output (reused for an identical input)
  output jsonb,
  decision_id uuid references public.engine_decisions (id) on delete set null,
  review_id uuid references public.weekly_reviews (id) on delete set null,
  created_at timestamptz not null default now()
);
create index llm_calls_user_day_idx on public.llm_calls (user_id, local_date, feature);
create index llm_calls_user_hash_idx on public.llm_calls (user_id, input_hash);
create index llm_calls_created_idx on public.llm_calls (created_at);

alter table public.llm_calls enable row level security;
revoke all on public.llm_calls from anon, authenticated;
grant all on public.llm_calls to service_role;

-- ---------------------------------------------------------------------------
-- save_daily_plan: also sets ai_status and returns the decision id
-- ---------------------------------------------------------------------------
create or replace function public.save_daily_plan(
  p_user_id uuid,
  p_date date,
  p_plan jsonb,
  p_decision jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_touched boolean;
  v_status text;
  v_item jsonb;
  v_engine_count integer;
  v_was_generated boolean;
  v_decision_id uuid;
begin
  -- Serializes concurrent generations for the same user
  perform 1 from public.profiles where user_id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'profile_not_found';
  end if;

  select id into v_plan_id from public.daily_plans where user_id = p_user_id and date = p_date;
  if v_plan_id is not null then
    select exists (
      select 1 from public.plan_items
      where plan_id = v_plan_id and origin = 'engine' and status <> 'todo'
    ) into v_touched;
    if v_touched then
      return jsonb_build_object('plan_id', v_plan_id, 'status', 'unchanged');
    end if;
    select generated_at is not null into v_was_generated from public.daily_plans where id = v_plan_id;
    update public.daily_plans set
      principle_id = p_plan ->> 'principle_id',
      mode = (p_plan ->> 'mode')::public.plan_mode,
      program_day = (p_plan ->> 'program_day')::smallint,
      program_id = p_plan ->> 'program_id',
      why_today = p_plan ->> 'why_today',
      introduced_habit_id = p_plan ->> 'introduced_habit_id',
      ai_status = p_plan ->> 'ai_status',
      generated_at = now()
    where id = v_plan_id;
    -- An empty plan created by a user addition is "created" by its first computation
    v_status := case when v_was_generated then 'recomputed' else 'created' end;
    -- Adopted items go back to user additions; the new decision may adopt them again
    update public.plan_items set origin = 'user', adopted = false, personalized_instructions = null
    where plan_id = v_plan_id and adopted;
    delete from public.plan_items where plan_id = v_plan_id and origin = 'engine';
  else
    insert into public.daily_plans (
      user_id, date, principle_id, mode, program_day, program_id, why_today, introduced_habit_id,
      ai_status, generated_at
    ) values (
      p_user_id,
      p_date,
      p_plan ->> 'principle_id',
      (p_plan ->> 'mode')::public.plan_mode,
      (p_plan ->> 'program_day')::smallint,
      p_plan ->> 'program_id',
      p_plan ->> 'why_today',
      p_plan ->> 'introduced_habit_id',
      p_plan ->> 'ai_status',
      now()
    )
    returning id into v_plan_id;
    v_status := 'created';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_plan -> 'items', '[]')) loop
    if coalesce((v_item ->> 'adopted')::boolean, false) then
      update public.plan_items
      set origin = 'engine', adopted = true, position = (v_item ->> 'position')::smallint
      where plan_id = v_plan_id and exercise_id = v_item ->> 'exercise_id' and origin = 'user';
      if found then
        continue;
      end if;
    end if;
    insert into public.plan_items (plan_id, user_id, exercise_id, position, origin)
    values (v_plan_id, p_user_id, v_item ->> 'exercise_id', (v_item ->> 'position')::smallint, 'engine');
  end loop;

  -- User additions come after the engine items, in their original order
  select count(*) into v_engine_count from public.plan_items where plan_id = v_plan_id and origin = 'engine';
  update public.plan_items pi set position = v_engine_count + ranked.rn
  from (
    select id, row_number() over (order by position, created_at) as rn
    from public.plan_items where plan_id = v_plan_id and origin = 'user'
  ) ranked
  where pi.id = ranked.id;

  insert into public.engine_decisions (
    user_id, plan_id, rules_fired, candidates, why, fallback_used, latency_ms
  ) values (
    p_user_id,
    v_plan_id,
    array(select jsonb_array_elements_text(coalesce(p_decision -> 'rules_fired', '[]'))),
    coalesce(p_decision -> 'candidates', '[]'),
    p_decision -> 'why',
    false,
    (p_decision ->> 'latency_ms')::integer
  )
  returning id into v_decision_id;

  -- Program day follows the latest plan only (generating an older date never moves it back)
  if not exists (
    select 1 from public.daily_plans where user_id = p_user_id and date > p_date
  ) then
    update public.profiles
    set program_day = (p_plan ->> 'next_program_day')::smallint
    where user_id = p_user_id;
  end if;

  return jsonb_build_object('plan_id', v_plan_id, 'status', v_status, 'decision_id', v_decision_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- AI enrichment of a plan (server only). Applied only if the plan was neither
-- recomputed (same generated_at) nor touched since the rules computed it.
-- p_result: {"status":"fallback"} or
--   {"status":"enriched","replace":bool,"why_today":text,
--    "items":[{"exercise_id":text,"instructions":text}]}
-- replace = true (catalogue mode): the AI choice replaces the engine items;
-- replace = false (program mode): only the instructions of the engine items change.
-- Returns applied | fallback | stale | conflict | missing.
-- ---------------------------------------------------------------------------
create function public.apply_plan_enrichment(
  p_plan_id uuid,
  p_generated_at timestamptz,
  p_result jsonb
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan public.daily_plans%rowtype;
  v_item jsonb;
  v_position smallint := 0;
  v_engine_count integer;
  v_first text;
begin
  select * into v_plan from public.daily_plans where id = p_plan_id for update;
  if not found then
    return 'missing';
  end if;
  -- Locks the items too: a result saved meanwhile waits, then sees the enrichment
  perform 1 from public.plan_items where plan_id = p_plan_id for update;

  if v_plan.generated_at is distinct from p_generated_at then
    -- Recomputed since: the new computation owns ai_status
    return 'stale';
  end if;
  if exists (
    select 1 from public.plan_items
    where plan_id = p_plan_id and origin = 'engine' and status <> 'todo'
  ) then
    update public.daily_plans set ai_status = 'fallback' where id = p_plan_id;
    return 'stale';
  end if;
  if coalesce(p_result ->> 'status', 'fallback') <> 'enriched' then
    update public.daily_plans set ai_status = 'fallback' where id = p_plan_id;
    return 'fallback';
  end if;

  if coalesce((p_result ->> 'replace')::boolean, false) then
    -- An exercise the user added meanwhile cannot be proposed twice
    if exists (
      select 1 from public.plan_items pi
      join jsonb_array_elements(p_result -> 'items') x on pi.exercise_id = x ->> 'exercise_id'
      where pi.plan_id = p_plan_id and pi.origin = 'user'
    ) or exists (
      select 1 from public.plan_items where plan_id = p_plan_id and origin = 'engine' and adopted
    ) then
      update public.daily_plans set ai_status = 'fallback' where id = p_plan_id;
      return 'conflict';
    end if;
    delete from public.plan_items where plan_id = p_plan_id and origin = 'engine';
    for v_item in select * from jsonb_array_elements(p_result -> 'items') loop
      v_position := v_position + 1;
      insert into public.plan_items (
        plan_id, user_id, exercise_id, position, origin, personalized_instructions
      ) values (
        p_plan_id, v_plan.user_id, v_item ->> 'exercise_id', v_position, 'engine',
        nullif(v_item ->> 'instructions', '')
      );
    end loop;
    select count(*) into v_engine_count from public.plan_items where plan_id = p_plan_id and origin = 'engine';
    update public.plan_items pi set position = v_engine_count + ranked.rn
    from (
      select id, row_number() over (order by position, created_at) as rn
      from public.plan_items where plan_id = p_plan_id and origin = 'user'
    ) ranked
    where pi.id = ranked.id;
    -- Catalogue mode: principle of the first exercise
    v_first := p_result -> 'items' -> 0 ->> 'exercise_id';
    update public.daily_plans set principle_id = coalesce(
      (select principle_id from public.exercise_principles
       where exercise_id = v_first order by position limit 1),
      principle_id
    ) where id = p_plan_id;
  else
    for v_item in select * from jsonb_array_elements(p_result -> 'items') loop
      update public.plan_items
      set personalized_instructions = nullif(v_item ->> 'instructions', '')
      where plan_id = p_plan_id and origin = 'engine' and exercise_id = v_item ->> 'exercise_id';
    end loop;
  end if;

  update public.daily_plans
  set why_today = coalesce(nullif(p_result ->> 'why_today', ''), why_today), ai_status = 'enriched'
  where id = p_plan_id;
  return 'applied';
end;
$$;
revoke all on function public.apply_plan_enrichment from public, anon, authenticated;
grant execute on function public.apply_plan_enrichment to service_role;

-- ---------------------------------------------------------------------------
-- AI enrichment of a weekly review (server only): summary and proposal texts.
-- Only the "text" key of each proposal is written: types and parameters never change.
-- p_result: {"status":"fallback"} or {"status":"enriched","summary":text,"texts":[text]}
-- ---------------------------------------------------------------------------
create function public.apply_review_enrichment(p_review_id uuid, p_result jsonb)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_review public.weekly_reviews%rowtype;
begin
  select * into v_review from public.weekly_reviews where id = p_review_id for update;
  if not found then
    return 'missing';
  end if;
  if coalesce(p_result ->> 'status', 'fallback') <> 'enriched'
     or jsonb_typeof(p_result -> 'texts') <> 'array'
     or jsonb_array_length(p_result -> 'texts') <> jsonb_array_length(v_review.proposals) then
    update public.weekly_reviews set ai_status = 'fallback' where id = p_review_id;
    return 'fallback';
  end if;
  update public.weekly_reviews set
    summary = nullif(p_result ->> 'summary', ''),
    proposals = coalesce((
      select jsonb_agg(p.value || jsonb_build_object('text', t.value) order by p.ordinality)
      from jsonb_array_elements(v_review.proposals) with ordinality p
      join jsonb_array_elements_text(p_result -> 'texts') with ordinality t
        on t.ordinality = p.ordinality
    ), '[]'),
    ai_status = 'enriched'
  where id = p_review_id;
  return 'applied';
end;
$$;
revoke all on function public.apply_review_enrichment from public, anon, authenticated;
grant execute on function public.apply_review_enrichment to service_role;

-- ---------------------------------------------------------------------------
-- Administration: admin role AND a two-factor session (aal2, Supabase TOTP)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
    and exists (
      select 1 from public.profiles
      where user_id = (select auth.uid()) and role = 'admin'
    );
$$;

create function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
end;
$$;
revoke all on function public.require_admin() from public, anon, authenticated;

-- Per exercise over a period: proposals (engine items) and their outcomes
create function public.admin_exercise_stats(p_from date, p_to date)
returns table (
  exercise_id text,
  title_fr text,
  title_en text,
  domain public.domain,
  status public.content_status,
  proposed integer,
  added integer,
  done integer,
  done_rate numeric,
  avg_rating numeric,
  too_hard_rate numeric,
  skip_rate numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  with items as (
    select pi.exercise_id, pi.origin, pi.status, pi.rating
    from public.plan_items pi
    join public.daily_plans dp on dp.id = pi.plan_id
    where dp.date between p_from and p_to
  ), agg as (
    select
      i.exercise_id,
      count(*) filter (where i.origin = 'engine')::integer as proposed,
      count(*) filter (where i.origin = 'user')::integer as added,
      count(*) filter (where i.origin = 'engine' and i.status = 'done')::integer as done,
      count(*) filter (where i.origin = 'engine' and i.status = 'too_hard')::integer as too_hard,
      count(*) filter (where i.origin = 'engine' and i.status = 'skipped')::integer as skipped,
      avg(i.rating) filter (where i.rating is not null) as avg_rating
    from items i
    group by i.exercise_id
  )
  select
    e.id, e.title_fr, e.title_en, e.domain, e.status,
    coalesce(a.proposed, 0), coalesce(a.added, 0), coalesce(a.done, 0),
    round(a.done::numeric / nullif(a.proposed, 0), 3),
    round(a.avg_rating, 2),
    round(a.too_hard::numeric / nullif(a.proposed, 0), 3),
    round(a.skipped::numeric / nullif(a.proposed, 0), 3)
  from public.exercises e
  left join agg a on a.exercise_id = e.id
  order by e.id;
end;
$$;
revoke all on function public.admin_exercise_stats(date, date) from public, anon;
grant execute on function public.admin_exercise_stats(date, date) to authenticated;

-- Engine decisions of one user found by e-mail, with the AI calls linked to them
create function public.admin_engine_log(p_email text, p_limit integer default 30)
returns table (
  decision_id uuid,
  created_at timestamptz,
  plan_date date,
  mode public.plan_mode,
  program_day smallint,
  ai_status text,
  rules_fired text[],
  why jsonb,
  candidates jsonb,
  items jsonb,
  llm_calls jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  perform public.require_admin();
  select u.id into v_user_id from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_user_id is null then
    raise exception using errcode = 'P0002', message = 'user_not_found';
  end if;
  return query
  select
    d.id, d.created_at, dp.date, dp.mode, dp.program_day, dp.ai_status,
    d.rules_fired, d.why, d.candidates,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'exercise_id', pi.exercise_id, 'origin', pi.origin, 'status', pi.status,
        'personalized', pi.personalized_instructions is not null
      ) order by pi.position)
      from public.plan_items pi where pi.plan_id = d.plan_id
    ), '[]'),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'model', c.model, 'outcome', c.outcome, 'fallback_reason', c.fallback_reason,
        'input_tokens', c.input_tokens, 'output_tokens', c.output_tokens,
        'cost_eur', c.cost_eur, 'latency_ms', c.latency_ms, 'attempts', c.attempts
      ) order by c.created_at)
      from public.llm_calls c where c.decision_id = d.id
    ), '[]')
  from public.engine_decisions d
  left join public.daily_plans dp on dp.id = d.plan_id
  where d.user_id = v_user_id
  order by d.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 200));
end;
$$;
revoke all on function public.admin_engine_log(text, integer) from public, anon;
grant execute on function public.admin_engine_log(text, integer) to authenticated;

-- AI cost per day (Paris time) and feature
create function public.admin_ai_cost_daily(p_days integer default 30)
returns table (
  day date,
  feature public.llm_feature,
  calls integer,
  cache_hits integer,
  fallbacks integer,
  quota_refusals integer,
  input_tokens bigint,
  output_tokens bigint,
  cost_eur numeric,
  avg_latency_ms integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select
    (c.created_at at time zone 'Europe/Paris')::date as day,
    c.feature,
    count(*) filter (where c.outcome in ('success', 'fallback') and c.attempts > 0)::integer,
    count(*) filter (where c.outcome = 'cache_hit')::integer,
    count(*) filter (where c.outcome = 'fallback')::integer,
    count(*) filter (where c.outcome = 'quota_exceeded')::integer,
    coalesce(sum(c.input_tokens), 0)::bigint,
    coalesce(sum(c.output_tokens), 0)::bigint,
    round(coalesce(sum(c.cost_eur), 0), 4),
    round(avg(c.latency_ms) filter (where c.attempts > 0))::integer
  from public.llm_calls c
  where c.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 366)))
  group by 1, 2
  order by 1 desc, 2;
end;
$$;
revoke all on function public.admin_ai_cost_daily(integer) from public, anon;
grant execute on function public.admin_ai_cost_daily(integer) to authenticated;
