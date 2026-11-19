-- One row per plan computation (rules, candidates, LLM call, fallback).
-- Purged after 12 months (job added in a later lot).

create table public.engine_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid references public.daily_plans (id) on delete set null,
  rules_fired text[] not null default '{}',
  candidates jsonb not null default '[]',
  llm_model text,
  llm_input_hash text,
  llm_output jsonb,
  fallback_used boolean not null default false,
  latency_ms integer check (latency_ms >= 0),
  created_at timestamptz not null default now()
);

create index engine_decisions_user_created_idx on public.engine_decisions (user_id, created_at desc);
create index engine_decisions_plan_idx on public.engine_decisions (plan_id);
create index engine_decisions_created_idx on public.engine_decisions (created_at);
