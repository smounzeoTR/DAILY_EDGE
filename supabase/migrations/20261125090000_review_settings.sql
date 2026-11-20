-- Lot 6: adoption trace, program per plan, weekly review, settings, account deletion.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
-- Step exercise adopted from the user's additions (reverted to an addition if a
-- recomputation no longer keeps it)
alter table public.plan_items add column adopted boolean not null default false;
-- Program of the plan: a program change restarts at day 1
alter table public.daily_plans add column program_id text references public.programs (id) on delete restrict;
update public.daily_plans dp set program_id = p.program_id
from public.profiles p where p.user_id = dp.user_id and dp.program_day is not null;
-- Habit switched to its minimal version (weekly review proposal)
alter table public.user_habits add column simplified boolean not null default false;
-- Weekly review: structured summary; proposals [{type, priority, params}]; accepted {index: {accept, at}}
alter table public.weekly_reviews add column stats jsonb not null default '{}';
alter table public.weekly_reviews add column generated_at timestamptz not null default now();
-- Account deletion requested (purged after 30 days)
alter table public.profiles add column deletion_requested_at timestamptz;
-- Last time the user entered the current value of the goal
alter table public.goals add column current_value_updated_at timestamptz;

create function public.set_goal_value_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.current_value is not null)
    or (tg_op = 'UPDATE' and new.current_value is distinct from old.current_value) then
    new.current_value_updated_at = now();
  end if;
  return new;
end;
$$;

create trigger goals_current_value_updated before insert or update on public.goals
  for each row execute function public.set_goal_value_updated_at();

-- At most 6 active habits per user
create function public.check_active_habits_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.active and (
    select count(*) from public.user_habits
    where user_id = new.user_id and active and id <> new.id
  ) >= 6 then
    raise exception using errcode = '22023', message = 'too_many_habits';
  end if;
  return new;
end;
$$;

create trigger user_habits_active_limit before insert or update of active on public.user_habits
  for each row execute function public.check_active_habits_limit();

-- ---------------------------------------------------------------------------
-- save_daily_plan: adoption trace and program per plan
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
      program_id = p_plan ->> 'program_id',
      why_today = p_plan ->> 'why_today',
      introduced_habit_id = p_plan ->> 'introduced_habit_id',
      generated_at = now()
    where id = v_plan_id;
    -- An empty plan created by a user addition is "created" by its first computation
    v_status := case when v_was_generated then 'recomputed' else 'created' end;
    -- Adopted items go back to user additions; the new decision may adopt them again
    update public.plan_items set origin = 'user', adopted = false
    where plan_id = v_plan_id and adopted;
    delete from public.plan_items where plan_id = v_plan_id and origin = 'engine';
  else
    insert into public.daily_plans (
      user_id, date, principle_id, mode, program_day, program_id, why_today, introduced_habit_id,
      generated_at
    ) values (
      p_user_id,
      p_date,
      p_plan ->> 'principle_id',
      (p_plan ->> 'mode')::public.plan_mode,
      (p_plan ->> 'program_day')::smallint,
      p_plan ->> 'program_id',
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

-- Accounts pending deletion get no plan
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
    and p.deletion_requested_at is null
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

-- Program habits: an inactive habit of the same template is reactivated
create or replace function public.add_habit_from_template(p_template_id text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_frequency public.habit_frequency;
  v_id uuid;
  v_active boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  -- RLS only exposes published templates
  select frequency into v_frequency from public.habit_templates where id = p_template_id;
  if not found then
    raise exception using errcode = '22023', message = 'invalid_template';
  end if;
  select id, active into v_id, v_active from public.user_habits
  where user_id = v_user_id and template_id = p_template_id
  order by active desc, created_at desc
  limit 1;
  if v_id is not null and v_active then
    raise exception using errcode = '22023', message = 'already_added';
  end if;
  if v_id is not null then
    update public.user_habits set active = true where id = v_id;
    return v_id;
  end if;
  -- Texts stay NULL: shown from the template in the current language
  insert into public.user_habits (user_id, template_id, frequency)
  values (v_user_id, p_template_id, v_frequency)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Weekly review
-- ---------------------------------------------------------------------------
-- Users for whom it is Sunday 18:00 or later (local) and whose week has no review yet
create function public.users_due_for_review(p_now timestamptz, p_limit integer default 200)
returns table (user_id uuid, week_start date)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.user_id, (p_now at time zone p.timezone)::date - 6
  from public.profiles p
  where p.onboarded_at is not null
    and p.deletion_requested_at is null
    and extract(isodow from (p_now at time zone p.timezone)) = 7
    and extract(hour from (p_now at time zone p.timezone)) >= 18
    and not exists (
      select 1 from public.weekly_reviews wr
      where wr.user_id = p.user_id and wr.week_start = (p_now at time zone p.timezone)::date - 6
    )
  order by p.onboarded_at, p.user_id
  limit greatest(p_limit, 0);
$$;

revoke all on function public.users_due_for_review from public, anon, authenticated;
grant execute on function public.users_due_for_review to service_role;

-- Idempotent: one review per user and week
create function public.save_weekly_review(
  p_user_id uuid,
  p_week_start date,
  p_stats jsonb,
  p_proposals jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if extract(isodow from p_week_start) <> 1 then
    raise exception using errcode = '22023', message = 'week_must_start_on_monday';
  end if;
  insert into public.weekly_reviews (user_id, week_start, stats, proposals, accepted, generated_at)
  values (p_user_id, p_week_start, coalesce(p_stats, '{}'), coalesce(p_proposals, '[]'), '{}', now())
  on conflict (user_id, week_start) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.weekly_reviews where user_id = p_user_id and week_start = p_week_start;
    return jsonb_build_object('review_id', v_id, 'status', 'unchanged');
  end if;
  return jsonb_build_object('review_id', v_id, 'status', 'created');
end;
$$;

revoke all on function public.save_weekly_review from public, anon, authenticated;
grant execute on function public.save_weekly_review to service_role;

-- Applies the stored proposal (never content sent by the app). One answer per proposal,
-- current review only (latest, generated less than 8 days ago).
create function public.answer_review_proposal(p_review_id uuid, p_index integer, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_review public.weekly_reviews%rowtype;
  v_proposal jsonb;
  v_params jsonb;
  v_today date;
  v_template public.habit_templates%rowtype;
  v_existing uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select * into v_review from public.weekly_reviews
  where id = p_review_id and user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;
  if v_review.week_start <> (select max(week_start) from public.weekly_reviews where user_id = v_user_id)
    or v_review.generated_at < now() - interval '8 days' then
    raise exception using errcode = '22023', message = 'review_closed';
  end if;
  if p_index < 0 or p_index >= jsonb_array_length(v_review.proposals) then
    raise exception using errcode = '22023', message = 'invalid_index';
  end if;
  if v_review.accepted ? p_index::text then
    raise exception using errcode = '22023', message = 'already_answered';
  end if;

  v_proposal := v_review.proposals -> p_index;
  v_params := coalesce(v_proposal -> 'params', '{}');
  v_today := public.current_user_local_date();

  if p_accept then
    case v_proposal ->> 'type'
      when 'habit_simplify' then
        update public.user_habits set simplified = true
        where id = (v_params ->> 'user_habit_id')::uuid and user_id = v_user_id;
      when 'habit_replace' then
        update public.user_habits set active = false
        where id = (v_params ->> 'user_habit_id')::uuid and user_id = v_user_id;
        select * into v_template from public.habit_templates
        where id = v_params ->> 'template_id' and status = 'published';
        if not found then
          raise exception using errcode = '22023', message = 'invalid_template';
        end if;
        select id into v_existing from public.user_habits
        where user_id = v_user_id and template_id = v_template.id
        order by created_at desc limit 1;
        if v_existing is not null then
          update public.user_habits set active = true where id = v_existing;
        else
          insert into public.user_habits (user_id, template_id, frequency)
          values (v_user_id, v_template.id, v_template.frequency);
        end if;
      when 'goal_deadline' then
        if (v_params ->> 'deadline')::date <= v_today then
          raise exception using errcode = '22023', message = 'invalid_goal_deadline';
        end if;
        update public.goals set deadline = (v_params ->> 'deadline')::date
        where id = (v_params ->> 'goal_id')::uuid and user_id = v_user_id and status = 'active';
      when 'level_up' then
        update public.profiles set level = (v_params ->> 'to')::public.user_level
        where user_id = v_user_id and level = (v_params ->> 'from')::public.user_level;
      when 'daily_minutes' then
        update public.profiles set daily_minutes = (v_params ->> 'minutes')::smallint
        where user_id = v_user_id;
      when 'update_goal_progress' then
        -- No database effect: the app opens the progress input
        null;
      else
        raise exception using errcode = '22023', message = 'invalid_proposal';
    end case;
  end if;

  update public.weekly_reviews
  set accepted = accepted || jsonb_build_object(p_index::text, jsonb_build_object('accept', p_accept, 'at', now()))
  where id = p_review_id
  returning * into v_review;
  return to_jsonb(v_review);
end;
$$;

revoke all on function public.answer_review_proposal from public, anon;
grant execute on function public.answer_review_proposal to authenticated;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
-- Program change: restarts at day 1 today
create function public.change_program(p_program_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_persona public.persona;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select persona into v_persona from public.programs where id = p_program_id and status = 'published';
  if not found then
    raise exception using errcode = '22023', message = 'invalid_program';
  end if;
  update public.profiles set
    program_id = p_program_id,
    persona = v_persona,
    program_start_date = public.current_user_local_date(),
    program_day = 1
  where user_id = v_user_id;
end;
$$;

revoke all on function public.change_program from public, anon;
grant execute on function public.change_program to authenticated;

-- New goal: the active one is abandoned (unless achieved), the new one becomes active
create function public.replace_active_goal(
  p_title text,
  p_target_value numeric default null,
  p_unit text default null,
  p_deadline date default null,
  p_why text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception using errcode = '22023', message = 'invalid_goal_title';
  end if;
  if p_deadline is not null and p_deadline <= public.current_user_local_date() then
    raise exception using errcode = '22023', message = 'invalid_goal_deadline';
  end if;
  update public.goals set status = 'abandoned' where user_id = v_user_id and status = 'active';
  insert into public.goals (user_id, title, target_value, unit, deadline, why)
  values (v_user_id, trim(p_title), p_target_value, nullif(trim(p_unit), ''), p_deadline, nullif(trim(p_why), ''))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.replace_active_goal from public, anon;
grant execute on function public.replace_active_goal to authenticated;

-- Consent to the check-in withdrawn: erase mood and energy already stored
create function public.erase_mood_energy()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  update public.checkins set energy = null, mood = null
  where user_id = (select auth.uid()) and (energy is not null or mood is not null);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.erase_mood_energy from public, anon;
grant execute on function public.erase_mood_energy to authenticated;

-- ---------------------------------------------------------------------------
-- Account deletion: requested, cancellable for 30 days, then purged
-- ---------------------------------------------------------------------------
create function public.request_account_deletion()
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
  update public.profiles set deletion_requested_at = coalesce(deletion_requested_at, now())
  where user_id = (select auth.uid())
  returning deletion_requested_at into v_at;
  return v_at;
end;
$$;

create function public.cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  update public.profiles set deletion_requested_at = null where user_id = (select auth.uid());
end;
$$;

revoke all on function public.request_account_deletion() from public, anon;
revoke all on function public.cancel_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.cancel_account_deletion() to authenticated;

-- Deletes accounts requested more than 30 days before p_now (all data by cascade). Server only.
create function public.purge_deleted_accounts(p_now timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from auth.users u
  using public.profiles p
  where p.user_id = u.id
    and p.deletion_requested_at is not null
    and p.deletion_requested_at <= p_now - interval '30 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.purge_deleted_accounts from public, anon, authenticated;
grant execute on function public.purge_deleted_accounts to service_role;
