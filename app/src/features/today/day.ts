// Pure helpers for the today screen and the evening check-in.

export type ItemStatus = 'todo' | 'done' | 'skipped' | 'too_hard';
export type ProofType = 'checkbox' | 'free_text' | 'numeric';

// Local date (YYYY-MM-DD) of an instant in a time zone
export function localToday(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// Minutes since local midnight in a time zone
export function localMinutes(timeZone: string, now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

// "HH:MM" or "HH:MM:SS" -> minutes; null if missing or invalid
export function timeToMinutes(time: string | null | undefined): number | null {
  const match = time?.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

// Check-in button highlighted from the evening reminder time on
export function isEveningHighlight(
  now: Date,
  notifyEvening: string | null | undefined,
  timeZone: string,
): boolean {
  const evening = timeToMinutes(notifyEvening) ?? timeToMinutes('21:00');
  return evening !== null && localMinutes(timeZone, now) >= evening;
}

// A result can be set or corrected only on the plan's own day, never back to "todo"
export function canEditResult(planDate: string, today: string): boolean {
  return planDate === today;
}

export const RESULT_STATUSES: Exclude<ItemStatus, 'todo'>[] = ['done', 'skipped', 'too_hard'];

// Proof required to mark an exercise as done
export function isProofValid(proofType: ProofType, value: string): boolean {
  const text = value.trim();
  if (proofType === 'free_text') return text.length > 0;
  if (proofType === 'numeric') return /^-?\d+([.,]\d+)?$/.test(text);
  return true;
}

export function proofToSend(proofType: ProofType, value: string): string | null {
  return proofType === 'checkbox' ? null : value.trim() || null;
}

// Local "Later" on the habit introduced by a plan (per device)
export const introducedDismissedKey = (planId: string) => `today.habitLater.${planId}`;
