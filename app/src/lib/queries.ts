// Data access (TanStack Query). The app only reads published content (RLS).
import { QueryClient, useQuery } from '@tanstack/react-query';

import { track } from './analytics';
import { supabase } from './supabase';

export const queryClient = new QueryClient({
  defaultOptions: {
    // gcTime covers the persisted cache (offline start, see features/offline/persist.ts)
    queries: { retry: 2, staleTime: 5 * 60 * 1000, gcTime: 3 * 24 * 60 * 60 * 1000 },
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
            'user_id, display_name, locale, timezone, onboarded_at, program_id, program_day, notify_morning, notify_evening, consent_checkin, consent_ai, consent_analytics, level, daily_minutes, persona, deletion_requested_at, role',
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
            'id, title, cue, minimal_version, active, simplified, frequency, template_id, created_at, template:habit_templates(title_fr, title_en, default_cue_fr, default_cue_en, minimal_version_fr, minimal_version_en)',
          )
          .eq('active', true)
          .order('created_at'),
      ),
  });
}

// AI enrichment in progress: polled every 3 s, for at most 30 s after the computation
export const AI_POLL_MS = 3000;
export const AI_POLL_MAX_MS = 30_000;
export function isAiPending(
  row: { ai_status: string | null; generated_at: string | null } | null | undefined,
  now = Date.now(),
): boolean {
  if (!row || row.ai_status !== 'pending' || !row.generated_at) return false;
  return now - new Date(row.generated_at).getTime() < AI_POLL_MAX_MS;
}

// Plan of a day with its principle, exercises and proposed habit
export function usePlan(userId: string, date: string) {
  return useQuery({
    queryKey: queryKeys.plan(userId, date),
    staleTime: 0,
    refetchInterval: (query) => (isAiPending(query.state.data) ? AI_POLL_MS : false),
    queryFn: () =>
      unwrap(
        supabase
          .from('daily_plans')
          .select(
            `id, date, mode, program_day, why_today, introduced_habit_id, generated_at, ai_status,
             principle_read_at,
             principle:principles(id, title_fr, title_en, summary_fr, summary_en),
             introduced:habit_templates(id, title_fr, title_en, description_fr, description_en, default_cue_fr, default_cue_en),
             plan_items(id, position, status, proof_value, rating, origin, personalized_instructions,
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

// ---------------------------------------------------------------------------
// Library: published catalogue, loaded once per session
// ---------------------------------------------------------------------------
export function useLibrary() {
  return useQuery({
    queryKey: ['catalog', 'library'],
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const [exerciseRows, principleRows, sourceRows, principleSourceRows, exercisePrincipleRows] =
        await Promise.all([
          unwrap(
            supabase
              .from('exercises')
              .select(
                'id, domain, duration_min, difficulty, energy, proof_type, title_fr, title_en, instructions_fr, instructions_en',
              )
              .order('id'),
          ),
          unwrap(
            supabase
              .from('principles')
              .select('id, domain, title_fr, title_en, summary_fr, summary_en')
              .order('id'),
          ),
          unwrap(
            supabase.from('sources').select('id, author, title_fr, title_original').order('id'),
          ),
          unwrap(supabase.from('principle_sources').select('principle_id, source_id, position')),
          unwrap(
            supabase.from('exercise_principles').select('exercise_id, principle_id, position'),
          ),
        ]);
      const exercises = exerciseRows ?? [];
      const principles = principleRows ?? [];
      const sources = sourceRows ?? [];
      const principleSources = principleSourceRows ?? [];
      const exercisePrinciples = exercisePrincipleRows ?? [];
      const principleIds = new Set(principles.map((p) => p.id));
      const sourcesOf = (principleId: string) =>
        principleSources
          .filter((ps) => ps.principle_id === principleId)
          .sort((a, b) => a.position - b.position)
          .map((ps) => ps.source_id);
      const principlesOf = (exerciseId: string) =>
        exercisePrinciples
          .filter((ep) => ep.exercise_id === exerciseId && principleIds.has(ep.principle_id))
          .sort((a, b) => a.position - b.position)
          .map((ep) => ep.principle_id);
      return {
        exercises: exercises.map((e) => {
          const linked = principlesOf(e.id);
          return { ...e, principleIds: linked, sourceIds: [...new Set(linked.flatMap(sourcesOf))] };
        }),
        principles: principles.map((p) => ({
          ...p,
          sourceIds: sourcesOf(p.id),
          exerciseIds: exercisePrinciples
            .filter((ep) => ep.principle_id === p.id)
            .map((ep) => ep.exercise_id),
        })),
        sources,
      };
    },
  });
}

export type Library = NonNullable<ReturnType<typeof useLibrary>['data']>;

export function useFavorites(userId: string) {
  return useQuery({
    queryKey: ['favorites', userId],
    queryFn: () => unwrap(supabase.from('favorites').select('entity_type, entity_id')),
  });
}

// ---------------------------------------------------------------------------
// Progress: raw data (30 days of plans, 62 days of habit logs, 14 days of energy)
// ---------------------------------------------------------------------------
export function usePlansSince(userId: string, from: string) {
  return useQuery({
    queryKey: ['plansSince', userId, from],
    staleTime: 0,
    queryFn: () =>
      unwrap(
        supabase
          .from('daily_plans')
          .select('date, plan_items(status, origin)')
          .gte('date', from)
          .order('date'),
      ),
  });
}

export function useDoneDays(userId: string) {
  return useQuery({
    queryKey: ['doneDays', userId],
    staleTime: 0,
    queryFn: async () => (await unwrap(supabase.rpc('my_done_days'))) ?? [],
  });
}

export function useActiveGoal(userId: string) {
  return useQuery({
    queryKey: ['goal', userId],
    queryFn: () =>
      unwrap(
        supabase
          .from('goals')
          .select('id, title, target_value, unit, current_value, deadline, created_at')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
  });
}

export function useCheckinsSince(userId: string, from: string) {
  return useQuery({
    queryKey: ['checkinsSince', userId, from],
    staleTime: 0,
    queryFn: () =>
      unwrap(
        supabase.from('checkins').select('date, energy, mood').gte('date', from).order('date'),
      ),
  });
}

export const REFLECTIONS_PAGE = 20;

export async function fetchReflections(page: number) {
  return unwrap(
    supabase
      .from('checkins')
      .select('date, reflection, note')
      .or('reflection.not.is.null,note.not.is.null')
      .order('date', { ascending: false })
      .range(page * REFLECTIONS_PAGE, (page + 1) * REFLECTIONS_PAGE - 1),
  );
}

// ---------------------------------------------------------------------------
// Weekly reviews
// ---------------------------------------------------------------------------
export type ReviewProposal = {
  type:
    | 'habit_simplify'
    | 'habit_replace'
    | 'goal_deadline'
    | 'update_goal_progress'
    | 'level_up'
    | 'daily_minutes';
  priority: number;
  params: Record<string, string | number>;
  // Premium: proposal reworded by the AI (types and parameters never change)
  text?: string;
};

export type ReviewStats = {
  weekStart: string;
  weekEnd: string;
  exercisesDone: number;
  exercisesPlanned: number;
  habits: { habitId: string; done: number; expected: number; rate: number | null }[];
  energyAverage: number | null;
  bestDay: string | null;
};

export type Review = {
  id: string;
  week_start: string;
  generated_at: string;
  stats: ReviewStats;
  proposals: ReviewProposal[];
  accepted: Record<string, { accept: boolean; at: string }>;
  // Premium: summary written by the AI
  summary: string | null;
  ai_status: 'pending' | 'enriched' | 'fallback' | null;
};

const REVIEW_COLUMNS =
  'id, week_start, generated_at, stats, proposals, accepted, summary, ai_status';

export function useReviews(userId: string) {
  return useQuery({
    queryKey: ['reviews', userId],
    staleTime: 0,
    // The current review may be enriched by the AI right after its generation
    refetchInterval: (query) =>
      query.state.data?.some(
        (r) =>
          r.ai_status === 'pending' &&
          isAiPending({ ...r, generated_at: r.generated_at }, Date.now()),
      )
        ? AI_POLL_MS
        : false,
    queryFn: async () =>
      ((await unwrap(
        supabase
          .from('weekly_reviews')
          .select(REVIEW_COLUMNS)
          .order('week_start', { ascending: false }),
      )) ?? []) as unknown as Review[],
  });
}

// Generates the review if due (server side) and returns the current one
export async function generateReview(): Promise<Review | null> {
  const { data, error } = await supabase.functions.invoke<{ review: Review | null }>(
    'generate-review',
    {
      body: {},
    },
  );
  if (error) throw error;
  return data?.review ?? null;
}

// Current review: the latest, open for 8 days
export function isReviewOpen(review: Pick<Review, 'generated_at'>, now: Date): boolean {
  return now.getTime() - new Date(review.generated_at).getTime() < 8 * 86_400_000;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export function useAllHabits(userId: string) {
  return useQuery({
    queryKey: ['allHabits', userId],
    staleTime: 0,
    queryFn: () =>
      unwrap(
        supabase
          .from('user_habits')
          .select(
            'id, title, cue, active, simplified, template_id, created_at, template:habit_templates(title_fr, title_en, default_cue_fr, default_cue_en, minimal_version_fr, minimal_version_en, domain)',
          )
          .order('created_at'),
      ),
  });
}

// All the user's data as a JSON string (server side, engine decisions included)
export async function exportMyData(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('export-my-data', { body: {} });
  if (error) throw error;
  return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

// ---------------------------------------------------------------------------
// Premium (prototype switch) and server flags
// ---------------------------------------------------------------------------
export const premiumKey = (userId: string) => ['premium', userId] as const;

// is_premium is the single point of truth (server side)
export function useIsPremium(userId: string) {
  return useQuery({
    queryKey: premiumKey(userId),
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_premium', { p_user_id: userId });
      if (error) throw error;
      return data === true;
    },
  });
}

export function useAppFlags() {
  return useQuery({
    queryKey: ['appFlags'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_app_flags');
      if (error) throw error;
      return (data ?? {}) as { allow_plan_toggle?: boolean };
    },
  });
}

// ---------------------------------------------------------------------------
// Daily guide (lot 8): state on the server, notes
// ---------------------------------------------------------------------------
export const guideKey = (userId: string) => ['guideState', userId] as const;

export function useGuideState(userId: string) {
  return useQuery({
    queryKey: guideKey(userId),
    staleTime: 0,
    queryFn: () =>
      unwrap(
        supabase
          .from('user_guide_state')
          .select('tour_finished_at, tour_skipped, tips_seen, milestones, support_seen')
          .maybeSingle(),
      ),
  });
}

// Latest achieved goal (celebrated once, when recent)
export function useLastAchievedGoal(userId: string) {
  return useQuery({
    queryKey: ['achievedGoal', userId],
    staleTime: 0,
    queryFn: () =>
      unwrap(
        supabase
          .from('goals')
          .select('id, achieved_at')
          .eq('status', 'achieved')
          .order('achieved_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
  });
}

export type NoteEntity = 'principle' | 'exercise';
export const notesKey = (userId: string) => ['notes', userId] as const;

export function useNotes(userId: string) {
  return useQuery({
    queryKey: notesKey(userId),
    staleTime: 0,
    queryFn: async () =>
      (await unwrap(
        supabase
          .from('notes')
          .select('id, entity_type, entity_id, body, updated_at')
          .order('updated_at', { ascending: false }),
      )) ?? [],
  });
}

// One note per principle or exercise: update if it exists, insert otherwise
export async function saveNote(
  existingId: string | null,
  entityType: NoteEntity,
  entityId: string,
  body: string,
) {
  const result = existingId
    ? await supabase.from('notes').update({ body }).eq('id', existingId)
    : await supabase.from('notes').insert({ entity_type: entityType, entity_id: entityId, body });
  if (result.error) throw result.error;
  track('note_saved', { entity: entityType });
}

export async function deleteNote(id: string) {
  const { error } = await supabase.from('notes').delete().eq('id', id);
  if (error) throw error;
}
