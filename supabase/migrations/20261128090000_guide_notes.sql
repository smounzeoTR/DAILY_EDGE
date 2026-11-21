-- Lot 8: daily guide (principle read, guided tour, tips, celebrated milestones) and notes.

-- ---------------------------------------------------------------------------
-- Principle of the day read (opening its card or "J'ai lu"), per plan
-- ---------------------------------------------------------------------------
alter table public.daily_plans add column principle_read_at timestamptz;

create function public.mark_principle_read(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Own plan of today only; the first reading is kept
  update public.daily_plans
  set principle_read_at = coalesce(principle_read_at, now())
  where id = p_plan_id
    and user_id = (select auth.uid())
    and date = public.current_user_local_date();
  if not found then
    raise exception using errcode = 'P0002', message = 'plan_not_found';
  end if;
end;
$$;
revoke all on function public.mark_principle_read(uuid) from public, anon;
grant execute on function public.mark_principle_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Guide state (server side: follows the user from one device to another).
-- Append only: a tip seen or a milestone celebrated never comes back.
-- ---------------------------------------------------------------------------
create table public.user_guide_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tour_finished_at timestamptz,
  tour_skipped boolean not null default false,
  -- {tip: date seen}
  tips_seen jsonb not null default '{}',
  -- {milestone: date celebrated (or recorded without being shown)}
  milestones jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create trigger user_guide_state_updated_at before update on public.user_guide_state
  for each row execute function public.set_updated_at();

alter table public.user_guide_state enable row level security;
revoke all on public.user_guide_state from anon, authenticated;
grant select on public.user_guide_state to authenticated;
grant all on public.user_guide_state to service_role;
create policy user_guide_state_select_own on public.user_guide_state
  for select to authenticated using (user_id = (select auth.uid()));

-- Accounts onboarded more than 7 days ago never see the day-1 tour
insert into public.user_guide_state (user_id, tour_finished_at)
select p.user_id, now()
from public.profiles p
where p.onboarded_at is not null
  and p.onboarded_at < now() - interval '7 days'
on conflict (user_id) do nothing;

create function public.finish_guided_tour(p_skipped boolean)
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
  insert into public.user_guide_state (user_id, tour_finished_at, tour_skipped)
  values (v_user_id, now(), coalesce(p_skipped, false))
  on conflict (user_id) do update
    set tour_finished_at = coalesce(public.user_guide_state.tour_finished_at, excluded.tour_finished_at),
        tour_skipped = case
          when public.user_guide_state.tour_finished_at is null then excluded.tour_skipped
          else public.user_guide_state.tour_skipped
        end;
end;
$$;
revoke all on function public.finish_guided_tour(boolean) from public, anon;
grant execute on function public.finish_guided_tour(boolean) to authenticated;

create function public.mark_tip_seen(p_tip text)
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
  if p_tip is null or p_tip not in (
    'minimal_version', 'no_time', 'library', 'favorites', 'goal_progress', 'weekly_review'
  ) then
    raise exception using errcode = '22023', message = 'invalid_tip';
  end if;
  insert into public.user_guide_state (user_id, tips_seen)
  values (v_user_id, jsonb_build_object(p_tip, public.current_user_local_date()))
  on conflict (user_id) do update
    -- The first date is kept
    set tips_seen = jsonb_build_object(p_tip, public.current_user_local_date())
                    || public.user_guide_state.tips_seen;
end;
$$;
revoke all on function public.mark_tip_seen(text) from public, anon;
grant execute on function public.mark_tip_seen(text) to authenticated;

create function public.mark_milestone_celebrated(p_milestone text)
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
  if p_milestone is null or p_milestone not in (
    'streak_7', 'week_1', 'program_completed', 'goal_achieved'
  ) then
    raise exception using errcode = '22023', message = 'invalid_milestone';
  end if;
  insert into public.user_guide_state (user_id, milestones)
  values (v_user_id, jsonb_build_object(p_milestone, now()))
  on conflict (user_id) do update
    -- Never rewritten: celebrated once
    set milestones = jsonb_build_object(p_milestone, now()) || public.user_guide_state.milestones;
end;
$$;
revoke all on function public.mark_milestone_celebrated(text) from public, anon;
grant execute on function public.mark_milestone_celebrated(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Goal achieved: dated (celebration only when recent)
-- ---------------------------------------------------------------------------
alter table public.goals add column achieved_at timestamptz;
update public.goals set achieved_at = updated_at where status = 'achieved';

create function public.set_goal_achieved_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'achieved' and (tg_op = 'INSERT' or old.status is distinct from 'achieved') then
    new.achieved_at := now();
  elsif new.status <> 'achieved' then
    new.achieved_at := null;
  end if;
  return new;
end;
$$;
create trigger goals_achieved_at before insert or update of status on public.goals
  for each row execute function public.set_goal_achieved_at();

-- ---------------------------------------------------------------------------
-- Notes: one per principle or exercise, private, never sent to the AI
-- ---------------------------------------------------------------------------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entity_type public.favorite_entity not null,
  entity_id text not null,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entity_type, entity_id)
);
create index notes_user_updated_idx on public.notes (user_id, updated_at desc);
create trigger notes_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

-- The principle or exercise must exist
create function public.check_note_entity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.entity_type = 'principle'
      and not exists (select 1 from public.principles where id = new.entity_id))
     or (new.entity_type = 'exercise'
      and not exists (select 1 from public.exercises where id = new.entity_id)) then
    raise exception using errcode = '23503', message = 'note_entity_not_found';
  end if;
  return new;
end;
$$;
revoke all on function public.check_note_entity() from public, anon, authenticated;
create trigger notes_check_entity before insert or update of entity_type, entity_id on public.notes
  for each row execute function public.check_note_entity();

alter table public.notes enable row level security;
revoke all on public.notes from anon, authenticated;
grant select, insert, delete on public.notes to authenticated;
grant update (body) on public.notes to authenticated;
grant all on public.notes to service_role;
create policy notes_select_own on public.notes
  for select to authenticated using (user_id = (select auth.uid()));
create policy notes_insert_own on public.notes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy notes_update_own on public.notes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy notes_delete_own on public.notes
  for delete to authenticated using (user_id = (select auth.uid()));
