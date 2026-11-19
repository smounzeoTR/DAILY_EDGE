// Pure draft (de)serialization: ignores drafts from another version or with bad data.
import { emptyAnswers, STEPS, type Answers } from './types';

export const DRAFT_VERSION = 1;

export type Draft = { version: typeof DRAFT_VERSION; stepIndex: number; answers: Answers };

export function makeDraft(stepIndex: number, answers: Answers): Draft {
  return { version: DRAFT_VERSION, stepIndex, answers };
}

export function parseDraft(value: unknown): Draft | null {
  if (typeof value !== 'object' || value === null) return null;
  const draft = value as Partial<Draft>;
  if (draft.version !== DRAFT_VERSION) return null;
  if (typeof draft.stepIndex !== 'number' || typeof draft.answers !== 'object' || !draft.answers) {
    return null;
  }
  const stepIndex = Math.min(Math.max(0, Math.trunc(draft.stepIndex)), STEPS.length - 1);
  // Fill missing fields with defaults (forward compatible)
  return { version: DRAFT_VERSION, stepIndex, answers: { ...emptyAnswers, ...draft.answers } };
}
