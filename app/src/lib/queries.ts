// Data access (TanStack Query). The app only reads published content (RLS).
import { QueryClient, useQuery } from '@tanstack/react-query';

import { supabase } from './supabase';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 5 * 60 * 1000 },
  },
});

export const queryKeys = {
  profile: (userId: string) => ['profile', userId] as const,
  introPrinciple: ['catalog', 'introPrinciple'] as const,
  principleCount: ['catalog', 'principleCount'] as const,
  programs: ['catalog', 'programs'] as const,
  programSteps: ['catalog', 'programSteps'] as const,
  habitTemplates: ['catalog', 'habitTemplates'] as const,
  userHabits: (userId: string) => ['userHabits', userId] as const,
  plan: (userId: string, date: string) => ['plan', userId, date] as const,
  habitLogs: (userId: string, from: string) => ['habitLogs', userId, from] as const,
  checkin: (userId: string, date: string) => ['checkin', userId, date] as const,
};

// Intro screen 1 shows P026 (two-minute rule), see docs/corrections-maquette.md
export const INTRO_PRINCIPLE_ID = 'P026';

async function unwrap<T>(promise: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.profile(userId ?? 'none'),
    enabled: Boolean(userId),
    staleTime: 0,
    queryFn: () =>
      unwrap(
        supabase
          .from('profiles')
          .select(
            'user_id, display_name, locale, timezone, onboarded_at, program_id, program_day, notify_morning, notify_evening, consent_checkin',
          )
          .eq('user_id', userId ?? '')
          .single(),
      ),
  });
}

export function useIntroPrinciple() {
  return useQuery({
    queryKey: queryKeys.introPrinciple,
    queryFn: () =>
      unwrap(
        supabase
          .from('principles')
          .select('id, title_fr, title_en, summary_fr, summary_en')
          .eq('id', INTRO_PRINCIPLE_ID)
          .maybeSingle(),
      ),
  });
}

export function usePrincipleCount() {
  return useQuery({
    queryKey: queryKeys.principleCount,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('principles')
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function usePrograms() {
  return useQuery({
    queryKey: queryKeys.programs,
    queryFn: () =>
      unwrap(
        supabase
          .from('programs')
          .select('id, persona, duration_days, name_fr, name_en, description_fr, description_en')
          .order('id'),
      ),
  });
}

export function useProgramSteps() {
  return useQuery({
    queryKey: queryKeys.programSteps,
    queryFn: () =>
      unwrap(
        supabase
          .from('program_steps')
          .select('program_id, day_index, theme_fr, theme_en')
          .order('program_id')
          .order('day_index'),
      ),
  });
}

export function useHabitTemplates() {
  return useQuery({
    queryKey: queryKeys.habitTemplates,
    queryFn: () =>
      unwrap(
        supabase
          .from('habit_templates')
          .select(
            'id, domain, personas, title_fr, title_en, description_fr, description_en, default_cue_fr, default_cue_en, minimal_version_fr, minimal_version_en',
          )
          .order('id'),
      ),
  });
}

export function useUserHabits(userId: string) {
  return useQuery({
    queryKey: queryKeys.userHabits(userId),
    queryFn: () =>
      unwrap(
        supabase
          .from('user_habits')
          .select(
            'id, title, cue, minimal_version, active, frequency, template_id, created_at, template:habit_templates(title_fr, title_en, default_cue_fr, default_cue_en, minimal_version_fr, minimal_version_en)',
          )
          .eq('active', true)
          .order('created_at'),
      ),
  });
}

// Plan of a day with its principle, exercises and proposed habit
export function usePlan(userId: string, date: string) {
  return useQuery({
    queryKey: queryKeys.plan(userId, date),
    staleTime: 0,
    queryFn: () =>
      unwrap(
        supabase
          .from('daily_plans')
          .select(
            `id, date, mode, program_day, why_today, introduced_habit_id,
             principle:principles(id, title_fr, title_en, summary_fr, summary_en),
             introduced:habit_templates(id, title_fr, title_en, description_fr, description_en, default_cue_fr, default_cue_en),
             plan_items(id, position, status, proof_value, rating,
               exercise:exercises(id, title_fr, title_en, instructions_fr, instructions_en, duration_min, proof_type))`,
          )
          .eq('date', date)
          .maybeSingle(),
      ),
  });
}

export type PlanData = NonNullable<ReturnType<typeof usePlan>['data']>;

// Habit logs since `from` (covers the longest period: a calendar month)
export function useHabitLogs(userId: string, from: string) {
  return useQuery({
    queryKey: queryKeys.habitLogs(userId, from),
    staleTime: 0,
    queryFn: () =>
      unwrap(
        supabase.from('habit_logs').select('user_habit_id, date, done, minimal').gte('date', from),
      ),
  });
}

export function useCheckin(userId: string, date: string) {
  return useQuery({
    queryKey: queryKeys.checkin(userId, date),
    staleTime: 0,
    queryFn: () =>
      unwrap(
        supabase
          .from('checkins')
          .select('date, energy, mood, minutes_tomorrow, reflection, note')
          .eq('date', date)
          .maybeSingle(),
      ),
  });
}

export type GeneratedPlan = {
  status: 'created' | 'recomputed' | 'unchanged';
  plan: {
    id: string;
    date: string;
    mode: 'normal' | 'minimal' | 'recovery';
    plan_items: { exercise_id: string }[];
  };
};

// Server-side plan generation (today by default, or tomorrow)
export async function generatePlan(date?: string): Promise<GeneratedPlan> {
  const { data, error } = await supabase.functions.invoke<GeneratedPlan>('generate-plan', {
    body: date ? { date } : {},
  });
  if (error || !data) throw error ?? new Error('generate-plan failed');
  return data;
}

export async function exerciseTitles(ids: string[]) {
  return unwrap(supabase.from('exercises').select('id, title_fr, title_en').in('id', ids));
}
