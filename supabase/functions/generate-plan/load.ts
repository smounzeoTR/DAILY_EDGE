// Loads everything the engine needs for one user and date (server-side client).
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../_shared/database.types.ts';
import { addDays } from '../_shared/engine/dates.ts';
import type { Catalog, EngineInput, ISODate, Language, PastPlan } from '../_shared/engine/index.ts';

type Client = SupabaseClient<Database>;

const HISTORY_DAYS = 60;
const RECENT_DAYS = 7;
const CATALOG_TTL_MS = 5 * 60 * 1000;

export type Profile = Database['public']['Tables']['profiles']['Row'];

function must<T>(result: { data: T | null; error: unknown }, what: string): T {
  if (result.error || result.data === null) {
    throw new Error(`${what}: ${JSON.stringify(result.error)}`);
  }
  return result.data;
}

// Local date of an instant in a time zone (YYYY-MM-DD)
export function localDate(instant: Date, timeZone: string): ISODate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

// The catalogue changes rarely: cached per warm instance
let catalogCache: { at: number; catalog: Catalog } | null = null;

export async function loadCatalog(db: Client): Promise<Catalog> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.catalog;
  const [exercises, principles, prerequisites, programs, steps] = await Promise.all([
    db
      .from('exercises')
      .select(
        'id, status, domain, duration_min, difficulty, energy, personas, blockers, repeat_after_days',
      ),
    db.from('exercise_principles').select('exercise_id, principle_id, position').order('position'),
    db.from('exercise_prerequisites').select('exercise_id, prerequisite_id'),
    db.from('programs').select('id, duration_days, status'),
    db
      .from('program_steps')
      .select(
        'program_id, day_index, principle_id, main_exercise_id, minimal_exercise_id, introduced_habit_id, theme_fr, theme_en',
      ),
  ]);
  const principleRows = must(principles, 'exercise_principles');
  const prerequisiteRows = must(prerequisites, 'exercise_prerequisites');
  const catalog: Catalog = {
    exercises: must(exercises, 'exercises').map((e) => ({
      id: e.id,
      status: e.status,
      domain: e.domain,
      principleIds: principleRows.filter((p) => p.exercise_id === e.id).map((p) => p.principle_id),
      durationMin: e.duration_min,
      difficulty: e.difficulty,
      energy: e.energy,
      personas: e.personas,
      blockers: e.blockers,
      prerequisiteIds: prerequisiteRows
        .filter((p) => p.exercise_id === e.id)
        .map((p) => p.prerequisite_id),
      repeatAfterDays: e.repeat_after_days,
    })),
    programs: must(programs, 'programs')
      .filter((p) => p.status === 'published')
      .map((p) => ({ id: p.id, durationDays: p.duration_days })),
    programSteps: must(steps, 'program_steps').map((s) => ({
      programId: s.program_id,
      dayIndex: s.day_index,
      principleId: s.principle_id,
      mainExerciseId: s.main_exercise_id,
      minimalExerciseId: s.minimal_exercise_id,
      introducedHabitId: s.introduced_habit_id,
      themeFr: s.theme_fr,
      themeEn: s.theme_en,
    })),
  };
  catalogCache = { at: Date.now(), catalog };
  return catalog;
}

export async function loadEngineInput(
  db: Client,
  profile: Profile,
  date: ISODate,
): Promise<EngineInput> {
  const userId = profile.user_id;
  const from60 = addDays(date, -HISTORY_DAYS);
  const from7 = addDays(date, -RECENT_DAYS);
  const [catalog, checkins, plans, history, habitLogs, habits, goals] = await Promise.all([
    loadCatalog(db),
    db
      .from('checkins')
      .select('date, energy, mood, minutes_tomorrow')
      .eq('user_id', userId)
      .gte('date', from7)
      .lt('date', date),
    db
      .from('daily_plans')
      .select('date, mode, program_day, plan_items(exercise_id, status, rating, position)')
      .eq('user_id', userId)
      .gte('date', from60)
      .lt('date', date)
      .order('date'),
    db.rpc('engine_exercise_history', { p_user_id: userId }),
    db
      .from('habit_logs')
      .select('date')
      .eq('user_id', userId)
      .eq('done', true)
      .gte('date', from7)
      .lt('date', date),
    db.from('user_habits').select('template_id').eq('user_id', userId),
    db
      .from('goals')
      .select('target_value, current_value, created_at, deadline')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const timezone = profile.timezone;
  const goal = must(goals, 'goals')[0];
  const pastPlans: PastPlan[] = must(plans, 'daily_plans').map((p) => ({
    date: p.date,
    mode: p.mode,
    programDay: p.program_day,
    items: [...p.plan_items]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ exerciseId: i.exercise_id, status: i.status, rating: i.rating })),
  }));

  return {
    today: date,
    language: (profile.locale === 'en' ? 'en' : 'fr') satisfies Language,
    profile: {
      level: profile.level,
      dailyMinutes: profile.daily_minutes,
      persona: profile.persona ?? 'entrepreneur',
      programId: profile.program_id,
      programDay: profile.program_day,
      priorityDomains: profile.priority_domains,
      blockers: profile.blockers,
      onboardedOn: localDate(new Date(profile.onboarded_at ?? Date.now()), timezone),
    },
    checkins: must(checkins, 'checkins').map((c) => ({
      date: c.date,
      energy: c.energy,
      mood: c.mood,
      minutesTomorrow: c.minutes_tomorrow,
    })),
    plans: pastPlans,
    exerciseHistory: must(history, 'engine_exercise_history').map((h) => ({
      exerciseId: h.exercise_id,
      lastDoneOn: h.last_done_on,
      skips: h.skips,
      lastRating1On: h.last_rating1_on,
    })),
    habitLogDates: [...new Set(must(habitLogs, 'habit_logs').map((l) => l.date))],
    ownedHabitTemplateIds: must(habits, 'user_habits')
      .map((h) => h.template_id)
      .filter((id): id is string => id !== null),
    goal: goal
      ? {
          targetValue: goal.target_value,
          currentValue: goal.current_value,
          createdOn: localDate(new Date(goal.created_at), timezone),
          deadline: goal.deadline,
        }
      : null,
    catalog,
  };
}
