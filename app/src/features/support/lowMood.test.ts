import { describe, expect, it } from 'vitest';

import { lowMoodEpisode, supportToShow } from './lowMood';

const T = '2026-11-23';
const days = (moods: (number | null)[], end = '2026-11-22') =>
  moods.map((mood, i) => {
    const d = new Date(`${end}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (moods.length - 1 - i));
    return { date: d.toISOString().slice(0, 10), mood };
  });

describe('low mood episodes', () => {
  it('5 days in a row with mood <= 2 ending yesterday', () => {
    expect(lowMoodEpisode(days([2, 1, 2, 2, 1]), T)).toBe('2026-11-18');
  });
  it('4 days are not enough; a mood of 3 breaks the run', () => {
    expect(lowMoodEpisode(days([2, 2, 2, 2]), T)).toBeNull();
    expect(lowMoodEpisode(days([2, 2, 3, 2, 2]), T)).toBeNull();
  });
  it('a day without check-in breaks the run (same rule as the engine)', () => {
    expect(lowMoodEpisode(days([2, 2, null, 2, 2, 2]), T)).toBeNull();
  });
  it("today's low check-in extends the run", () => {
    expect(lowMoodEpisode(days([2, 2, 2, 2, 2], T), T)).toBe('2026-11-19');
  });
  it('the episode keeps its first day while it goes on (once per episode)', () => {
    expect(lowMoodEpisode(days([1, 2, 2, 2, 2, 2, 2]), T)).toBe('2026-11-16');
  });
  it('shown only with the check-in consent and once per episode', () => {
    const c = days([2, 2, 2, 2, 2]);
    expect(supportToShow(c, T, {}, false)).toBeNull();
    expect(supportToShow(c, T, {}, true)).toBe('2026-11-18');
    expect(supportToShow(c, T, { '2026-11-18': '2026-11-22T08:00:00Z' }, true)).toBeNull();
  });
});
