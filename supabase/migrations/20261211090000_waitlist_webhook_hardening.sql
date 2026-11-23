-- Make webhook of the waitlist, hardened (site deployment):
-- * an absent or empty Vault value means "not configured": nothing is sent, no error;
-- * any exception is caught and logged as a warning: a confirmation never fails because of Make;
-- * every request sent to Make is recorded, so that ops-checks can raise an alert when Make
--   answers with a non-2xx status (pg_net is asynchronous: a failure would go unnoticed).

-- Requests sent to Make (id of net.http_request_queue / net._http_response)
create table public.make_webhook_requests (
  request_id bigint primary key,
  source_table text not null,
  url_host text not null,
  created_at timestamptz not null default now()
);
create index make_webhook_requests_created_idx on public.make_webhook_requests (created_at desc);
alter table public.make_webhook_requests enable row level security;
revoke all on public.make_webhook_requests from anon, authenticated;
grant all on public.make_webhook_requests to service_role;

create or replace function public.notify_make_waitlist()
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
    from vault.decrypted_secrets where name = 'make_hook_waitlist';
    select nullif(trim(decrypted_secret), '') into v_secret
    from vault.decrypted_secrets where name = 'make_webhook_secret';
    if v_url is null or v_secret is null then
      raise warning 'make waitlist webhook not configured (vault secrets missing or empty)';
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
    -- Never block the confirmation: log only (no personal data in the message)
    raise warning 'make waitlist webhook failed: % (%)', sqlerrm, sqlstate;
  end;
  return new;
end;
$$;

revoke all on function public.notify_make_waitlist() from public, anon, authenticated;

-- New alert kind: Make answered with a non-2xx status (or did not answer)
alter table public.ops_alerts drop constraint ops_alerts_kind_check;
alter table public.ops_alerts add constraint ops_alerts_kind_check
  check (kind in ('batch_missing', 'batch_failed', 'ai_cost', 'make_webhook_failed'));

-- Same checks as before, plus the failed Make webhooks of the last 24 hours.
-- pg_net keeps its responses 6 hours (pg_net.ttl): the hourly ops-checks sees each one.
create or replace function public.check_ops_alerts(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (p_now at time zone 'Europe/Paris')::date;
  v_created integer := 0;
  v_rows integer;
  v_last public.ops_batch_runs;
  v_cost numeric;
  v_threshold numeric;
  v_failed integer;
  v_statuses jsonb;
begin
  select * into v_last from public.ops_batch_runs
  where started_at <= p_now order by started_at desc limit 1;

  -- The hourly batch has not finished for more than 2 hours
  if v_last.id is null or v_last.started_at < p_now - interval '2 hours' then
    insert into public.ops_alerts (kind, day, detail)
    values ('batch_missing', v_day, jsonb_build_object('last_run', v_last.started_at))
    on conflict (kind, day) do nothing;
    get diagnostics v_rows = row_count;
    v_created := v_created + v_rows;
  elsif not v_last.ok then
    insert into public.ops_alerts (kind, day, detail)
    values ('batch_failed', v_day,
            jsonb_build_object('run', v_last.started_at, 'summary', v_last.summary))
    on conflict (kind, day) do nothing;
    get diagnostics v_rows = row_count;
    v_created := v_created + v_rows;
  end if;

  select coalesce(sum(cost_eur), 0) into v_cost from public.llm_calls
  where (created_at at time zone 'Europe/Paris')::date = v_day;
  select (value #>> '{}')::numeric into v_threshold
  from public.app_settings where key = 'ops_ai_daily_cost_alert_eur';
  if v_threshold is not null and v_cost > v_threshold then
    insert into public.ops_alerts (kind, day, detail)
    values ('ai_cost', v_day, jsonb_build_object('cost_eur', round(v_cost, 4), 'threshold_eur', v_threshold))
    on conflict (kind, day) do nothing;
    get diagnostics v_rows = row_count;
    v_created := v_created + v_rows;
  end if;

  -- Make webhooks answered with a non-2xx status, a timeout or a transport error (last 24 h)
  select count(*)::integer,
         coalesce(jsonb_agg(distinct coalesce(h.status_code::text, 'erreur')), '[]'::jsonb)
  into v_failed, v_statuses
  from public.make_webhook_requests r
  join net._http_response h on h.id = r.request_id
  where r.created_at > p_now - interval '24 hours'
    and r.url_host like 'hook.%.make.com'
    and (h.status_code is null or h.status_code not between 200 and 299
         or h.timed_out is true or h.error_msg is not null);
  if v_failed > 0 then
    insert into public.ops_alerts (kind, day, detail)
    values ('make_webhook_failed', v_day,
            jsonb_build_object('failed', v_failed, 'statuses', v_statuses))
    on conflict (kind, day) do update
      set detail = excluded.detail
      where public.ops_alerts.notified_at is null;
    get diagnostics v_rows = row_count;
    v_created := v_created + v_rows;
  end if;

  -- Keep 30 days of webhook requests
  delete from public.make_webhook_requests where created_at < p_now - interval '30 days';
  return v_created;
end;
$$;
revoke all on function public.check_ops_alerts(timestamptz) from public, anon, authenticated;
grant execute on function public.check_ops_alerts(timestamptz) to service_role;
