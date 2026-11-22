// Low mood for 5 days in a row (same definition as the engine: check-ins with mood <= 2 on 5
// consecutive days). An episode is a run of such days, identified by its first day; the support
// card is shown once per episode (pure).
import { addDays } from '@shared/habits/schedule.ts';

export const LOW_MOOD_MAX = 2;
export const LOW_MOOD_DAYS = 5;

export function lowMoodEpisode(
  checkins: { date: string; mood: number | null }[],
  today: string,
): string | null {
  const low = new Set(
    checkins.filter((c) => c.mood !== null && c.mood <= LOW_MOOD_MAX).map((c) => c.date),
  );
  // The run ends today when today's check-in is already low, else yesterday
  let day = low.has(today) ? today : addDays(today, -1);
  let start: string | null = null;
  let length = 0;
  while (low.has(day)) {
    start = day;
    length += 1;
    day = addDays(day, -1);
  }
  return length >= LOW_MOOD_DAYS ? start : null;
}

export function supportToShow(
  checkins: { date: string; mood: number | null }[],
  today: string,
  seen: Record<string, unknown> | null | undefined,
  consentCheckin: boolean,
): string | null {
  if (!consentCheckin) return null;
  const episode = lowMoodEpisode(checkins, today);
  return episode && !seen?.[episode] ? episode : null;
}
