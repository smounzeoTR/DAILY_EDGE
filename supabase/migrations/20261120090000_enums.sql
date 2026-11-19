-- Enumerated types shared by content and user tables.
-- French catalogue labels are mapped to these codes by scripts/import-catalog.

create type public.content_status as enum ('draft', 'review', 'published', 'retired');

create type public.domain as enum (
  'clarity_goals',
  'discipline_habits',
  'money_wealth',
  'business_career',
  'mindset_beliefs',
  'relationships_network',
  'energy_health'
);

create type public.persona as enum ('entrepreneur', 'employee', 'career_changer', 'financial_beginner');

create type public.blocker as enum (
  'procrastination',
  'fear',
  'finances',
  'confidence',
  'organisation',
  'motivation'
);

create type public.energy_level as enum ('low', 'medium', 'high');

create type public.time_of_day as enum ('morning', 'daytime', 'evening', 'any');

create type public.exercise_type as enum (
  'writing',
  'reflection',
  'action',
  'visualisation',
  'learning',
  'social'
);

create type public.proof_type as enum ('checkbox', 'free_text', 'numeric');

create type public.habit_frequency as enum (
  'daily',
  'weekdays',
  'weekly',
  'biweekly',
  'monthly',
  'occasional'
);

create type public.situation as enum ('employee', 'entrepreneur', 'freelancer', 'student', 'in_transition');

create type public.chronotype as enum ('morning', 'midday', 'evening');

create type public.motivation_style as enum ('challenge', 'consistency', 'meaning', 'recognition');

create type public.user_level as enum ('beginner', 'intermediate', 'advanced');

create type public.user_role as enum ('user', 'admin');

create type public.plan_mode as enum ('normal', 'minimal', 'recovery');

create type public.plan_item_status as enum ('todo', 'done', 'skipped', 'too_hard');

create type public.subscription_plan as enum ('free', 'premium');

create type public.goal_status as enum ('active', 'achieved', 'abandoned');

create type public.favorite_entity as enum ('principle', 'exercise');
