import { describe, expect, it } from 'vitest';

import { PLAN_MODES } from './index.ts';

describe('engine scaffold', () => {
  it('exposes the three plan modes', () => {
    expect(PLAN_MODES).toEqual(['normal', 'minimal', 'recovery']);
  });
});
