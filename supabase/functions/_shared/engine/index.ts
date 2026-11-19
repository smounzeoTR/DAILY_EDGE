// Plan engine: pure function (profile + history + catalog -> plan), implemented in lot 3.
// Must stay free of I/O and runtime-specific APIs so it runs in both Deno and Vitest.
// Use explicit `.ts` extensions in relative imports (required by Deno).

export type PlanMode = 'normal' | 'minimal' | 'reprise';

export const PLAN_MODES: readonly PlanMode[] = ['normal', 'minimal', 'reprise'];
