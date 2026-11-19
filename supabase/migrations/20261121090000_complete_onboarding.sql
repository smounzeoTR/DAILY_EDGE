-- Template-based habits keep their texts in habit_templates (shown in the current
-- language); user_habits only stores what the user changed. Habits created without
-- a template must have their own title.
alter table public.user_habits alter column title drop not null;
alter table public.user_habits
  add constraint user_habits_title_or_template
  check (template_id is not null or title is not null);

-- End of onboarding: goal, profile and 3 habits in a single transaction.
-- Security invoker: RLS and column grants of the caller apply.
-- Persona is derived from the chosen program (the user may change program).
create function public.complete_onboarding(
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
security invoker
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

  -- RLS only exposes published programs
  select persona into v_persona from public.programs where id = p_program_id;
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
    or (select count(*) from public.habit_templates where id = any (v_template_ids)) <> 3 then
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
