// Waitlist rank (site § 6): sign-up order among confirmed entries, minus 10 places per
// confirmed referral, floor 1. The database applies the same rule (public.waitlist_rank and
// confirm_waitlist_entry); this module is the reference model, cross-checked by the tests.

export const PLACES_PER_REFERRAL = 10;

export function waitlistRank(position: number, confirmedReferrals: number): number {
  return Math.max(1, position - PLACES_PER_REFERRAL * confirmedReferrals);
}

export interface WaitlistModelEntry {
  id: string;
  createdAt: string;
  status: 'pending' | 'confirmed' | 'unsubscribed';
  referralCode: string;
  referredBy: string | null;
  confirmedReferrals: number;
  confirmedAt: string | null;
  rank: number | null;
}

/** Ranks of every confirmed entry, by sign-up order (created_at, then id). */
export function computeRanks(entries: readonly WaitlistModelEntry[]): Map<string, number> {
  const confirmed = entries
    .filter((e) => e.status === 'confirmed')
    .sort((a, b) =>
      a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1,
    );
  return new Map(confirmed.map((e, i) => [e.id, waitlistRank(i + 1, e.confirmedReferrals)]));
}

/**
 * Confirmation of one entry: status, referrer credit (first confirmation only, never oneself),
 * then every rank recomputed. Returns a new list; pending or unknown entries are untouched.
 */
export function confirmInModel(
  entries: readonly WaitlistModelEntry[],
  id: string,
  now: string,
): WaitlistModelEntry[] {
  const target = entries.find((e) => e.id === id);
  if (!target || target.status !== 'pending') return entries.map((e) => ({ ...e }));
  const firstTime = target.confirmedAt === null;
  const next = entries.map((e) => {
    if (e.id === id)
      return { ...e, status: 'confirmed' as const, confirmedAt: e.confirmedAt ?? now };
    if (firstTime && target.referredBy !== null && e.referralCode === target.referredBy) {
      return { ...e, confirmedReferrals: e.confirmedReferrals + 1 };
    }
    return { ...e };
  });
  const ranks = computeRanks(next);
  return next.map((e) => ({ ...e, rank: ranks.get(e.id) ?? e.rank }));
}
