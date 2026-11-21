// Tab badges (pure), computed from data already loaded (no dedicated network call).
// Today: check-in waiting after the evening reminder time, or an introduced habit proposed and
// not dismissed (it is shown on Today). Progress: current review with unanswered proposals.
export type TabBadgesInput = {
  // After the evening reminder time (isEveningHighlight)
  evening: boolean;
  checkinDone: boolean;
  // A plan exists for today (nothing to check in otherwise)
  hasPlan: boolean;
  introducedHabitPending: boolean;
  review: { open: boolean; proposals: number; answered: number } | null;
};

export type TabBadges = { today: boolean; progress: boolean };

export function tabBadges(input: TabBadgesInput): TabBadges {
  const checkinWaiting = input.hasPlan && input.evening && !input.checkinDone;
  const review = input.review;
  return {
    today: checkinWaiting || input.introducedHabitPending,
    progress: review !== null && review.open && review.answered < review.proposals,
  };
}
