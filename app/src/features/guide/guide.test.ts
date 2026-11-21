import { describe, expect, it } from 'vitest';

import { tabBadges } from './badges';
import {
  accountDay,
  milestonesToRecordSilently,
  milestoneToCelebrate,
  overlayToShow,
  tipDue,
  tourDue,
  type GuideInput,
} from './guide';
import { dayJourney, type JourneyInput } from './journey';

const T = '2026-11-25'; // Wednesday

const guide = (overrides: Partial<GuideInput> = {}): GuideInput => ({
  today: T,
  onboardedOn: T,
  state: null,
  streakCurrent: 0,
  programDay: 1,
  programDuration: 28,
  goalAchievedOn: null,
  ...overrides,
});

describe('day journey', () => {
  const base = (overrides: Partial<JourneyInput> = {}): JourneyInput => ({
    today: T,
    principleReadAt: null,
    items: [{ status: 'todo' }],
    habits: [{ id: 'h1', frequency: 'daily', startedOn: '2026-11-01' }],
    logs: [],
    checkinDone: false,
    ...overrides,
  });

  it('starts with the principle', () => {
    const j = dayJourney(base());
    expect(j.steps.map((s) => s.done)).toEqual([false, false, false, false]);
    expect(j.next).toBe('principle');
  });

  it('fills the 4 steps through the day', () => {
    const j = dayJourney(
      base({
        principleReadAt: '2026-11-25T07:00:00Z',
        items: [{ status: 'done' }],
        logs: [{ user_habit_id: 'h1', date: T, done: true, minimal: true }],
        checkinDone: true,
      }),
    );
    expect(j.steps.every((s) => s.done)).toBe(true);
    expect(j.next).toBeNull();
  });

  it('exercise: an addition or a minimal version counts', () => {
    expect(
      dayJourney(base({ items: [{ status: 'skipped' }, { status: 'done' }] })).steps[1]?.done,
    ).toBe(true);
    expect(dayJourney(base({ items: [{ status: 'too_hard' }] })).steps[1]?.done).toBe(false);
  });

  it('habits: every expected habit, done in the period counts, occasional excluded', () => {
    const habits = [
      { id: 'd', frequency: 'daily' as const, startedOn: '2026-11-01' },
      { id: 'w', frequency: 'weekly' as const, startedOn: '2026-11-01' },
      { id: 'o', frequency: 'occasional' as const, startedOn: '2026-11-01' },
    ];
    const logs = [
      { user_habit_id: 'd', date: T, done: true, minimal: false },
      // Weekly habit done on Monday of the same week
      { user_habit_id: 'w', date: '2026-11-23', done: true, minimal: false },
    ];
    const j = dayJourney(base({ habits, logs, principleReadAt: 'x' }));
    expect(j.steps[2]?.done).toBe(true);
    expect(j.next).toBe('exercise');
    expect(dayJourney(base({ habits, logs: logs.slice(1) })).steps[2]?.done).toBe(false);
  });

  it('habits: filled when no habit is expected that day', () => {
    const saturday = '2026-11-28';
    const j = dayJourney(
      base({
        today: saturday,
        habits: [
          { id: 'wd', frequency: 'weekdays', startedOn: '2026-11-01' },
          { id: 'o', frequency: 'occasional', startedOn: '2026-11-01' },
        ],
      }),
    );
    expect(j.steps[2]?.done).toBe(true);
    expect(j.noHabitDue).toBe(true);
  });
});

describe('tab badges', () => {
  const input = {
    evening: false,
    checkinDone: false,
    hasPlan: true,
    introducedHabitPending: false,
    review: null,
  };
  it('nothing by default', () => {
    expect(tabBadges(input)).toEqual({ today: false, progress: false });
  });
  it('Today: check-in waiting after the evening reminder', () => {
    expect(tabBadges({ ...input, evening: true }).today).toBe(true);
    expect(tabBadges({ ...input, evening: true, checkinDone: true }).today).toBe(false);
    expect(tabBadges({ ...input, evening: true, hasPlan: false }).today).toBe(false);
  });
  it('Today: introduced habit proposed and not dismissed', () => {
    expect(tabBadges({ ...input, introducedHabitPending: true }).today).toBe(true);
  });
  it('Progress: open review with unanswered proposals', () => {
    expect(
      tabBadges({ ...input, review: { open: true, proposals: 2, answered: 1 } }).progress,
    ).toBe(true);
    expect(
      tabBadges({ ...input, review: { open: true, proposals: 2, answered: 2 } }).progress,
    ).toBe(false);
    expect(
      tabBadges({ ...input, review: { open: false, proposals: 2, answered: 0 } }).progress,
    ).toBe(false);
    expect(
      tabBadges({ ...input, review: { open: true, proposals: 0, answered: 0 } }).progress,
    ).toBe(false);
  });
});

describe('guided tour', () => {
  it('shown on day 1 until finished', () => {
    expect(tourDue(guide())).toBe(true);
    expect(tourDue(guide({ state: { tourFinishedAt: 'x', tipsSeen: {}, milestones: {} } }))).toBe(
      false,
    );
  });
  it('accounts onboarded more than 7 days ago never see it', () => {
    expect(accountDay('2026-11-18', T)).toBe(8);
    expect(tourDue(guide({ onboardedOn: '2026-11-18' }))).toBe(true);
    expect(tourDue(guide({ onboardedOn: '2026-11-17' }))).toBe(false);
  });
});

describe('tips of the first week', () => {
  const finished = { tourFinishedAt: 'x', tipsSeen: {}, milestones: {} };
  it('one tip per day from day 2 to day 7', () => {
    expect(tipDue(guide({ state: finished }))).toBeNull();
    expect(tipDue(guide({ onboardedOn: '2026-11-24', state: finished }))).toBe('minimal_version');
    expect(tipDue(guide({ onboardedOn: '2026-11-19', state: finished }))).toBe('minimal_version');
    expect(tipDue(guide({ onboardedOn: '2026-11-18', state: finished }))).toBeNull();
  });
  it('missed days are caught up in order, at most one a day', () => {
    const state = { ...finished, tipsSeen: { minimal_version: '2026-11-22' } };
    expect(tipDue(guide({ onboardedOn: '2026-11-21', state }))).toBe('no_time');
    const seenToday = { ...finished, tipsSeen: { minimal_version: T } };
    expect(tipDue(guide({ onboardedOn: '2026-11-21', state: seenToday }))).toBeNull();
  });
  it('a seen tip never comes back', () => {
    const all = Object.fromEntries(
      ['minimal_version', 'no_time', 'library', 'favorites', 'goal_progress', 'weekly_review'].map(
        (t) => [t, '2026-11-20'],
      ),
    );
    expect(
      tipDue(guide({ onboardedOn: '2026-11-19', state: { ...finished, tipsSeen: all } })),
    ).toBeNull();
  });
});

describe('milestones', () => {
  it('7-day streak, week 1, program completed, goal achieved', () => {
    expect(milestoneToCelebrate(guide({ streakCurrent: 7 }))).toBe('streak_7');
    expect(milestoneToCelebrate(guide({ programDay: 8 }))).toBe('week_1');
    expect(milestoneToCelebrate(guide({ programDay: 29 }))).toBe('program_completed');
    expect(milestoneToCelebrate(guide({ goalAchievedOn: T }))).toBe('goal_achieved');
  });
  it('celebrated once, never replayed', () => {
    const state = { tourFinishedAt: 'x', tipsSeen: {}, milestones: { streak_7: '2026-11-20' } };
    expect(milestoneToCelebrate(guide({ streakCurrent: 9, state }))).toBeNull();
  });
  it('old milestones are recorded silently, never shown', () => {
    const old = guide({ streakCurrent: 40, programDay: 60, goalAchievedOn: '2026-10-01' });
    expect(milestoneToCelebrate(old)).toBeNull();
    expect(milestonesToRecordSilently(old).sort()).toEqual(
      ['goal_achieved', 'program_completed', 'streak_7', 'week_1'].sort(),
    );
  });
  it('several due: one at a time, by priority', () => {
    expect(milestoneToCelebrate(guide({ streakCurrent: 8, programDay: 9 }))).toBe('week_1');
  });
});

describe('one overlay per opening', () => {
  it('tour first when the tour, a celebration and a tip are all due the same day', () => {
    // Day 2: tour not finished, tip due, and a goal achieved today
    const all = guide({ onboardedOn: '2026-11-24', goalAchievedOn: T });
    expect(tipDue({ ...all, state: { tourFinishedAt: 'x', tipsSeen: {}, milestones: {} } })).toBe(
      'minimal_version',
    );
    expect(milestoneToCelebrate(all)).toBe('goal_achieved');
    expect(overlayToShow(all)).toEqual({ kind: 'tour' });
  });
  it('then the celebration, then the tip, at the next openings', () => {
    const afterTour = guide({
      onboardedOn: '2026-11-24',
      goalAchievedOn: T,
      state: { tourFinishedAt: 'x', tipsSeen: {}, milestones: {} },
    });
    expect(overlayToShow(afterTour)).toEqual({ kind: 'celebration', milestone: 'goal_achieved' });
    const afterCelebration = {
      ...afterTour,
      state: { tourFinishedAt: 'x', tipsSeen: {}, milestones: { goal_achieved: T } },
    };
    expect(overlayToShow(afterCelebration)).toEqual({ kind: 'tip', tip: 'minimal_version' });
    const afterTip = {
      ...afterCelebration,
      state: { ...afterCelebration.state, tipsSeen: { minimal_version: T } },
    };
    expect(overlayToShow(afterTip)).toBeNull();
  });
});
