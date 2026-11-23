// Audience measurement consent, kept in this browser (dailyedge.consent). Three states:
// "pending" (no choice yet: key absent, or explicitly pending), "denied", "granted".
// The opt-out flag PostHog writes itself is never read as a choice of the visitor.
export type Consent = 'pending' | 'denied' | 'granted';

export const CONSENT_KEY = 'dailyedge.consent';
// A choice is asked again after 6 months (CNIL recommendation)
export const CONSENT_MAX_AGE_MS = 182 * 24 * 60 * 60 * 1000;

export function readConsent(now = Date.now()): Consent {
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return 'pending';
    const value = JSON.parse(raw) as { choice?: string; at?: number };
    if (value.choice !== 'denied' && value.choice !== 'granted') return 'pending';
    if (typeof value.at !== 'number' || now - value.at > CONSENT_MAX_AGE_MS) return 'pending';
    return value.choice;
  } catch {
    return 'pending';
  }
}

export function writeConsent(choice: 'denied' | 'granted', now = Date.now()): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice, at: now }));
  } catch {
    // The choice applies to this visit only
  }
}
