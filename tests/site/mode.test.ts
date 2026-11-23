import { describe, expect, it } from 'vitest';

import { DEFAULT_LAUNCH_AT, resolveSiteMode } from '../../site/src/mode.ts';

describe('site mode', () => {
  it('launch from 4 January 2027 at midnight, Paris time (23:00 UTC the day before)', () => {
    expect(DEFAULT_LAUNCH_AT).toBe('2027-01-04T00:00:00+01:00');
    expect(resolveSiteMode({ now: new Date('2027-01-03T22:59:59Z') })).toBe('waitlist');
    expect(resolveSiteMode({ now: new Date('2027-01-03T23:00:00Z') })).toBe('launch');
    expect(resolveSiteMode({ now: new Date('2027-03-01T10:00:00Z') })).toBe('launch');
  });

  it('the override wins over the date, both ways', () => {
    const after = new Date('2027-02-01T00:00:00Z');
    const before = new Date('2026-12-01T00:00:00Z');
    expect(resolveSiteMode({ override: 'waitlist', now: after })).toBe('waitlist');
    expect(resolveSiteMode({ override: 'launch', now: before })).toBe('launch');
    expect(resolveSiteMode({ override: '', now: before })).toBe('waitlist');
  });

  it('a configurable launch date (recette rehearsal)', () => {
    const launchAt = '2026-12-10T14:00:00+01:00';
    expect(resolveSiteMode({ launchAt, now: new Date('2026-12-10T12:59:00Z') })).toBe('waitlist');
    expect(resolveSiteMode({ launchAt, now: new Date('2026-12-10T13:00:00Z') })).toBe('launch');
  });

  it('refuses an invalid date rather than guessing', () => {
    expect(() => resolveSiteMode({ launchAt: 'demain' })).toThrow('invalid SITE_LAUNCH_AT');
  });
});
