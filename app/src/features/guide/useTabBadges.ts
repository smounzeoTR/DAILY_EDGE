// Tab badges from the data already in the query cache: subscribed to the cache itself (no query
// observer), so they never trigger a network call nor change the screens' queries.
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { introducedDismissedKey, isEveningHighlight, localToday } from '@/features/today/day';
import { useUserId } from '@/lib/auth/AuthProvider';
import { isReviewOpen, queryKeys, type PlanData, type Review } from '@/lib/queries';
import { storage } from '@/lib/storage';

import { tabBadges, type TabBadges } from './badges';

type CachedProfile = { timezone: string; notify_evening: string | null } | null;
type CachedHabit = { template_id: string | null };

function useCachedData<T>(queryKey: QueryKey): T | undefined {
  const queryClient = useQueryClient();
  const subscribe = useCallback(
    (onChange: () => void) => queryClient.getQueryCache().subscribe(onChange),
    [queryClient],
  );
  return useSyncExternalStore(subscribe, () => queryClient.getQueryData<T>(queryKey));
}

function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function useTabBadges(): TabBadges {
  const userId = useUserId();
  const now = useMinute();
  const profile = useCachedData<CachedProfile>(queryKeys.profile(userId));
  const timezone = profile?.timezone ?? 'Europe/Paris';
  const today = localToday(timezone, now);
  const plan = useCachedData<PlanData | null>(queryKeys.plan(userId, today));
  const checkin = useCachedData<unknown>(queryKeys.checkin(userId, today));
  const habits = useCachedData<CachedHabit[]>(queryKeys.userHabits(userId));
  const review = useCachedData<Review | null>(['currentReview', userId]);

  const introduced = plan?.introduced ?? null;
  const introducedHabitPending =
    introduced !== null &&
    habits !== undefined &&
    !habits.some((h) => h.template_id === introduced.id) &&
    plan !== null &&
    plan !== undefined &&
    storage.getItemSync(introducedDismissedKey(plan.id)) !== '1';

  return tabBadges({
    evening: isEveningHighlight(now, profile?.notify_evening, timezone),
    checkinDone: Boolean(checkin),
    hasPlan: Boolean(plan?.generated_at),
    introducedHabitPending,
    review: review
      ? {
          open: isReviewOpen(review, now),
          proposals: review.proposals.length,
          answered: Object.keys(review.accepted ?? {}).length,
        }
      : null,
  });
}
