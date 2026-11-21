// Assistant context (data minimization): summary profile, goal, numbers of the last 3 check-ins
// and today's plan. Never the name, the e-mail, the user id, reflections, notes or proofs.
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../database.types.ts';
import {
  RECENT_CHECKINS,
  type CheckinSource,
  type PlanGoalSource,
  type PlanProfileSource,
} from '../llm/planTask.ts';

type Client = SupabaseClient<Database>;
type Profile = Database['public']['Tables']['profiles']['Row'];

export type TodaySource = {
  date: string;
  mode: string;
  programDay: number | null;
  principleTitle: string | null;
  adjustedByUser: boolean;
  items: {
    exercise_id: string;
    title: string;
    duration_min: number;
    status: string;
    origin: string;
    [other: string]: unknown;
  }[];
  habits: { title: string; done: boolean; [other: string]: unknown }[];
  checkinDone: boolean;
  minutesAvailable: number;
} | null;

export type AssistantContextInput = {
  language: 'fr' | 'en';
  profile: PlanProfileSource;
  goal: (PlanGoalSource & { current_value?: number | null }) | null;
  checkins: CheckinSource[];
  today: TodaySource;
};

export function buildAssistantContext(input: AssistantContextInput) {
  const p = input.profile;
  const t = input.today;
  return {
    language: input.language,
    profile: {
      situation: p.situation ?? null,
      level: p.level ?? null,
      persona: p.persona ?? null,
      chronotype: p.chronotype ?? null,
      motivation_style: p.motivation_style ?? null,
      daily_minutes: p.daily_minutes ?? null,
      priority_domains: p.priority_domains ?? [],
      blockers: p.blockers ?? [],
    },
    goal: input.goal
      ? {
          title: input.goal.title,
          why: input.goal.why ?? null,
          target_value: input.goal.target_value ?? null,
          current_value: input.goal.current_value ?? null,
          unit: input.goal.unit ?? null,
          deadline: input.goal.deadline ?? null,
        }
      : null,
    recent_checkins: [...input.checkins]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-RECENT_CHECKINS)
      .map((c) => ({
        energy: c.energy ?? null,
        mood: c.mood ?? null,
        minutes_available: c.minutes_tomorrow ?? null,
      })),
    today: t
      ? {
          date: t.date,
          mode: t.mode,
          program_day: t.programDay,
          principle: t.principleTitle,
          adjusted_by_user: t.adjustedByUser,
          minutes_available: t.minutesAvailable,
          exercises: t.items.map((i) => ({
            exercise_id: i.exercise_id,
            title: i.title,
            duration_min: i.duration_min,
            status: i.status,
            added_by_user: i.origin === 'user',
          })),
          habits: t.habits.map((h) => ({ title: h.title, done: h.done })),
          checkin_done: t.checkinDone,
        }
      : null,
  };
}

export type AssistantContext = ReturnType<typeof buildAssistantContext>;

const pick = (row: { title_fr: string; title_en: string } | null, lang: 'fr' | 'en') =>
  row ? (lang === 'en' ? row.title_en : row.title_fr) : '';

// Today's plan, habits and check-in, as the assistant sees them (also the get_today tool)
export async function loadToday(
  db: Client,
  userId: string,
  date: string,
  language: 'fr' | 'en',
): Promise<TodaySource> {
  const [plan, habits, logs, checkin, minutes] = await Promise.all([
    db
      .from('daily_plans')
      .select(
        'date, mode, program_day, user_adjusted_at, principle:principles(title_fr, title_en), plan_items(exercise_id, status, origin, position, exercise:exercises(title_fr, title_en, duration_min))',
      )
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle(),
    db
      .from('user_habits')
      .select('id, title, template:habit_templates(title_fr, title_en)')
      .eq('user_id', userId)
      .eq('active', true),
    db
      .from('habit_logs')
      .select('user_habit_id')
      .eq('user_id', userId)
      .eq('date', date)
      .eq('done', true),
    // Existence only: never the reflection or the note
    db.from('checkins').select('date').eq('user_id', userId).eq('date', date).maybeSingle(),
    db.rpc('today_available_minutes', { p_user_id: userId, p_date: date }),
  ]);
  for (const r of [plan, habits, logs, checkin, minutes]) if (r.error) throw r.error;
  if (!plan.data) return null;
  const done = new Set((logs.data ?? []).map((l) => l.user_habit_id));
  return {
    date,
    mode: plan.data.mode,
    programDay: plan.data.program_day,
    principleTitle: pick(plan.data.principle, language) || null,
    adjustedByUser: plan.data.user_adjusted_at !== null,
    items: [...plan.data.plan_items]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        exercise_id: i.exercise_id,
        title: pick(i.exercise, language),
        duration_min: i.exercise?.duration_min ?? 0,
        status: i.status,
        origin: i.origin,
      })),
    habits: (habits.data ?? []).map((h) => ({
      title: h.title ?? pick(h.template, language),
      done: done.has(h.id),
    })),
    checkinDone: Boolean(checkin.data),
    minutesAvailable: Number(minutes.data ?? 15),
  };
}

export async function loadAssistantContext(
  db: Client,
  profile: Profile,
  date: string,
): Promise<AssistantContext> {
  const language = profile.locale === 'en' ? 'en' : 'fr';
  const [goals, checkins, today] = await Promise.all([
    db
      .from('goals')
      .select('title, why, target_value, current_value, unit, deadline')
      .eq('user_id', profile.user_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1),
    // Numbers only (never the reflection or the note)
    db
      .from('checkins')
      .select('date, energy, mood, minutes_tomorrow')
      .eq('user_id', profile.user_id)
      .order('date', { ascending: false })
      .limit(RECENT_CHECKINS),
    loadToday(db, profile.user_id, date, language),
  ]);
  if (goals.error) throw goals.error;
  if (checkins.error) throw checkins.error;
  return buildAssistantContext({
    language,
    profile,
    goal: goals.data?.[0] ?? null,
    checkins: checkins.data ?? [],
    today,
  });
}
