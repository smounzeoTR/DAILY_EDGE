-- Lot 3: plan engine persistence.

-- Habit introduced by the program step of the day (proposed, not yet added)
alter table public.daily_plans
  add column introduced_habit_id text references public.habit_templates (id) on delete restrict;
create index daily_plans_introduced_habit_idx on public.daily_plans (introduced_habit_id);

-- "Pourquoi aujourd'hui": template key, parameters and rendered text
alter table public.engine_decisions add column why jsonb;

-- Only the server moves the program: users can no longer write these columns
revoke update (program_day, program_start_date) on public.profiles from authenticated;

-- complete_onboarding still writes them: it now runs as owner (security definer),
-- with explicit checks replacing the RLS it relied on.
create or replace function public.complete_onboarding(
  p_goal_title text,
  p_program_id text,
  p_habits jsonb,
  p_goal_target_value numeric default null,
  p_goal_unit text default null,
  p_goal_deadline date default null,
  p_goal_why text default null,
  p_situation public.situation default null,
  p_priority_domains public.domain[] default '{}',
  p_blockers public.blocker[] default '{}',
  p_daily_minutes smallint default 15,
  p_chronotype public.chronotype default null,
  p_motivation_style public.motivation_style default null,
  p_level public.user_level default 'beginner',
  p_notify_morning time default '07:30',
  p_notify_evening time default '21:00',
  p_consent_checkin boolean default false,
  p_consent_ai boolean default false,
  p_locale text default null,
  p_timezone text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_persona public.persona;
  v_timezone text;
  v_today date;
  v_template_ids text[];
  v_habit jsonb;
  v_template public.habit_templates%rowtype;
  v_cue text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  select * into v_profile from public.profiles where user_id = v_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'profile_not_found';
  end if;
  if v_profile.onboarded_at is not null then
    raise exception using errcode = '22023', message = 'already_onboarded';
  end if;

  if p_goal_title is null or length(trim(p_goal_title)) = 0 then
    raise exception using errcode = '22023', message = 'invalid_goal_title';
  end if;

  v_timezone := case
    when p_timezone is not null
      and exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone)
    then p_timezone
    else v_profile.timezone
  end;
  v_today := (now() at time zone v_timezone)::date;

  if p_goal_deadline is not null and p_goal_deadline <= v_today then
    raise exception using errcode = '22023', message = 'invalid_goal_deadline';
  end if;

  if p_locale is not null and p_locale not in ('fr', 'en') then
    raise exception using errcode = '22023', message = 'invalid_locale';
  end if;

  select persona into v_persona
  from public.programs where id = p_program_id and status = 'published';
  if not found then
    raise exception using errcode = '22023', message = 'invalid_program';
  end if;

  -- Exactly 3 distinct published templates
  if p_habits is null or jsonb_typeof(p_habits) <> 'array' or jsonb_array_length(p_habits) <> 3 then
    raise exception using errcode = '22023', message = 'invalid_habits';
  end if;
  select array_agg(distinct h ->> 'template_id') into v_template_ids
  from jsonb_array_elements(p_habits) as h;
  if cardinality(v_template_ids) <> 3
    or (select count(*) from public.habit_templates
        where id = any (v_template_ids) and status = 'published') <> 3 then
    raise exception using errcode = '22023', message = 'invalid_habits';
  end if;

  insert into public.goals (user_id, title, why, target_value, unit, deadline)
  values (
    v_user_id,
    trim(p_goal_title),
    nullif(trim(p_goal_why), ''),
    p_goal_target_value,
    nullif(trim(p_goal_unit), ''),
    p_goal_deadline
  );

  update public.profiles set
    locale = coalesce(p_locale, locale),
    timezone = v_timezone,
    situation = p_situation,
    priority_domains = coalesce(p_priority_domains, '{}'),
    blockers = coalesce(p_blockers, '{}'),
    daily_minutes = coalesce(p_daily_minutes, 15),
    chronotype = p_chronotype,
    motivation_style = p_motivation_style,
    level = coalesce(p_level, 'beginner'),
    persona = v_persona,
    program_id = p_program_id,
    program_start_date = v_today,
    program_day = 1,
    notify_morning = p_notify_morning,
    notify_evening = p_notify_evening,
    consent_checkin = coalesce(p_consent_checkin, false),
    consent_ai = coalesce(p_consent_ai, false),
    consent_at = case when coalesce(p_consent_checkin, false) or coalesce(p_consent_ai, false)
      then now() end,
    onboarded_at = now()
  where user_id = v_user_id;

  -- Only user changes are stored: a cue equal to the template default stays NULL
  for v_habit in select * from jsonb_array_elements(p_habits) loop
    select * into v_template from public.habit_templates where id = v_habit ->> 'template_id';
    v_cue := nullif(trim(v_habit ->> 'cue'), '');
    if v_cue in (v_template.default_cue_fr, v_template.default_cue_en) then
      v_cue := null;
    end if;
    insert into public.user_habits (user_id, template_id, cue, frequency)
    values (v_user_id, v_template.id, v_cue, v_template.frequency);
  end loop;
end;
$$;

revoke all on function public.complete_onboarding from public, anon;
grant execute on function public.complete_onboarding to authenticated;

-- Saves the plan computed by the engine for one user and date, in one transaction.
-- Idempotent: a plan whose exercises were already touched is returned unchanged;
-- an untouched plan is replaced (same id). Server only (service_role).
-- p_plan: { mode, program_day, next_program_day, principle_id, introduced_habit_id,
--           why_today, items: [{ exercise_id, position }] }
-- p_decision: { rules_fired, candidates, why, latency_ms }
create function public.save_daily_plan(
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
begin
  -- Serializes concurrent generations for the same user
  perform 1 from public.profiles where user_id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'profile_not_found';
  end if;

  select id into v_plan_id from public.daily_plans where user_id = p_user_id and date = p_date;
  if v_plan_id is not null then
    select exists (
      select 1 from public.plan_items where plan_id = v_plan_id and status <> 'todo'
    ) into v_touched;
    if v_touched then
      return jsonb_build_object('plan_id', v_plan_id, 'status', 'unchanged');
    end if;
    update public.daily_plans set
      principle_id = p_plan ->> 'principle_id',
      mode = (p_plan ->> 'mode')::public.plan_mode,
      program_day = (p_plan ->> 'program_day')::smallint,
      why_today = p_plan ->> 'why_today',
      introduced_habit_id = p_plan ->> 'introduced_habit_id'
    where id = v_plan_id;
    delete from public.plan_items where plan_id = v_plan_id;
    v_status := 'recomputed';
  else
    insert into public.daily_plans (
      user_id, date, principle_id, mode, program_day, why_today, introduced_habit_id
    ) values (
      p_user_id,
      p_date,
      p_plan ->> 'principle_id',
      (p_plan ->> 'mode')::public.plan_mode,
      (p_plan ->> 'program_day')::smallint,
      p_plan ->> 'why_today',
      p_plan ->> 'introduced_habit_id'
    )
    returning id into v_plan_id;
    v_status := 'created';
  end if;

  insert into public.plan_items (plan_id, user_id, exercise_id, position)
  select v_plan_id, p_user_id, item ->> 'exercise_id', (item ->> 'position')::smallint
  from jsonb_array_elements(coalesce(p_plan -> 'items', '[]')) as item;

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
  );

  -- Program day follows the latest plan only (generating an older date never moves it back)
  if not exists (
    select 1 from public.daily_plans where user_id = p_user_id and date > p_date
  ) then
    update public.profiles
    set program_day = (p_plan ->> 'next_program_day')::smallint
    where user_id = p_user_id;
  end if;

  return jsonb_build_object('plan_id', v_plan_id, 'status', v_status);
end;
$$;

revoke all on function public.save_daily_plan from public, anon, authenticated;
grant execute on function public.save_daily_plan to service_role;

-- All-time history per exercise for the engine (avoids loading every plan item).
-- Skips include "too hard". Server only.
create function public.engine_exercise_history(p_user_id uuid)
returns table (
  exercise_id text,
  last_done_on date,
  skips integer,
  last_rating1_on date
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    pi.exercise_id,
    max(dp.date) filter (where pi.status = 'done'),
    (count(*) filter (where pi.status in ('skipped', 'too_hard')))::integer,
    max(dp.date) filter (where pi.rating = 1)
  from public.plan_items pi
  join public.daily_plans dp on dp.id = pi.plan_id
  where pi.user_id = p_user_id
  group by pi.exercise_id;
$$;

revoke all on function public.engine_exercise_history from public, anon, authenticated;
grant execute on function public.engine_exercise_history to service_role;
