-- Content catalogue (read-only for the app, published rows only).
-- Primary keys reuse catalogue IDs (S01, P001, E001, H01, PR1).

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.sources (
  id text primary key check (id ~ '^S\d{2}$'),
  author text not null,
  title_fr text not null,
  title_original text not null,
  year smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.principles (
  id text primary key check (id ~ '^P\d{3}$'),
  domain public.domain not null,
  title_fr text not null,
  summary_fr text not null,
  title_en text not null,
  summary_en text not null,
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.principle_sources (
  principle_id text not null references public.principles (id) on delete cascade,
  source_id text not null references public.sources (id) on delete restrict,
  position smallint not null check (position > 0),
  primary key (principle_id, source_id)
);

create table public.exercises (
  id text primary key check (id ~ '^E\d{3}$'),
  title_fr text not null,
  instructions_fr text not null,
  title_en text not null,
  instructions_en text not null,
  domain public.domain not null,
  duration_min smallint not null check (duration_min > 0),
  difficulty smallint not null check (difficulty between 1 and 5),
  energy public.energy_level not null,
  time_of_day public.time_of_day not null,
  type public.exercise_type not null,
  -- Empty array = all personas
  personas public.persona[] not null default '{}',
  blockers public.blocker[] not null default '{}',
  -- NULL = never repeated
  repeat_after_days integer check (repeat_after_days > 0),
  proof_type public.proof_type not null,
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- position 1 = main principle (used in catalogue mode)
create table public.exercise_principles (
  exercise_id text not null references public.exercises (id) on delete cascade,
  principle_id text not null references public.principles (id) on delete restrict,
  position smallint not null check (position > 0),
  primary key (exercise_id, principle_id),
  unique (exercise_id, position)
);

create table public.exercise_prerequisites (
  exercise_id text not null references public.exercises (id) on delete cascade,
  prerequisite_id text not null references public.exercises (id) on delete restrict,
  primary key (exercise_id, prerequisite_id),
  check (exercise_id <> prerequisite_id)
);

create table public.habit_templates (
  id text primary key check (id ~ '^H\d{2}$'),
  title_fr text not null,
  description_fr text not null,
  title_en text not null,
  description_en text not null,
  domain public.domain not null,
  frequency public.habit_frequency not null,
  time_of_day public.time_of_day not null,
  default_cue_fr text not null,
  default_cue_en text not null,
  minimal_version_fr text not null,
  minimal_version_en text not null,
  personas public.persona[] not null default '{}',
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.habit_template_principles (
  habit_template_id text not null references public.habit_templates (id) on delete cascade,
  principle_id text not null references public.principles (id) on delete restrict,
  position smallint not null check (position > 0),
  primary key (habit_template_id, principle_id)
);

create table public.programs (
  id text primary key check (id ~ '^PR\d+$'),
  name_fr text not null,
  description_fr text not null,
  name_en text not null,
  description_en text not null,
  persona public.persona not null,
  duration_days smallint not null check (duration_days > 0),
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- During a program, the step principle is authoritative (principle of the day)
create table public.program_steps (
  program_id text not null references public.programs (id) on delete cascade,
  day_index smallint not null check (day_index > 0),
  theme_fr text not null,
  theme_en text not null,
  principle_id text not null references public.principles (id) on delete restrict,
  main_exercise_id text not null references public.exercises (id) on delete restrict,
  minimal_exercise_id text not null references public.exercises (id) on delete restrict,
  introduced_habit_id text references public.habit_templates (id) on delete restrict,
  primary key (program_id, day_index)
);

-- Reverse lookups on link tables
create index principle_sources_source_idx on public.principle_sources (source_id);
create index exercise_principles_principle_idx on public.exercise_principles (principle_id);
create index exercise_prerequisites_prerequisite_idx on public.exercise_prerequisites (prerequisite_id);
create index habit_template_principles_principle_idx on public.habit_template_principles (principle_id);
create index program_steps_principle_idx on public.program_steps (principle_id);
create index program_steps_main_exercise_idx on public.program_steps (main_exercise_id);
create index program_steps_minimal_exercise_idx on public.program_steps (minimal_exercise_id);
create index program_steps_habit_idx on public.program_steps (introduced_habit_id);

-- Engine and library filters
create index principles_status_domain_idx on public.principles (status, domain);
create index exercises_status_domain_idx on public.exercises (status, domain);
create index exercises_personas_idx on public.exercises using gin (personas);
create index exercises_blockers_idx on public.exercises using gin (blockers);
create index habit_templates_status_domain_idx on public.habit_templates (status, domain);

create trigger sources_updated_at before update on public.sources
  for each row execute function public.set_updated_at();
create trigger principles_updated_at before update on public.principles
  for each row execute function public.set_updated_at();
create trigger exercises_updated_at before update on public.exercises
  for each row execute function public.set_updated_at();
create trigger habit_templates_updated_at before update on public.habit_templates
  for each row execute function public.set_updated_at();
create trigger programs_updated_at before update on public.programs
  for each row execute function public.set_updated_at();
