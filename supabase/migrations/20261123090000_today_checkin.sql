-- Lot 4: today screen, evening check-in, habit logs and fallback plan generation.

-- ---------------------------------------------------------------------------
-- Local date of the calling user (profile time zone)
-- ---------------------------------------------------------------------------
create function public.current_user_local_date()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone p.timezone)::date
  from public.profiles p
  where p.user_id = (select auth.uid());
$$;

revoke all on function public.current_user_local_date() from public, anon;
grant execute on function public.current_user_local_date() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Habit logs: minimal version flag; writes limited to today and yesterday
-- ---------------------------------------------------------------------------
alter table public.habit_logs add column minimal boolean not null default false;

drop policy habit_logs_insert_own on public.habit_logs;
drop policy habit_logs_update_own on public.habit_logs;
drop policy habit_logs_delete_own on public.habit_logs;

create policy habit_logs_insert_own on public.habit_logs
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and date between (select public.current_user_local_date()) - 1 and (select public.current_user_local_date())
  );
create policy habit_logs_update_own on public.habit_logs
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and date between (select public.current_user_local_date()) - 1 and (select public.current_user_local_date())
  )
  with check (
    user_id = (select auth.uid())
    and date between (select public.current_user_local_date()) - 1 and (select public.current_user_local_date())
  );
create policy habit_logs_delete_own on public.habit_logs
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and date between (select public.current_user_local_date()) - 1 and (select public.current_user_local_date())
  );

-- ---------------------------------------------------------------------------
-- Exercise result: only through set_plan_item_result (today's plan only)
-- ---------------------------------------------------------------------------
revoke update (status, proof_value, rating, completed_at) on public.plan_items from authenticated;
drop policy plan_items_update_own on public.plan_items;

create function public.set_plan_item_result(
  p_item_id uuid,
  p_status public.plan_item_status,
  p_proof_value text default null,
  p_rating smallint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_plan_date date;
  v_proof_type public.proof_type;
  v_proof text := nullif(trim(p_proof_value), '');
  v_item public.plan_items%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  select dp.date, e.proof_type into v_plan_date, v_proof_type
  from public.plan_items pi
  join public.daily_plans dp on dp.id = pi.plan_id
  join public.exercises e on e.id = pi.exercise_id
  where pi.id = p_item_id and pi.user_id = v_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;

  -- A result can be corrected until the end of the day
  if v_plan_date <> public.current_user_local_date() then
    raise exception using errcode = '22023', message = 'day_closed';
  end if;

  -- "todo" means untouched: never set back
  if p_status not in ('done', 'skipped', 'too_hard') then
    raise exception using errcode = '22023', message = 'invalid_status';
  end if;

  if p_rating is not null and (p_status <> 'done' or p_rating not between 1 and 5) then
    raise exception using errcode = '22023', message = 'invalid_rating';
  end if;

  if p_status = 'done' then
    if v_proof_type = 'free_text' and v_proof is null then
      raise exception using errcode = '22023', message = 'invalid_proof';
    end if;
    if v_proof_type = 'numeric' and (v_proof is null or v_proof !~ '^-?[0-9]+([.,][0-9]+)?$') then
      raise exception using errcode = '22023', message = 'invalid_proof';
    end if;
    if v_proof_type = 'checkbox' then
      v_proof := null;
    end if;
  else
    v_proof := null;
  end if;

  update public.plan_items set
    status = p_status,
    proof_value = v_proof,
    rating = case when p_status = 'done' then p_rating end,
    completed_at = case when p_status = 'done' then coalesce(completed_at, now()) end
  where id = p_item_id
  returning * into v_item;

  return to_jsonb(v_item);
end;
$$;

revoke all on function public.set_plan_item_result from public, anon;
grant execute on function public.set_plan_item_result to authenticated;

-- ---------------------------------------------------------------------------
-- Evening check-in: only through upsert_checkin (today, consent applied)
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.checkins from authenticated;
drop policy checkins_insert_own on public.checkins;
drop policy checkins_update_own on public.checkins;
drop policy checkins_delete_own on public.checkins;

create function public.upsert_checkin(
  p_minutes_tomorrow smallint,
  p_reflection text default null,
  p_note text default null,
  p_energy smallint default null,
  p_mood smallint default null
)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_consent boolean;
  v_date date;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select consent_checkin into v_consent from public.profiles where user_id = v_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'profile_not_found';
  end if;
  v_date := public.current_user_local_date();

  -- Without consent, mood and energy are never stored
  insert into public.checkins (user_id, date, energy, mood, minutes_tomorrow, reflection, note)
  values (
    v_user_id,
    v_date,
    case when v_consent then p_energy end,
    case when v_consent then p_mood end,
    p_minutes_tomorrow,
    nullif(trim(p_reflection), ''),
    nullif(trim(p_note), '')
  )
  on conflict (user_id, date) do update set
    energy = excluded.energy,
    mood = excluded.mood,
    minutes_tomorrow = excluded.minutes_tomorrow,
    reflection = excluded.reflection,
    note = excluded.note;

  return v_date;
end;
$$;

revoke all on function public.upsert_checkin from public, anon;
grant execute on function public.upsert_checkin to authenticated;

-- ---------------------------------------------------------------------------
-- Habit proposed by the program step: added like at onboarding
-- ---------------------------------------------------------------------------
create function public.add_habit_from_template(p_template_id text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_frequency public.habit_frequency;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  -- RLS only exposes published templates
  select frequency into v_frequency from public.habit_templates where id = p_template_id;
  if not found then
    raise exception using errcode = '22023', message = 'invalid_template';
  end if;
  if exists (
    select 1 from public.user_habits
    where user_id = v_user_id and template_id = p_template_id and active
  ) then
    raise exception using errcode = '22023', message = 'already_added';
  end if;
  -- Texts stay NULL: shown from the template in the current language
  insert into public.user_habits (user_id, template_id, frequency)
  values (v_user_id, p_template_id, v_frequency)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.add_habit_from_template from public, anon;
grant execute on function public.add_habit_from_template to authenticated;

-- ---------------------------------------------------------------------------
-- Fallback generation: users between 2:00 and 5:00 (excluded) local time
-- without a plan for their local date. Server only.
-- ---------------------------------------------------------------------------
create function public.users_due_for_plan(p_now timestamptz, p_limit integer default 200)
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
      where dp.user_id = p.user_id and dp.date = (p_now at time zone p.timezone)::date
    )
  order by p.onboarded_at, p.user_id
  limit greatest(p_limit, 0);
$$;

revoke all on function public.users_due_for_plan from public, anon, authenticated;
grant execute on function public.users_due_for_plan to service_role;

-- Hourly job: calls the generate-plans-batch Edge Function with a server secret.
-- URL and secret live in Vault (plans_batch_url, plans_batch_secret).
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create function public.trigger_plans_batch()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'plans_batch_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'plans_batch_secret';
  if v_url is null or v_secret is null then
    raise warning 'plans batch not configured (vault secrets missing)';
    return null;
  end if;
  return net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-batch-secret', v_secret),
    timeout_milliseconds := 120000
  );
end;
$$;

revoke all on function public.trigger_plans_batch() from public, anon, authenticated;

select cron.schedule('generate-plans-batch', '0 * * * *', 'select public.trigger_plans_batch()');
