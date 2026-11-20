// Weekly review generation (shared by generate-review, the hourly batch and the demo seed).
// Loads the week, builds the review with the pure function, saves it (idempotent).
// Type-only imports from supabase-js: runs in Deno and in Node.
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../database.types.ts';
import { addDays } from '../habits/schedule.ts';
import { buildWeeklyReview, mondayOf, type ReviewInput } from './buildWeeklyReview.ts';

type Client = SupabaseClient<Database>;
type Profile = Database['public']['Tables']['profiles']['Row'];

export const REVIEW_HOUR = 18;
export const REVIEW_OPEN_DAYS = 8;

// Local date, ISO weekday (1 = Monday) and hour of an instant in a time zone
export function localClock(
  instant: Date,
  timeZone: string,
): { date: string; isoDay: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return { date, isoDay: days.indexOf(get('weekday')) + 1, hour: Number(get('hour')) };
}

// Week to review now: the current one from Sunday 18:00, otherwise the previous one
export function reviewWeekStart(clock: { date: string; isoDay: number; hour: number }): string {
  const monday = mondayOf(clock.date);
  return clock.isoDay === 7 && clock.hour >= REVIEW_HOUR ? monday : addDays(monday, -7);
}

function must<T>(result: { data: T | null; error: unknown }, what: string): T {
  if (result.error || result.data === null)
    throw new Error(`${what}: ${JSON.stringify(result.error)}`);
  return result.data;
}

export async function loadReviewInput(
  db: Client,
  profile: Profile,
  weekStart: string,
): Promise<ReviewInput> {
  const userId = profile.user_id;
  const weekEnd = addDays(weekStart, 6);
  const tz = profile.timezone;
  const localOf = (iso: string) => localClock(new Date(iso), tz).date;
  const [plans, habits, logs, checkins, goals, templates] = await Promise.all([
    db
      .from('daily_plans')
      .select('date, mode, plan_items(status, origin, exercise:exercises(duration_min))')
      .eq('user_id', userId)
      .gte('date', addDays(weekStart, -7))
      .lte('date', weekEnd),
    db
      .from('user_habits')
      .select(
        'id, template_id, frequency, created_at, simplified, active, template:habit_templates(domain)',
      )
      .eq('user_id', userId),
    db
      .from('habit_logs')
      .select('user_habit_id, date, done, minimal')
      .eq('user_id', userId)
      .gte('date', addDays(weekEnd, -45))
      .lte('date', weekEnd),
    db
      .from('checkins')
      .select('date, energy')
      .eq('user_id', userId)
      .gte('date', weekStart)
      .lte('date', weekEnd),
    db
      .from('goals')
      .select('id, target_value, current_value, current_value_updated_at, created_at, deadline')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1),
    db.from('habit_templates').select('id, domain, personas').eq('status', 'published'),
  ]);
  const habitRows = must(habits, 'user_habits');
  const goal = must(goals, 'goals')[0];
  return {
    weekStart,
    consentCheckin: profile.consent_checkin,
    level: profile.level,
    dailyMinutes: profile.daily_minutes,
    persona: profile.persona,
    plans: must(plans, 'daily_plans').map((p) => ({
      date: p.date,
      mode: p.mode,
      items: p.plan_items.map((i) => ({
        status: i.status,
        origin: i.origin,
        durationMin: i.exercise?.duration_min ?? 0,
      })),
    })),
    habits: habitRows
      .filter((h) => h.active)
      .map((h) => ({
        id: h.id,
        templateId: h.template_id,
        frequency: h.frequency,
        startedOn: localOf(h.created_at),
        simplified: h.simplified,
        domain: h.template?.domain ?? null,
      })),
    habitLogs: must(logs, 'habit_logs').map((l) => ({
      habitId: l.user_habit_id,
      date: l.date,
      done: l.done,
      minimal: l.minimal,
    })),
    checkins: must(checkins, 'checkins').map((c) => ({ date: c.date, energy: c.energy })),
    goal: goal
      ? {
          id: goal.id,
          targetValue: goal.target_value,
          currentValue: goal.current_value,
          currentValueUpdatedOn: goal.current_value_updated_at
            ? localOf(goal.current_value_updated_at)
            : null,
          createdOn: localOf(goal.created_at),
          deadline: goal.deadline,
        }
      : null,
    templates: must(templates, 'habit_templates'),
    ownedTemplateIds: habitRows.map((h) => h.template_id).filter((id): id is string => id !== null),
  };
}

export async function generateReviewForUser(
  db: Client,
  profile: Profile,
  weekStart: string,
): Promise<{ status: 'created' | 'unchanged' | 'skipped'; reviewId: string | null }> {
  // Nothing to review before the user's first week
  if (!profile.onboarded_at) return { status: 'skipped', reviewId: null };
  const onboardedOn = localClock(new Date(profile.onboarded_at), profile.timezone).date;
  if (onboardedOn > addDays(weekStart, 6)) return { status: 'skipped', reviewId: null };

  const review = buildWeeklyReview(await loadReviewInput(db, profile, weekStart));
  const { data, error } = await db.rpc('save_weekly_review', {
    p_user_id: profile.user_id,
    p_week_start: weekStart,
    p_stats: review.stats,
    p_proposals: review.proposals,
  });
  if (error) throw error;
  const saved = data as { review_id: string; status: 'created' | 'unchanged' };
  return { status: saved.status, reviewId: saved.review_id };
}
