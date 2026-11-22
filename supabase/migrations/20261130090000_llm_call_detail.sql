-- Detail of an AI call that succeeded with an adjustment (e.g. trimmed_to_budget: the AI's choice
-- was cut to fit the time budget), shown in the admin engine log.
alter table public.llm_calls add column detail text;

create or replace function public.admin_engine_log(p_email text, p_limit integer default 30)
returns table (
  decision_id uuid,
  created_at timestamptz,
  plan_date date,
  mode public.plan_mode,
  program_day smallint,
  ai_status text,
  rules_fired text[],
  why jsonb,
  candidates jsonb,
  items jsonb,
  llm_calls jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  perform public.require_admin();
  select u.id into v_user_id from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_user_id is null then
    raise exception using errcode = 'P0002', message = 'user_not_found';
  end if;
  return query
  select
    d.id, d.created_at, dp.date, dp.mode, dp.program_day, dp.ai_status,
    d.rules_fired, d.why, d.candidates,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'exercise_id', pi.exercise_id, 'origin', pi.origin, 'status', pi.status,
        'personalized', pi.personalized_instructions is not null
      ) order by pi.position)
      from public.plan_items pi where pi.plan_id = d.plan_id
    ), '[]'),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'model', c.model, 'outcome', c.outcome, 'fallback_reason', c.fallback_reason,
        'detail', c.detail,
        'input_tokens', c.input_tokens, 'output_tokens', c.output_tokens,
        'cost_eur', c.cost_eur, 'latency_ms', c.latency_ms, 'attempts', c.attempts
      ) order by c.created_at)
      from public.llm_calls c where c.decision_id = d.id
    ), '[]')
  from public.engine_decisions d
  left join public.daily_plans dp on dp.id = d.plan_id
  where d.user_id = v_user_id
  order by d.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 200));
end;
$$;
