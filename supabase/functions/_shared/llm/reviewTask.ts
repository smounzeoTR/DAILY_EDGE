// Weekly review task: the rules compute the proposals; the AI only writes the summary
// and rewords each proposal. It can neither add, remove nor change a proposal.
// Pure (no I/O). Numbers and names of habits only: never reflections or notes.
import { z } from 'zod';

import type { LlmRequest } from './types.ts';

export const REVIEW_PROMPT_VERSION = 'review-v1';
export const MAX_SUMMARY_CHARS = 600;
export const MAX_PROPOSAL_TEXT_CHARS = 300;

export type ReviewTaskInput = {
  language: 'fr' | 'en';
  weekStart: string;
  weekEnd: string;
  exercisesDone: number;
  exercisesPlanned: number;
  // null without check-in consent
  energyAverage: number | null;
  bestDay: string | null;
  habits: { title: string; done: number; expected: number; rate: number | null }[];
  goalTitle: string | null;
  // Rule proposals with their parameters and the names they refer to
  proposals: {
    type: string;
    params: Record<string, string | number>;
    names: Record<string, string>;
  }[];
};

export type ReviewPayload = ReturnType<typeof buildReviewPayload>;

export function buildReviewPayload(input: ReviewTaskInput) {
  return {
    task: 'weekly_review' as const,
    language: input.language,
    week: { start: input.weekStart, end: input.weekEnd },
    stats: {
      exercises_done: input.exercisesDone,
      exercises_planned: input.exercisesPlanned,
      energy_average: input.energyAverage,
      best_day: input.bestDay,
      habits: input.habits.map((h) => ({
        title: h.title,
        done: h.done,
        expected: h.expected,
        rate: h.rate,
      })),
    },
    goal_title: input.goalTitle,
    proposals: input.proposals.map((p, index) => ({
      index,
      type: p.type,
      params: p.params,
      names: p.names,
    })),
  };
}

const SYSTEM = `You are the coach of Daily Edge, a daily personal development app.
You receive the numbers of the user's week and the adjustment proposals computed by rules.
- "summary": a warm summary of the week in at most 600 characters, based only on the numbers given. Celebrate what was done; never blame, never compare with others. An interrupted streak is never presented negatively.
- "proposal_texts": exactly one text per proposal, in the same order, each at most 300 characters, rewording the proposal for this user (what it changes and why it helps). Never add, remove or change a proposal or its values.
Proposal types: habit_simplify (make the habit's minimal version the main action), habit_replace (replace a habit by the template named), goal_deadline (move the goal deadline to params.deadline), update_goal_progress (ask the user to enter their current progress), level_up (move to the level params.to), daily_minutes (set the daily time to params.minutes; params.average is the real average).
Write in the language given by "language" (fr = French with "tu", en = English). No medical, financial or legal advice.
Answer with JSON only: {"summary":"...","proposal_texts":["..."]}.`;

export const REVIEW_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'proposal_texts'],
  properties: {
    summary: { type: 'string' },
    proposal_texts: { type: 'array', items: { type: 'string' } },
  },
};

export function buildReviewRequest(payload: ReviewPayload): Omit<LlmRequest, 'signal'> {
  return {
    system: SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
    jsonSchema: REVIEW_JSON_SCHEMA,
    maxTokens: 2000,
  };
}

export const ReviewOutputSchema = z
  .object({
    summary: z.string().trim().min(1).max(MAX_SUMMARY_CHARS),
    proposal_texts: z.array(z.string().trim().min(1).max(MAX_PROPOSAL_TEXT_CHARS)),
  })
  .strict();

export type ReviewOutput = z.infer<typeof ReviewOutputSchema>;

export function checkReviewOutput(output: ReviewOutput, payload: ReviewPayload): string | null {
  return output.proposal_texts.length === payload.proposals.length ? null : 'proposal_count';
}
