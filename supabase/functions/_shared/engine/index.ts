// Plan engine: pure function (profile + history + catalogue -> plan).
// No I/O, no clock, no npm dependency: runs in Deno (Edge Functions) and Vitest.
// Relative imports use explicit `.ts` extensions (required by Deno).

export { buildPlan } from './buildPlan.ts';
export type * from './types.ts';

export const PLAN_MODES = ['normal', 'minimal', 'recovery'] as const;
