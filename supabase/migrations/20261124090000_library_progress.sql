-- Lot 5: user-added exercises, plan generation marker, done days for streaks.

-- Who put an exercise in the plan: the engine or the user (library "Add to my day")
create type public.plan_item_origin as enum ('engine', 'user');
alter table public.plan_items
  add column origin public.plan_item_origin not null default 'engine';

-- NULL until the engine has computed the plan (a plan can be created empty by a user addition)
alter table public.daily_plans add column generated_at timestamptz;
update public.daily_plans set generated_at = created_at;

-- ---------------------------------------------------------------------------
-- Library: add an exercise to today's plan
-- ---------------------------------------------------------------------------
create function public.add_exercise_to_today(p_exercise_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_today date;
  v_plan_id uuid;
  v_item public.plan_items%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if not exists (select 1 from public.profiles where user_id = v_user_id and onboarded_at is not null) then
    raise exception using errcode = '22023', message = 'not_onboarded';
  end if;
  if not exists (select 1 from public.exercises where id = p_exercise_id and status = 'published') then
    raise exception using errcode = '22023', message = 'invalid_exercise';
  end if;

  -- Serializes additions for the user (limit and duplicates)
  perform 1 from public.profiles where user_id = v_user_id for update;
  v_today := public.current_user_local_date();

  select id into v_plan_id from public.daily_plans where user_id = v_user_id and date = v_today;
  if v_plan_id is null then
    -- Empty plan, completed by generate-plan (generated_at stays NULL until then)
    insert into public.daily_plans (user_id, date, mode)
    values (v_user_id, v_today, 'normal')
    returning id into v_plan_id;
  end if;

  if exists (select 1 from public.plan_items where plan_id = v_plan_id and exercise_id = p_exercise_id) then
    raise exception using errcode = '22023', message = 'already_in_plan';
  end if;
  if (select count(*) from public.plan_items where plan_id = v_plan_id and origin = 'user') >= 3 then
    raise exception using errcode = '22023', message = 'daily_limit';
  end if;

  insert into public.plan_items (plan_id, user_id, exercise_id, position, origin)
  values (
    v_plan_id,
    v_user_id,
    p_exercise_id,
    coalesce((select max(position) from public.plan_items where plan_id = v_plan_id), 0) + 1,
    'user'
  )
  returning * into v_item;
  return to_jsonb(v_item);
end;
$$;

revoke all on function public.add_exercise_to_today from public, anon;
grant execute on function public.add_exercise_to_today to authenticated;

-- ---------------------------------------------------------------------------
-- save_daily_plan: only engine items decide "touched" and are replaced; user additions
-- are kept (after the engine items). An item flagged "adopted" is the user's addition of
-- the program step exercise: it becomes an engine item at position 1.
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
      why_today = p_plan ->> 'why_today',
      introduced_habit_id = p_plan ->> 'introduced_habit_id',
      generated_at = now()
    where id = v_plan_id;
    -- An empty plan created by a user addition is "created" by its first computation
    v_status := case when v_was_generated then 'recomputed' else 'created' end;
    delete from public.plan_items where plan_id = v_plan_id and origin = 'engine';
  else
    insert into public.daily_plans (
      user_id, date, principle_id, mode, program_day, why_today, introduced_habit_id, generated_at
    ) values (
      p_user_id,
      p_date,
      p_plan ->> 'principle_id',
      (p_plan ->> 'mode')::public.plan_mode,
      (p_plan ->> 'program_day')::smallint,
      p_plan ->> 'why_today',
      p_plan ->> 'introduced_habit_id',
      now()
    )
    returning id into v_plan_id;
    v_status := 'created';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_plan -> 'items', '[]')) loop
    if coalesce((v_item ->> 'adopted')::boolean, false) then
      update public.plan_items
      set origin = 'engine', position = (v_item ->> 'position')::smallint
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

-- Skips ("skipped twice") count engine items only; done and rated 1/5 count every origin
create or replace function public.engine_exercise_history(p_user_id uuid)
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
    (count(*) filter (where pi.status in ('skipped', 'too_hard') and pi.origin = 'engine'))::integer,
    max(dp.date) filter (where pi.rating = 1)
  from public.plan_items pi
  join public.daily_plans dp on dp.id = pi.plan_id
  where pi.user_id = p_user_id
  group by pi.exercise_id;
$$;

-- Fallback generation also covers plans created empty by an addition
create or replace function public.users_due_for_plan(p_now timestamptz, p_limit integer default 200)
returns table (user_id uuid, local_date date)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.user_id, (p_now at time zone p.timezone)::date
  from public.profiles p
  where p.onboarded_at is not null
    and extract(hour from (p_now at time zone p.timezone)) >= 2
    and extract(hour from (p_now at time zone p.timezone)) < 5
    and not exists (
      select 1 from public.daily_plans dp
      where dp.user_id = p.user_id
        and dp.date = (p_now at time zone p.timezone)::date
        and dp.generated_at is not null
    )
  order by p.onboarded_at, p.user_id
  limit greatest(p_limit, 0);
$$;

-- ---------------------------------------------------------------------------
-- Progress: all days with at least one exercise done (streak record), one row
-- ---------------------------------------------------------------------------
create function public.my_done_days()
returns date[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(array_agg(distinct dp.date order by dp.date), '{}')
  from public.daily_plans dp
  join public.plan_items pi on pi.plan_id = dp.id
  where dp.user_id = (select auth.uid()) and pi.status = 'done';
$$;

revoke all on function public.my_done_days() from public, anon;
grant execute on function public.my_done_days() to authenticated;
