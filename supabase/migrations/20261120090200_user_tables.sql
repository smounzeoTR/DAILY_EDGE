-- User data. Every table carries user_id; RLS is defined in a later migration.
-- Duplicated user_id columns (habit_logs, plan_items) are kept consistent
-- with their parent through composite foreign keys.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  locale text not null default 'fr' check (locale in ('fr', 'en')),
  timezone text not null default 'Europe/Paris',
  situation public.situation,
  priority_domains public.domain[] not null default '{}'
    check (cardinality(priority_domains) <= 3),
  blockers public.blocker[] not null default '{}',
  daily_minutes smallint check (daily_minutes in (5, 15, 30, 45)),
  chronotype public.chronotype,
  motivation_style public.motivation_style,
  level public.user_level not null default 'beginner',
  persona public.persona,
  program_id text references public.programs (id) on delete restrict,
  program_start_date date,
  program_day smallint not null default 1 check (program_day > 0),
  notify_morning time,
  notify_evening time,
  consent_checkin boolean not null default false,
  consent_ai boolean not null default false,
  consent_at timestamptz,
  role public.user_role not null default 'user',
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan public.subscription_plan not null default 'free',
  provider text,
  status text not null default 'active',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  why text,
  target_value numeric,
  unit text,
  deadline date,
  current_value numeric,
  status public.goal_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  template_id text references public.habit_templates (id) on delete restrict,
  title text not null check (length(trim(title)) > 0),
  cue text,
  minimal_version text,
  frequency public.habit_frequency not null default 'daily',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.habit_logs (
  user_habit_id uuid not null,
  user_id uuid not null,
  date date not null,
  done boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_habit_id, date),
  foreign key (user_habit_id, user_id)
    references public.user_habits (id, user_id) on delete cascade
);

create table public.checkins (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  -- Energy and mood stay empty without check-in consent
  energy smallint check (energy between 1 and 5),
  mood smallint check (mood between 1 and 5),
  minutes_tomorrow smallint check (minutes_tomorrow in (5, 15, 30)),
  reflection text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  principle_id text references public.principles (id) on delete restrict,
  mode public.plan_mode not null,
  -- Program day this plan covers; NULL in catalogue mode
  program_day smallint check (program_day > 0),
  why_today text,
  created_at timestamptz not null default now(),
  unique (user_id, date),
  unique (id, user_id)
);

create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  user_id uuid not null,
  exercise_id text not null references public.exercises (id) on delete restrict,
  position smallint not null default 1 check (position > 0),
  personalized_instructions text,
  status public.plan_item_status not null default 'todo',
  proof_value text,
  rating smallint check (rating between 1 and 5),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, exercise_id),
  foreign key (plan_id, user_id)
    references public.daily_plans (id, user_id) on delete cascade
);

create table public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  summary text,
  proposals jsonb not null default '[]',
  accepted jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  entity_type public.favorite_entity not null,
  entity_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, entity_type, entity_id)
);

-- Recomputed nightly by a server job
create table public.profile_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  completion_7d numeric,
  completion_by_domain jsonb not null default '{}',
  energy_trend numeric,
  avg_minutes numeric,
  level public.user_level,
  updated_at timestamptz not null default now()
);

create index goals_user_idx on public.goals (user_id);
create index user_habits_user_idx on public.user_habits (user_id);
create index habit_logs_user_date_idx on public.habit_logs (user_id, date);
create index habit_logs_habit_user_idx on public.habit_logs (user_habit_id, user_id);
create index plan_items_plan_user_idx on public.plan_items (plan_id, user_id);
create index plan_items_user_exercise_idx on public.plan_items (user_id, exercise_id);
create index daily_plans_principle_idx on public.daily_plans (principle_id);
create index profiles_program_idx on public.profiles (program_id);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();
create trigger goals_updated_at before update on public.goals
  for each row execute function public.set_updated_at();
create trigger user_habits_updated_at before update on public.user_habits
  for each row execute function public.set_updated_at();
create trigger checkins_updated_at before update on public.checkins
  for each row execute function public.set_updated_at();
create trigger plan_items_updated_at before update on public.plan_items
  for each row execute function public.set_updated_at();
create trigger weekly_reviews_updated_at before update on public.weekly_reviews
  for each row execute function public.set_updated_at();
