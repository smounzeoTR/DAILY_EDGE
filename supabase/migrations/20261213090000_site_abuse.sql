-- Anti-abuse of the dailyedge.fr functions (site lot S4):
-- * rate limits per IP: the IP is only hashed with a salt of the day (UTC), created on demand,
--   stored server side and destroyed every day; hits are deleted after 48 hours;
-- * ALTCHA: each solved challenge is accepted once (ids kept until the challenge expires);
-- * waitlist: at most 3 e-mails per address per 24 hours.
-- Browser roles have no access to any of these tables.

create table public.rate_limit_salts (
  day date primary key,
  salt bytea not null default extensions.gen_random_bytes(32),
  created_at timestamptz not null default now()
);

create table public.rate_limit_hits (
  id bigint generated always as identity primary key,
  action text not null check (char_length(action) <= 64),
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index rate_limit_hits_lookup on public.rate_limit_hits (action, ip_hash, created_at desc);
create index rate_limit_hits_created on public.rate_limit_hits (created_at);

create table public.altcha_used_challenges (
  challenge_id text primary key check (char_length(challenge_id) <= 200),
  expires_at timestamptz not null
);

create table public.waitlist_email_sends (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.waitlist_entries (id) on delete cascade,
  sent_at timestamptz not null default now()
);
create index waitlist_email_sends_entry on public.waitlist_email_sends (entry_id, sent_at desc);

alter table public.rate_limit_salts enable row level security;
alter table public.rate_limit_hits enable row level security;
alter table public.altcha_used_challenges enable row level security;
alter table public.waitlist_email_sends enable row level security;
revoke all on public.rate_limit_salts, public.rate_limit_hits, public.altcha_used_challenges,
  public.waitlist_email_sends from anon, authenticated;
grant all on public.rate_limit_hits, public.altcha_used_challenges, public.waitlist_email_sends
  to service_role;
-- The salts are read by the functions below only (never by the Edge Functions)
revoke all on public.rate_limit_salts from service_role;

-- Records a hit of p_action for p_ip and tells whether it is allowed. p_limits: array of
-- {"max": n, "seconds": s}; a refused hit is not recorded (the window is not extended).
-- The IP is never stored: only sha256(salt of the day || ip).
create function public.site_rate_limit(p_action text, p_ip text, p_limits jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salt bytea;
  v_hash text;
  v_limit jsonb;
  v_count integer;
begin
  insert into public.rate_limit_salts (day) values ((now() at time zone 'utc')::date)
  on conflict (day) do nothing;
  select salt into v_salt from public.rate_limit_salts
  where day = (now() at time zone 'utc')::date;
  v_hash := encode(extensions.digest(v_salt || convert_to(p_ip, 'UTF8'), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtext(p_action || ':' || v_hash));
  for v_limit in select * from jsonb_array_elements(p_limits) loop
    select count(*) into v_count from public.rate_limit_hits
    where action = p_action and ip_hash = v_hash
      and created_at > now() - make_interval(secs => (v_limit ->> 'seconds')::integer);
    if v_count >= (v_limit ->> 'max')::integer then
      return false;
    end if;
  end loop;

  insert into public.rate_limit_hits (action, ip_hash) values (p_action, v_hash);
  return true;
end;
$$;

-- ALTCHA anti-replay: true the first time a challenge id is seen
create function public.altcha_mark_used(p_challenge_id text, p_expires_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.altcha_used_challenges (challenge_id, expires_at)
  values (p_challenge_id, p_expires_at)
  on conflict (challenge_id) do nothing;
  return found;
end;
$$;

-- Waitlist: reserves an e-mail for the entry when fewer than 3 were sent in the last 24 hours
create function public.waitlist_reserve_email(p_entry_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('waitlist_email:' || p_entry_id::text));
  if (select count(*) from public.waitlist_email_sends
      where entry_id = p_entry_id and sent_at > now() - interval '24 hours') >= 3 then
    return false;
  end if;
  insert into public.waitlist_email_sends (entry_id) values (p_entry_id);
  return true;
end;
$$;

-- Daily destruction of the past salts, purge of the hits (48 h) and of the other logs
create function public.purge_site_abuse_data()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.rate_limit_salts where day < (now() at time zone 'utc')::date;
  delete from public.rate_limit_hits where created_at < now() - interval '48 hours';
  delete from public.altcha_used_challenges where expires_at < now() - interval '1 hour';
  delete from public.waitlist_email_sends where sent_at < now() - interval '48 hours';
$$;

revoke all on function public.site_rate_limit(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.altcha_mark_used(text, timestamptz) from public, anon, authenticated;
revoke all on function public.waitlist_reserve_email(uuid) from public, anon, authenticated;
revoke all on function public.purge_site_abuse_data() from public, anon, authenticated;
grant execute on function public.site_rate_limit(text, text, jsonb) to service_role;
grant execute on function public.altcha_mark_used(text, timestamptz) to service_role;
grant execute on function public.waitlist_reserve_email(uuid) to service_role;

-- Every hour: the salt of a past day disappears within the hour after midnight (UTC)
select cron.schedule('purge-site-abuse-data', '7 * * * *', 'select public.purge_site_abuse_data()');
