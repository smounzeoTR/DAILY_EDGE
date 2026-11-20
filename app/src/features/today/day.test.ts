import { describe, expect, it } from 'vitest';

import {
  canEditResult,
  isEveningHighlight,
  isProofValid,
  localMinutes,
  localToday,
  proofToSend,
  timeToMinutes,
} from './day';

describe('local dates and times', () => {
  it('uses the profile time zone, not the device', () => {
    const instant = new Date('2026-12-15T23:30:00Z');
    expect(localToday('Europe/Paris', instant)).toBe('2026-12-16');
    expect(localToday('America/New_York', instant)).toBe('2026-12-15');
    expect(localMinutes('Europe/Paris', instant)).toBe(30);
    expect(localMinutes('America/New_York', instant)).toBe(18 * 60 + 30);
  });

  it('parses reminder times', () => {
    expect(timeToMinutes('21:00:00')).toBe(1260);
    expect(timeToMinutes('07:30')).toBe(450);
    expect(timeToMinutes(null)).toBeNull();
  });
});

describe('evening highlight', () => {
  const paris = (hhmm: string) => new Date(`2026-12-15T${hhmm}:00+01:00`);

  it('starts at the evening reminder time', () => {
    expect(isEveningHighlight(paris('20:59'), '21:00:00', 'Europe/Paris')).toBe(false);
    expect(isEveningHighlight(paris('21:00'), '21:00:00', 'Europe/Paris')).toBe(true);
    expect(isEveningHighlight(paris('18:30'), '18:00', 'Europe/Paris')).toBe(true);
  });

  it('defaults to 21:00 without a reminder time', () => {
    expect(isEveningHighlight(paris('21:05'), null, 'Europe/Paris')).toBe(true);
  });
});

describe('results', () => {
  it('can be edited on the plan day only', () => {
    expect(canEditResult('2026-12-15', '2026-12-15')).toBe(true);
    expect(canEditResult('2026-12-14', '2026-12-15')).toBe(false);
  });

  it('validates the proof by type', () => {
    expect(isProofValid('free_text', '  ')).toBe(false);
    expect(isProofValid('free_text', 'Un appel')).toBe(true);
    expect(isProofValid('numeric', '12,5')).toBe(true);
    expect(isProofValid('numeric', 'douze')).toBe(false);
    expect(isProofValid('checkbox', '')).toBe(true);
    expect(proofToSend('checkbox', 'x')).toBeNull();
    expect(proofToSend('free_text', '  ok ')).toBe('ok');
  });
});
