-- Row Level Security and explicit privileges.
-- Privileges are reset then granted explicitly (column-level where users may
-- only change some fields); RLS policies then restrict rows.

-- Admin check, bypasses RLS on profiles to avoid policy recursion
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Content tables: published rows readable by everyone, admins manage all
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'sources', 'principles', 'principle_sources', 'exercises', 'exercise_principles',
    'exercise_prerequisites', 'habit_templates', 'habit_template_principles',
    'programs', 'program_steps'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
      t || '_admin_all', t
    );
  end loop;
end;
$$;

-- Tables with a status column: published only
create policy principles_read_published on public.principles
  for select to anon, authenticated using (status = 'published');
create policy exercises_read_published on public.exercises
  for select to anon, authenticated using (status = 'published');
create policy habit_templates_read_published on public.habit_templates
  for select to anon, authenticated using (status = 'published');
create policy programs_read_published on public.programs
  for select to anon, authenticated using (status = 'published');

-- Sources and link tables only hold IDs and references: readable by all
create policy sources_read_all on public.sources
  for select to anon, authenticated using (true);
create policy principle_sources_read_all on public.principle_sources
  for select to anon, authenticated using (true);
create policy exercise_principles_read_all on public.exercise_principles
  for select to anon, authenticated using (true);
create policy exercise_prerequisites_read_all on public.exercise_prerequisites
  for select to anon, authenticated using (true);
create policy habit_template_principles_read_all on public.habit_template_principles
  for select to anon, authenticated using (true);
create policy program_steps_read_all on public.program_steps
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- User tables: each user only sees their own rows. No access for anon.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'subscriptions', 'goals', 'user_habits', 'habit_logs', 'checkins',
    'daily_plans', 'plan_items', 'weekly_reviews', 'favorites', 'profile_stats',
    'engine_decisions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

-- Full CRUD on own rows
do $$
declare
  t text;
begin
  foreach t in array array['goals', 'user_habits', 'habit_logs', 'checkins', 'favorites'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t || '_insert_own', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_update_own', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || '_delete_own', t
    );
  end loop;
end;
$$;

-- Read-only own rows (written by the auth trigger or Edge Functions)
do $$
declare
  t text;
begin
  foreach t in array array['subscriptions', 'daily_plans', 'profile_stats'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t
    );
  end loop;
end;
$$;

-- Profiles: read own row, update allowed columns only (never role)
grant select on public.profiles to authenticated;
grant update (
  display_name, locale, timezone, situation, priority_domains, blockers, daily_minutes,
  chronotype, motivation_style, level, persona, program_id, program_start_date, program_day,
  notify_morning, notify_evening, consent_checkin, consent_ai, consent_at, onboarded_at
) on public.profiles to authenticated;
create policy profiles_select_own on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Plan items: read own, update outcome columns only
grant select on public.plan_items to authenticated;
grant update (status, proof_value, rating, completed_at) on public.plan_items to authenticated;
create policy plan_items_select_own on public.plan_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy plan_items_update_own on public.plan_items
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Weekly reviews: read own, accept or refuse proposals only
grant select on public.weekly_reviews to authenticated;
grant update (accepted) on public.weekly_reviews to authenticated;
create policy weekly_reviews_select_own on public.weekly_reviews
  for select to authenticated using (user_id = (select auth.uid()));
create policy weekly_reviews_update_own on public.weekly_reviews
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Engine log: admins only
grant select on public.engine_decisions to authenticated;
create policy engine_decisions_admin_select on public.engine_decisions
  for select to authenticated using ((select public.is_admin()));
