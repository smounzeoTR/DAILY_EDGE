-- Goal deadline checked by the database on every change (not only by the app):
-- a new or changed deadline must be in the future in the owner's time zone.
-- Unchanged deadlines are not checked (an expired goal stays editable).

create function public.check_goal_deadline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date;
begin
  if new.deadline is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.deadline is not distinct from old.deadline then
    return new;
  end if;
  -- Inserts by the server (seeds, service role) are trusted; RPCs check the deadline themselves
  if tg_op = 'INSERT' and (select auth.uid()) is null then
    return new;
  end if;
  select (now() at time zone p.timezone)::date into v_today
  from public.profiles p where p.user_id = new.user_id;
  if new.deadline <= coalesce(v_today, current_date) then
    raise exception using errcode = '22023', message = 'invalid_goal_deadline';
  end if;
  return new;
end;
$$;

revoke all on function public.check_goal_deadline() from public, anon, authenticated;

create trigger goals_check_deadline
before insert or update of deadline on public.goals
for each row execute function public.check_goal_deadline();
