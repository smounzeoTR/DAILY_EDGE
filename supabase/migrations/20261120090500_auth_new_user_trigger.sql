-- Create profile and free subscription on sign-up.
-- Optional metadata: locale ('fr' | 'en'), display_name, timezone.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_locale text := meta ->> 'locale';
  v_timezone text := meta ->> 'timezone';
begin
  if v_locale is null or v_locale not in ('fr', 'en') then
    v_locale := 'fr';
  end if;

  if v_timezone is null
    or not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    v_timezone := 'Europe/Paris';
  end if;

  insert into public.profiles (user_id, display_name, locale, timezone)
  values (new.id, nullif(trim(meta ->> 'display_name'), ''), v_locale, v_timezone);

  insert into public.subscriptions (user_id, plan, status)
  values (new.id, 'free', 'active');

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
