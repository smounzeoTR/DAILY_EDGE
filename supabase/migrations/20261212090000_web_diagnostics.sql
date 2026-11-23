-- dailyedge.fr web diagnostic (site lot S3a, docs/cahier-des-charges-site.md § 7 and § 14).
-- No direct browser access: diagnostic-submit and diagnostic-confirm-marketing (service role).
-- The address is not verified: Brevo is fed only once the marketing consent is confirmed by a
-- click in the result e-mail (marketing_confirmed_at), and one result e-mail per address per 24 h.

-- Column names are part of the Make contract (§ 14): keep them identical.
create table public.web_diagnostics (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and email like '%_@_%'),
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  profile text not null check (profile in ('reveur', 'batisseur', 'sprinteur', 'stratege')),
  recommended_program_id text not null references public.programs (id),
  consent_marketing boolean not null default false,
  marketing_confirmed_at timestamptz,
  utm_source text check (char_length(utm_source) <= 100),
  utm_medium text check (char_length(utm_medium) <= 100),
  utm_campaign text check (char_length(utm_campaign) <= 100),
  landing_path text check (char_length(landing_path) <= 200),
  referral_code text check (referral_code ~ '^[A-Z2-9]{6}$'),
  locale text not null default 'fr' check (locale in ('fr', 'en')),
  claimed_by_user_id uuid references auth.users (id) on delete cascade,
  result_email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days',
  -- Brevo only with a consent given, then confirmed
  check (marketing_confirmed_at is null or consent_marketing)
);

-- One unclaimed diagnostic per address: a new one replaces it
create unique index web_diagnostics_unclaimed_email on public.web_diagnostics (email)
  where claimed_by_user_id is null;
create index web_diagnostics_email on public.web_diagnostics (email);
create index web_diagnostics_expires on public.web_diagnostics (expires_at)
  where claimed_by_user_id is null;

-- Marketing consent confirmation tokens: SHA-256 hash only, 48 h, single use
create table public.web_diagnostic_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  diagnostic_id uuid not null references public.web_diagnostics (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index web_diagnostic_tokens_diagnostic on public.web_diagnostic_tokens (diagnostic_id);

-- RLS closed: no policy at all, and no grant to the browser roles
alter table public.web_diagnostics enable row level security;
alter table public.web_diagnostic_tokens enable row level security;
revoke all on public.web_diagnostics from anon, authenticated;
revoke all on public.web_diagnostic_tokens from anon, authenticated;
grant all on public.web_diagnostics to service_role;
grant all on public.web_diagnostic_tokens to service_role;

-- Saves the diagnostic of an address (replaces its unclaimed one) and decides, under a lock,
-- whether the result e-mail may be sent: at most one per address per 24 hours. When it may,
-- the send is reserved (result_email_sent_at) and, with a pending marketing consent, the
-- confirmation token (hash) replaces the previous ones.
create function public.save_web_diagnostic(
  p_email text,
  p_answers jsonb,
  p_profile text,
  p_program_id text,
  p_consent_marketing boolean,
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text,
  p_landing_path text,
  p_referral_code text,
  p_locale text,
  p_token_hash text
)
returns table (diagnostic_id uuid, send_email boolean, marketing_pending boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id uuid;
  v_last_sent timestamptz;
  v_send boolean;
  v_pending boolean;
begin
  perform pg_advisory_xact_lock(hashtext('web_diagnostic:' || p_email));

  select max(result_email_sent_at) into v_last_sent
  from public.web_diagnostics where email = p_email;
  v_send := v_last_sent is null or v_last_sent <= now() - interval '24 hours';

  update public.web_diagnostics d
  set answers = p_answers,
      profile = p_profile,
      recommended_program_id = p_program_id,
      -- A consent already confirmed stays (Brevo has the contact; unsubscribe goes through Brevo)
      consent_marketing = p_consent_marketing or d.marketing_confirmed_at is not null,
      utm_source = p_utm_source,
      utm_medium = p_utm_medium,
      utm_campaign = p_utm_campaign,
      landing_path = p_landing_path,
      referral_code = p_referral_code,
      locale = p_locale,
      updated_at = now(),
      expires_at = now() + interval '90 days'
  where d.email = p_email and d.claimed_by_user_id is null
  returning d.id into v_id;

  if v_id is null then
    insert into public.web_diagnostics (
      email, answers, profile, recommended_program_id, consent_marketing, utm_source,
      utm_medium, utm_campaign, landing_path, referral_code, locale
    ) values (
      p_email, p_answers, p_profile, p_program_id, p_consent_marketing, p_utm_source,
      p_utm_medium, p_utm_campaign, p_landing_path, p_referral_code, p_locale
    )
    returning id into v_id;
  end if;

  select consent_marketing and marketing_confirmed_at is null into v_pending
  from public.web_diagnostics where id = v_id;

  if v_send then
    update public.web_diagnostics set result_email_sent_at = now() where id = v_id;
    if v_pending and p_token_hash is not null then
      update public.web_diagnostic_tokens set used_at = now()
      where diagnostic_id = v_id and used_at is null;
      insert into public.web_diagnostic_tokens (token_hash, diagnostic_id, expires_at)
      values (p_token_hash, v_id, now() + interval '48 hours');
    end if;
  end if;

  return query select v_id, v_send, v_pending;
end;
$$;

-- The e-mail could not be sent: the reservation is released (a new attempt stays possible)
create function public.release_web_diagnostic_email(p_diagnostic_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.web_diagnostics set result_email_sent_at = null where id = p_diagnostic_id;
  delete from public.web_diagnostic_tokens where diagnostic_id = p_diagnostic_id and used_at is null;
$$;

-- Marketing consent confirmed by the e-mail link: true when the token was valid
create function public.confirm_diagnostic_marketing(p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.web_diagnostic_tokens
  set used_at = now()
  where token_hash = p_token_hash and used_at is null and expires_at > now()
  returning diagnostic_id into v_id;
  if v_id is null then
    return false;
  end if;
  update public.web_diagnostics
  set marketing_confirmed_at = coalesce(marketing_confirmed_at, now()), updated_at = now()
  where id = v_id and consent_marketing;
  return found;
end;
$$;

-- Unclaimed diagnostics are deleted after 90 days (site § 7)
create function public.purge_web_diagnostics()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.web_diagnostics where claimed_by_user_id is null and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.save_web_diagnostic(text, jsonb, text, text, boolean, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.release_web_diagnostic_email(uuid) from public, anon, authenticated;
revoke all on function public.confirm_diagnostic_marketing(text) from public, anon, authenticated;
revoke all on function public.purge_web_diagnostics() from public, anon, authenticated;
grant execute on function public.save_web_diagnostic(text, jsonb, text, text, boolean, text, text, text, text, text, text, text) to service_role;
grant execute on function public.release_web_diagnostic_email(uuid) to service_role;
grant execute on function public.confirm_diagnostic_marketing(text) to service_role;

select cron.schedule('purge-web-diagnostics', '15 3 * * *', 'select public.purge_web_diagnostics()');

-- Make webhook (§ 14): Supabase database webhook format, header x-webhook-secret, URL and secret
-- from Vault (make_hook_diagnostic, make_webhook_secret). Sent once, when the marketing consent
-- becomes confirmed. Same hardening as the waitlist: absent or empty value = nothing sent, any
-- exception caught and logged, request recorded for the ops-checks alert.
create function public.notify_make_diagnostic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  begin
    select nullif(trim(decrypted_secret), '') into v_url
    from vault.decrypted_secrets where name = 'make_hook_diagnostic';
    select nullif(trim(decrypted_secret), '') into v_secret
    from vault.decrypted_secrets where name = 'make_webhook_secret';
    if v_url is null or v_secret is null then
      raise warning 'make diagnostic webhook not configured (vault secrets missing or empty)';
      return new;
    end if;
    v_request_id := net.http_post(
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
    insert into public.make_webhook_requests (request_id, source_table, url_host)
    values (v_request_id, tg_table_name, coalesce(substring(v_url from '^https?://([^/:?#]+)'), ''));
  exception when others then
    raise warning 'make diagnostic webhook failed: % (%)', sqlerrm, sqlstate;
  end;
  return new;
end;
$$;

revoke all on function public.notify_make_diagnostic() from public, anon, authenticated;

create trigger web_diagnostics_make_webhook
  after update on public.web_diagnostics
  for each row
  when (old.marketing_confirmed_at is null and new.marketing_confirmed_at is not null)
  execute function public.notify_make_diagnostic();
