-- Lot 9: Coach Edge assistant (threads, messages, pending actions confirmed by the user),
-- plan adjusted at the user's request (shorter version, swapped exercise), quota, purge.

-- ---------------------------------------------------------------------------
-- Plan adjusted at the user's request: never recomputed by the engine nor enriched by the AI
-- ---------------------------------------------------------------------------
alter table public.daily_plans add column user_adjusted_at timestamptz;

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
    -- Touched, or adjusted at the user's request (shorter version, swapped exercise): kept as is
    if v_touched or exists (
      select 1 from public.daily_plans where id = v_plan_id and user_adjusted_at is not null
    ) then
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

create or replace function public.apply_plan_enrichment(
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
  -- Adjusted at the user's request: never enriched
  if v_plan.user_adjusted_at is not null then
    update public.daily_plans set ai_status = 'fallback' where id = p_plan_id;
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

-- Minutes available today, same rule as the engine: yesterday's check-in ("time tomorrow"),
-- else the profile's daily time, else 15; at most 45
create function public.today_available_minutes(p_user_id uuid, p_date date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select least(45, coalesce(
    (select c.minutes_tomorrow from public.checkins c
     where c.user_id = p_user_id and c.date = p_date - 1),
    (select p.daily_minutes from public.profiles p where p.user_id = p_user_id),
    15
  ))::integer;
$$;
revoke all on function public.today_available_minutes(uuid, date) from public, anon;
grant execute on function public.today_available_minutes(uuid, date) to authenticated, service_role;

-- Today's plan of the caller, locked, and checked untouched (engine items still "todo")
create function public.lock_untouched_today_plan()
returns public.daily_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.daily_plans%rowtype;
begin
  select * into v_plan from public.daily_plans
  where user_id = (select auth.uid()) and date = public.current_user_local_date()
  for update;
  if not found or v_plan.generated_at is null then
    raise exception using errcode = 'P0002', message = 'plan_not_found';
  end if;
  perform 1 from public.plan_items where plan_id = v_plan.id for update;
  if exists (
    select 1 from public.plan_items
    where plan_id = v_plan.id and origin = 'engine' and status <> 'todo'
  ) then
    raise exception using errcode = '22023', message = 'plan_touched';
  end if;
  return v_plan;
end;
$$;
revoke all on function public.lock_untouched_today_plan() from public, anon, authenticated;

-- Shorter version of today's plan (assistant "adapt_today", or the app):
-- program mode: the minimal exercise of the step; catalogue mode: the shortest engine candidate
-- that fits the time given (or the time available today)
create function public.shorten_today_plan(p_minutes integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.daily_plans%rowtype;
  v_minutes integer;
  v_exercise text;
  v_step public.program_steps%rowtype;
begin
  v_plan := public.lock_untouched_today_plan();
  v_minutes := coalesce(
    p_minutes, public.today_available_minutes(v_plan.user_id, v_plan.date)
  );
  if v_minutes < 1 or v_minutes > 240 then
    raise exception using errcode = '22023', message = 'invalid_minutes';
  end if;

  if v_plan.program_day is not null and v_plan.program_id is not null then
    select * into v_step from public.program_steps
    where program_id = v_plan.program_id and day_index = v_plan.program_day;
    v_exercise := v_step.minimal_exercise_id;
  else
    select e.id into v_exercise
    from public.engine_decisions d
    cross join lateral jsonb_array_elements(d.candidates) c
    join public.exercises e on e.id = c ->> 'exerciseId'
    where d.plan_id = v_plan.id and e.status = 'published' and e.duration_min <= v_minutes
      and not exists (
        select 1 from public.plan_items pi
        where pi.plan_id = v_plan.id and pi.exercise_id = e.id and pi.origin = 'user'
      )
    order by d.created_at desc, e.duration_min, e.id
    limit 1;
  end if;
  if v_exercise is null or not exists (
    select 1 from public.exercises where id = v_exercise and status = 'published'
  ) then
    raise exception using errcode = '22023', message = 'no_shorter_exercise';
  end if;
  if exists (
    select 1 from public.plan_items
    where plan_id = v_plan.id and exercise_id = v_exercise and origin = 'user'
  ) then
    raise exception using errcode = '22023', message = 'already_in_plan';
  end if;

  delete from public.plan_items where plan_id = v_plan.id and origin = 'engine';
  insert into public.plan_items (plan_id, user_id, exercise_id, position, origin)
  values (v_plan.id, v_plan.user_id, v_exercise, 1, 'engine');
  update public.plan_items pi set position = 1 + ranked.rn
  from (
    select id, row_number() over (order by position, created_at) as rn
    from public.plan_items where plan_id = v_plan.id and origin = 'user'
  ) ranked
  where pi.id = ranked.id;
  update public.daily_plans set
    mode = 'minimal',
    user_adjusted_at = now(),
    ai_status = case when ai_status = 'pending' then 'fallback' else ai_status end
  where id = v_plan.id;
  insert into public.engine_decisions (user_id, plan_id, rules_fired, candidates, why)
  values (v_plan.user_id, v_plan.id, array['user_shortened'], '[]',
          jsonb_build_object('key', 'user_shortened', 'params', jsonb_build_object('minutes', v_minutes)));
  return jsonb_build_object('plan_id', v_plan.id, 'exercise_id', v_exercise);
end;
$$;
revoke all on function public.shorten_today_plan(integer) from public, anon;
grant execute on function public.shorten_today_plan(integer) to authenticated;

-- Exercises valid for a swap today: published, fitting the time available, not in the plan;
-- program mode: sharing the principle of the step (search_catalog uses the same rule)
create function public.swap_candidates(p_user_id uuid, p_date date)
returns table (exercise_id text)
language sql
stable
security definer
set search_path = ''
as $$
  with plan as (
    select dp.* from public.daily_plans dp where dp.user_id = p_user_id and dp.date = p_date
  ), step as (
    select ps.principle_id from public.program_steps ps join plan p
      on ps.program_id = p.program_id and ps.day_index = p.program_day
  )
  select e.id
  from public.exercises e
  where e.status = 'published'
    and e.duration_min <= public.today_available_minutes(p_user_id, p_date)
    and not exists (
      select 1 from public.plan_items pi join plan p on pi.plan_id = p.id
      where pi.exercise_id = e.id
    )
    and (
      not exists (select 1 from step)
      or exists (
        select 1 from public.exercise_principles ep join step s on ep.principle_id = s.principle_id
        where ep.exercise_id = e.id
      )
    );
$$;
revoke all on function public.swap_candidates(uuid, date) from public, anon, authenticated;
grant execute on function public.swap_candidates(uuid, date) to service_role;

create function public.swap_today_exercise(p_exercise_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.daily_plans%rowtype;
begin
  v_plan := public.lock_untouched_today_plan();
  if not exists (
    select 1 from public.swap_candidates(v_plan.user_id, v_plan.date) c
    where c.exercise_id = p_exercise_id
  ) then
    raise exception using errcode = '22023', message = 'invalid_swap';
  end if;
  -- The new exercise stays an engine item: it counts for the program's progress
  delete from public.plan_items where plan_id = v_plan.id and origin = 'engine';
  insert into public.plan_items (plan_id, user_id, exercise_id, position, origin)
  values (v_plan.id, v_plan.user_id, p_exercise_id, 1, 'engine');
  update public.plan_items pi set position = 1 + ranked.rn
  from (
    select id, row_number() over (order by position, created_at) as rn
    from public.plan_items where plan_id = v_plan.id and origin = 'user'
  ) ranked
  where pi.id = ranked.id;
  update public.daily_plans set
    user_adjusted_at = now(),
    ai_status = case when ai_status = 'pending' then 'fallback' else ai_status end
  where id = v_plan.id;
  insert into public.engine_decisions (user_id, plan_id, rules_fired, candidates, why)
  values (v_plan.user_id, v_plan.id, array['user_swapped'], '[]',
          jsonb_build_object('key', 'user_swapped', 'params', jsonb_build_object('exercise', p_exercise_id)));
  return jsonb_build_object('plan_id', v_plan.id, 'exercise_id', p_exercise_id);
end;
$$;
revoke all on function public.swap_today_exercise(text) from public, anon;
grant execute on function public.swap_today_exercise(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Assistant: threads, messages, pending actions
-- ---------------------------------------------------------------------------
create table public.assistant_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  -- Summary of the older messages (history longer than about 20 messages)
  summary text,
  summarized_until timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index assistant_threads_user_idx on public.assistant_threads (user_id, last_message_at desc);

create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  user_id uuid not null,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null default '',
  -- assistant: tool calls requested; tool: {tool_use_id, name}
  tool_calls jsonb,
  action_id uuid,
  -- Distress words detected in a user message (help card shown whatever the model answers)
  distress boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (thread_id, user_id)
    references public.assistant_threads (id, user_id) on delete cascade
);
create index assistant_messages_thread_idx on public.assistant_messages (thread_id, created_at);
create index assistant_messages_user_day_idx on public.assistant_messages (user_id, created_at)
  where role = 'user';

create table public.assistant_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  thread_id uuid not null,
  type text not null check (type in (
    'adapt_today', 'swap_exercise', 'save_exercise_result', 'add_habit', 'update_goal_progress'
  )),
  params jsonb not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'applied', 'cancelled', 'failed')),
  -- End of the user's local day
  expires_at timestamptz not null,
  result jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key (thread_id, user_id)
    references public.assistant_threads (id, user_id) on delete cascade
);
create index assistant_actions_user_idx on public.assistant_actions (user_id, created_at desc);

do $$
declare
  t text;
begin
  foreach t in array array['assistant_threads', 'assistant_messages', 'assistant_actions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t
    );
  end loop;
end;
$$;

-- Assistant daily quota (messages from the user), configurable without deployment
insert into public.app_settings (key, value) values ('assistant_daily_messages', '30');

create function public.assistant_daily_limit()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::integer from public.app_settings
                   where key = 'assistant_daily_messages'), 30);
$$;
revoke all on function public.assistant_daily_limit() from public, anon;
grant execute on function public.assistant_daily_limit() to authenticated, service_role;

-- Messages sent today (user's local day) by the caller, and the daily limit
create function public.assistant_quota()
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
    'limit', public.assistant_daily_limit()
  );
$$;
revoke all on function public.assistant_quota() from public, anon;
grant execute on function public.assistant_quota() to authenticated;

-- ---------------------------------------------------------------------------
-- Pending action confirmed by the user: checked again, then executed through the same RPCs
-- and rules as the app. Security definer (users cannot write assistant_actions); auth.uid()
-- still comes from the user's token, and every write is filtered on it.
-- ---------------------------------------------------------------------------
create function public.confirm_assistant_action(p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.assistant_actions%rowtype;
  v_result jsonb;
  v_item uuid;
  v_habit uuid;
  v_goal uuid;
begin
  select * into v_action from public.assistant_actions
  where id = p_action_id and user_id = (select auth.uid())
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'action_not_found';
  end if;
  if v_action.status <> 'pending' then
    raise exception using errcode = '22023', message = 'action_already_resolved';
  end if;
  if v_action.expires_at <= now() then
    raise exception using errcode = '22023', message = 'action_expired';
  end if;

  case v_action.type
    when 'adapt_today' then
      v_result := public.shorten_today_plan((v_action.params ->> 'minutes')::integer);
    when 'swap_exercise' then
      v_result := public.swap_today_exercise(v_action.params ->> 'exercise_id');
    when 'save_exercise_result' then
      select pi.id into v_item
      from public.plan_items pi join public.daily_plans dp on dp.id = pi.plan_id
      where dp.user_id = v_action.user_id and dp.date = public.current_user_local_date()
        and pi.exercise_id = v_action.params ->> 'exercise_id';
      if v_item is null then
        raise exception using errcode = 'P0002', message = 'item_not_found';
      end if;
      v_result := public.set_plan_item_result(
        v_item,
        (v_action.params ->> 'status')::public.plan_item_status,
        v_action.params ->> 'proof',
        (v_action.params ->> 'rating')::smallint
      );
    when 'add_habit' then
      perform public.add_habit_from_template(v_action.params ->> 'template_id');
      if nullif(trim(v_action.params ->> 'cue'), '') is not null then
        select id into v_habit from public.user_habits
        where user_id = v_action.user_id and template_id = v_action.params ->> 'template_id'
          and active;
        update public.user_habits set cue = left(trim(v_action.params ->> 'cue'), 120)
        where id = v_habit;
      end if;
      v_result := jsonb_build_object('template_id', v_action.params ->> 'template_id');
    when 'update_goal_progress' then
      select id into v_goal from public.goals
      where user_id = v_action.user_id and status = 'active'
      order by created_at desc limit 1;
      if v_goal is null then
        raise exception using errcode = 'P0002', message = 'goal_not_found';
      end if;
      update public.goals set current_value = (v_action.params ->> 'value')::numeric
      where id = v_goal;
      v_result := jsonb_build_object('goal_id', v_goal, 'value', v_action.params ->> 'value');
  end case;

  update public.assistant_actions
  set status = 'applied', result = v_result, resolved_at = now()
  where id = p_action_id;
  return v_result;
end;
$$;
revoke all on function public.confirm_assistant_action(uuid) from public, anon;
grant execute on function public.confirm_assistant_action(uuid) to authenticated;

-- The status change goes through a definer helper: users never write assistant_actions directly
create function public.cancel_assistant_action(p_action_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.assistant_actions
  set status = 'cancelled', resolved_at = now()
  where id = p_action_id and user_id = (select auth.uid()) and status = 'pending';
  if not found then
    raise exception using errcode = 'P0002', message = 'action_not_found';
  end if;
end;
$$;
revoke all on function public.cancel_assistant_action(uuid) from public, anon;
grant execute on function public.cancel_assistant_action(uuid) to authenticated;

create function public.delete_assistant_thread(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.assistant_threads where id = p_thread_id and user_id = (select auth.uid());
  if not found then
    raise exception using errcode = 'P0002', message = 'thread_not_found';
  end if;
end;
$$;
revoke all on function public.delete_assistant_thread(uuid) from public, anon;
grant execute on function public.delete_assistant_thread(uuid) to authenticated;

create function public.delete_assistant_history()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.assistant_threads where user_id = (select auth.uid());
$$;
revoke all on function public.delete_assistant_history() from public, anon;
grant execute on function public.delete_assistant_history() to authenticated;

-- Conversations kept 90 days after their last message (fallback generation)
create function public.purge_assistant_history(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.assistant_threads where last_message_at < p_now - interval '90 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.purge_assistant_history(timestamptz) from public, anon, authenticated;
grant execute on function public.purge_assistant_history(timestamptz) to service_role;
