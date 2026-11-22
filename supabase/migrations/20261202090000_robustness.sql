-- Lot 10a: audience measurement consent (PostHog, opt-in) and low-mood support card shown once
-- per episode.

-- Audience measurement (PostHog, EU): explicit consent, off by default; the user can change it
alter table public.profiles add column consent_analytics boolean not null default false;
grant update (consent_analytics) on public.profiles to authenticated;

-- Low-mood episodes already shown: {episode start date: shown at}, append only
alter table public.user_guide_state add column support_seen jsonb not null default '{}';

create function public.mark_support_shown(p_episode_start date)
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
  -- An episode starts in the past (at least 4 days before today)
  if p_episode_start is null or p_episode_start > public.current_user_local_date() - 4 then
    raise exception using errcode = '22023', message = 'invalid_episode';
  end if;
  insert into public.user_guide_state (user_id, support_seen)
  values (v_user_id, jsonb_build_object(p_episode_start::text, now()))
  on conflict (user_id) do update
    -- The first time is kept: one card per episode
    set support_seen = jsonb_build_object(p_episode_start::text, now())
                       || public.user_guide_state.support_seen;
end;
$$;
revoke all on function public.mark_support_shown(date) from public, anon;
grant execute on function public.mark_support_shown(date) to authenticated;
