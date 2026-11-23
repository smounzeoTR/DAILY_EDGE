-- dailyedge.fr waitlist (site lot S2, docs/cahier-des-charges-site.md § 6 and § 14).
-- No direct browser access: everything goes through the waitlist-* Edge Functions (service role).

create type public.waitlist_status as enum ('pending', 'confirmed', 'unsubscribed');

-- Column names are part of the Make contract (§ 14): keep them identical.
create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and email like '%_@_%'),
  status public.waitlist_status not null default 'pending',
  referral_code text not null unique check (referral_code ~ '^[A-Z2-9]{6}$'),
  referred_by text check (referred_by ~ '^[A-Z2-9]{6}$'),
  confirmed_referrals integer not null default 0 check (confirmed_referrals >= 0),
  rank integer check (rank >= 1),
  utm_source text check (char_length(utm_source) <= 100),
  utm_medium text check (char_length(utm_medium) <= 100),
  utm_campaign text check (char_length(utm_campaign) <= 100),
  landing_path text check (char_length(landing_path) <= 200),
  consent_marketing boolean not null default false,
  consent_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  locale text not null default 'fr' check (locale in ('fr', 'en'))
);

create index waitlist_entries_confirmed_order on public.waitlist_entries (created_at, id)
  where status = 'confirmed';
create index waitlist_entries_referred_by on public.waitlist_entries (referred_by);

-- Tokens live in their own table so that the webhook record only carries the § 6 columns.
-- Only the SHA-256 hash is stored; confirm tokens: 48 h, single use.
create table public.waitlist_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  entry_id uuid not null references public.waitlist_entries (id) on delete cascade,
  kind text not null check (kind in ('confirm', 'status')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index waitlist_tokens_entry on public.waitlist_tokens (entry_id, kind);

-- RLS closed: no policy at all, and no grant to the browser roles
alter table public.waitlist_entries enable row level security;
alter table public.waitlist_tokens enable row level security;
revoke all on public.waitlist_entries from anon, authenticated;
revoke all on public.waitlist_tokens from anon, authenticated;
grant all on public.waitlist_entries to service_role;
grant all on public.waitlist_tokens to service_role;

-- Rank: sign-up order among confirmed entries, minus 10 per confirmed referral, floor 1.
-- Same rule as supabase/functions/_shared/waitlist/rank.ts.
create function public.waitlist_rank(p_position integer, p_confirmed_referrals integer)
returns integer
language sql immutable
set search_path = ''
as $$
  select greatest(1, p_position - 10 * p_confirmed_referrals);
$$;

-- Recomputes every confirmed rank (status unchanged: no webhook)
create function public.recompute_waitlist_ranks()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.waitlist_entries e
  set rank = public.waitlist_rank(o.position::integer, e.confirmed_referrals)
  from (
    select id, row_number() over (order by created_at, id) as position
    from public.waitlist_entries
    where status = 'confirmed'
  ) o
  where e.id = o.id
    and e.rank is distinct from public.waitlist_rank(o.position::integer, e.confirmed_referrals);
$$;

-- Confirms the entry of a confirm token (hash). Returns the entry, or nothing when the token
-- is unknown, expired or already used. Rank and status are set in one UPDATE so that the
-- webhook carries the rank.
create function public.confirm_waitlist_entry(p_token_hash text)
returns setof public.waitlist_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
  v_entry public.waitlist_entries;
  v_position integer;
begin
  update public.waitlist_tokens
  set used_at = now()
  where token_hash = p_token_hash
    and kind = 'confirm'
    and used_at is null
    and expires_at > now()
  returning entry_id into v_entry_id;
  if v_entry_id is null then
    return;
  end if;

  select * into v_entry from public.waitlist_entries where id = v_entry_id for update;
  if v_entry.status <> 'pending' then
    return query select * from public.waitlist_entries where id = v_entry_id;
    return;
  end if;

  -- Serializes rank computations
  perform pg_advisory_xact_lock(hashtext('waitlist_rank'));

  select count(*)::integer + 1 into v_position
  from public.waitlist_entries
  where status = 'confirmed'
    and (created_at, id) < (v_entry.created_at, v_entry.id);

  update public.waitlist_entries
  set status = 'confirmed',
      confirmed_at = coalesce(confirmed_at, now()),
      rank = public.waitlist_rank(v_position, confirmed_referrals)
  where id = v_entry_id;

  -- First confirmation only (a re-subscription never counts twice): the referrer, confirmed or
  -- not yet, gains 10 places; never oneself
  if v_entry.confirmed_at is null then
    update public.waitlist_entries
    set confirmed_referrals = confirmed_referrals + 1
    where referral_code = v_entry.referred_by
      and id <> v_entry_id;
  end if;

  perform public.recompute_waitlist_ranks();

  return query select * from public.waitlist_entries where id = v_entry_id;
end;
$$;

revoke all on function public.waitlist_rank(integer, integer) from public, anon, authenticated;
revoke all on function public.recompute_waitlist_ranks() from public, anon, authenticated;
revoke all on function public.confirm_waitlist_entry(text) from public, anon, authenticated;
grant execute on function public.waitlist_rank(integer, integer) to service_role;
grant execute on function public.recompute_waitlist_ranks() to service_role;
grant execute on function public.confirm_waitlist_entry(text) to service_role;

-- Make webhook (§ 14): Supabase database webhook format, POST JSON, header x-webhook-secret.
-- URL and secret are read from Vault (make_hook_waitlist, make_webhook_secret), never stored here.
-- Sent only when the status changes (rank recomputations do not call Make).
create function public.notify_make_waitlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'make_hook_waitlist';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'make_webhook_secret';
  if v_url is null or v_secret is null then
    raise warning 'make waitlist webhook not configured (vault secrets missing)';
    return new;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new),
      'old_record', to_jsonb(old)
    ),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    timeout_milliseconds := 10000
  );
  return new;
end;
$$;

revoke all on function public.notify_make_waitlist() from public, anon, authenticated;

create trigger waitlist_entries_make_webhook
  after update on public.waitlist_entries
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_make_waitlist();
