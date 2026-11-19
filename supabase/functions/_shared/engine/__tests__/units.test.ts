import { describe, expect, it } from 'vitest';

import { addDays, diffDays, previousDays, weekOfDay } from '../dates.ts';
import { acceptedEnergy, computeSignals, isGoalBehind, maxDifficulty } from '../signals.ts';
import type { WhyKey } from '../types.ts';
import { chooseWhyKey, renderWhy, WHY_TEMPLATES } from '../why.ts';
import { checkin, day, makeInput, plan } from './fixtures.ts';

describe('dates', () => {
  it('adds and diffs days across months and leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2);
    expect(previousDays('2026-12-10', 3)).toEqual(['2026-12-09', '2026-12-08', '2026-12-07']);
    expect([1, 7, 8, 28].map(weekOfDay)).toEqual([1, 1, 2, 4]);
  });
});

describe('signals', () => {
  it('maps energy to accepted levels and level to max difficulty', () => {
    expect(acceptedEnergy(1)).toEqual(['low']);
    expect(acceptedEnergy(2)).toEqual(['low']);
    expect(acceptedEnergy(3)).toEqual(['low', 'medium']);
    expect(acceptedEnergy(5)).toEqual(['low', 'medium', 'high']);
    expect(maxDifficulty('beginner')).toBe(2);
    expect(maxDifficulty('intermediate')).toBe(3);
    expect(maxDifficulty('advanced')).toBe(4);
  });

  it('uses the check-in of the day before only', () => {
    const s = computeSignals(
      makeInput({ checkins: [checkin(day(-2), { minutesTomorrow: 30, energy: 1 })] }),
    );
    expect(s).toMatchObject({ hasCheckin: false, availableMinutes: 15, energy: 3 });
    const y = computeSignals(
      makeInput({ checkins: [checkin(day(-1), { minutesTomorrow: 30, energy: null })] }),
    );
    expect(y).toMatchObject({ hasCheckin: true, availableMinutes: 30, energy: 3 });
  });

  it('caps "45 min and more" at 45', () => {
    expect(
      computeSignals(makeInput({ profile: { dailyMinutes: 45 } as never })).availableMinutes,
    ).toBe(45);
  });

  it('high completion needs 7 days with a plan', () => {
    const plans = [1, 2, 3, 4, 5, 6].map((d) => plan(day(-d), 'E01', 'done'));
    expect(computeSignals(makeInput({ plans })).highCompletion7d).toBe(false);
    expect(
      computeSignals(makeInput({ plans: [...plans, plan(day(-7), 'E01', 'done')] }))
        .highCompletion7d,
    ).toBe(true);
  });

  it('goal behind: no deadline or no target -> false', () => {
    const goal = { targetValue: null, currentValue: 0, createdOn: day(-10), deadline: day(10) };
    expect(isGoalBehind(makeInput({ goal }))).toBe(false);
    expect(isGoalBehind(makeInput({ goal: { ...goal, targetValue: 10, deadline: null } }))).toBe(
      false,
    );
  });
});

describe('why templates', () => {
  const params = { week: 2, theme: 'Priorités et focus', domain: 'clarté & objectifs' };

  it('every key renders in both languages', () => {
    for (const key of Object.keys(WHY_TEMPLATES) as WhyKey[]) {
      for (const language of ['fr', 'en'] as const) {
        const text = renderWhy(key, language, params);
        expect(text).not.toMatch(/\{\{|\}\}/);
        expect(text.length).toBeGreaterThan(10);
      }
    }
    expect(renderWhy('program_week', 'fr', params)).toBe(
      'Semaine 2 de ton programme : priorités et focus.',
    );
  });

  it('fails loudly on a missing parameter', () => {
    expect(() => renderWhy('program_week', 'fr', {})).toThrow('missing why param');
  });

  it('picks the highest priority rule', () => {
    expect(
      chooseWhyKey(['program_step', 'minimal_low_energy', 'recovery_inactive_3d'], false),
    ).toBe('recovery');
    expect(chooseWhyKey(['program_step', 'minimal_low_time'], false)).toBe('low_time');
    expect(chooseWhyKey(['catalog_mode'], true)).toBe('catalog_domain');
    expect(chooseWhyKey(['catalog_mode'], false)).toBe('catalog_default');
  });
});
