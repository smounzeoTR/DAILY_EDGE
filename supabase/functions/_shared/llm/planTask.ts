// Daily plan enrichment task: minimized payload, prompt, output schema and checks.
// Pure (no I/O). Data minimization: only whitelisted fields are copied, never the name,
// the e-mail, the user id, reflections, notes or proofs.
import { z } from 'zod';

import type { LlmRequest } from './types.ts';

export const PLAN_PROMPT_VERSION = 'plan-v1';
export const MAX_INSTRUCTIONS_CHARS = 400;
export const MAX_WHY_SENTENCES = 2;
export const MAX_WHY_CHARS = 300;
export const MAX_AI_ITEMS = 3;
export const MAX_CANDIDATES = 10;
export const RECENT_CHECKINS = 3;

type Language = 'fr' | 'en';

// Source rows (wider than what is sent: the builder picks the allowed fields)
export type PlanProfileSource = {
  locale?: string | null;
  situation?: string | null;
  level?: string | null;
  persona?: string | null;
  chronotype?: string | null;
  motivation_style?: string | null;
  daily_minutes?: number | null;
  priority_domains?: string[] | null;
  blockers?: string[] | null;
  [other: string]: unknown;
};
export type PlanGoalSource = {
  title: string;
  why?: string | null;
  target_value?: number | null;
  unit?: string | null;
  deadline?: string | null;
  [other: string]: unknown;
};
export type CheckinSource = {
  date: string;
  energy?: number | null;
  mood?: number | null;
  minutes_tomorrow?: number | null;
  [other: string]: unknown;
};
export type ExerciseSource = {
  id: string;
  title_fr: string;
  title_en: string;
  instructions_fr: string;
  instructions_en: string;
  duration_min: number;
  energy?: string | null;
  difficulty?: number | null;
  domain?: string | null;
  [other: string]: unknown;
};

export type PlanTaskInput = {
  language: Language;
  // program: the AI keeps the engine exercises; catalog: it chooses among the candidates
  mode: 'program' | 'catalog';
  planMode: 'normal' | 'minimal' | 'recovery';
  programDay: number | null;
  budgetMinutes: number;
  rulesWhy: string;
  profile: PlanProfileSource;
  goal: PlanGoalSource | null;
  checkins: CheckinSource[];
  // Ordered best first; program mode: the engine items only
  candidates: ExerciseSource[];
  // Program mode: exercises the AI must keep
  lockedIds: string[];
};

export type PlanPayload = ReturnType<typeof buildPlanPayload>;

export function buildPlanPayload(input: PlanTaskInput) {
  const lang = input.language;
  const p = input.profile;
  return {
    task: 'daily_plan' as const,
    language: lang,
    mode: input.mode,
    plan_mode: input.planMode,
    program_day: input.programDay,
    budget_minutes: input.budgetMinutes,
    rules_why_today: input.rulesWhy,
    profile: {
      situation: p.situation ?? null,
      level: p.level ?? null,
      persona: p.persona ?? null,
      chronotype: p.chronotype ?? null,
      motivation_style: p.motivation_style ?? null,
      daily_minutes: p.daily_minutes ?? null,
      priority_domains: p.priority_domains ?? [],
      blockers: p.blockers ?? [],
    },
    goal: input.goal
      ? {
          title: input.goal.title,
          why: input.goal.why ?? null,
          target_value: input.goal.target_value ?? null,
          unit: input.goal.unit ?? null,
          deadline: input.goal.deadline ?? null,
        }
      : null,
    // Numbers only, most recent last
    recent_checkins: [...input.checkins]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-RECENT_CHECKINS)
      .map((c) => ({
        energy: c.energy ?? null,
        mood: c.mood ?? null,
        minutes_available: c.minutes_tomorrow ?? null,
      })),
    candidates: input.candidates.slice(0, MAX_CANDIDATES).map((e) => ({
      id: e.id,
      title: lang === 'en' ? e.title_en : e.title_fr,
      instructions: lang === 'en' ? e.instructions_en : e.instructions_fr,
      duration_min: e.duration_min,
      energy: e.energy ?? null,
      difficulty: e.difficulty ?? null,
      domain: e.domain ?? null,
    })),
    locked_ids: input.mode === 'program' ? input.lockedIds : [],
  };
}

const SYSTEM = `You are the coach of Daily Edge, a daily personal development app.
You receive a JSON payload describing today's plan computed by rules, a short anonymous profile,
the user's goal, the numbers of their last check-ins and candidate exercises from a validated catalogue.
Rules:
- Only use exercise ids from "candidates". Never invent an exercise.
- If "mode" is "program", keep exactly the exercises listed in "locked_ids" (same ids, same order).
- If "mode" is "catalog", choose 1 to 3 exercises whose total duration fits "budget_minutes", best suited to the goal and the recent energy.
- For each chosen exercise, rewrite the instructions for this user's goal in at most 400 characters, without changing the nature of the exercise (same action, same expected result).
- Write "why_today" in at most 2 short sentences explaining why this is the right exercise today.
- Write everything in the language given by "language" (fr = French with "tu", en = English).
- Kind, concrete, never guilt-inducing. No medical, financial or legal advice.
Answer with JSON only: {"items":[{"exercise_id":"...","instructions":"..."}],"why_today":"..."}.`;

export function planJsonSchema(candidateIds: string[]): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['items', 'why_today'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['exercise_id', 'instructions'],
          properties: {
            exercise_id: { type: 'string', enum: candidateIds },
            instructions: { type: 'string' },
          },
        },
      },
      why_today: { type: 'string' },
    },
  };
}

export function buildPlanRequest(payload: PlanPayload): Omit<LlmRequest, 'signal'> {
  return {
    system: SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
    jsonSchema: planJsonSchema(payload.candidates.map((c) => c.id)),
    maxTokens: 2000,
  };
}

export const PlanOutputSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            exercise_id: z.string().min(1),
            instructions: z.string().trim().min(1).max(MAX_INSTRUCTIONS_CHARS),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_AI_ITEMS),
    why_today: z.string().trim().min(1).max(MAX_WHY_CHARS),
  })
  .strict();

export type PlanOutput = z.infer<typeof PlanOutputSchema>;

export function countSentences(text: string): number {
  return text
    .split(/[.!?…]+(?:\s|$)/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;
}

// Checks the schema cannot express; returns a fallback reason or null
export function checkPlanOutput(output: PlanOutput, payload: PlanPayload): string | null {
  const byId = new Map(payload.candidates.map((c) => [c.id, c]));
  const ids = output.items.map((i) => i.exercise_id);
  if (ids.some((id) => !byId.has(id))) return 'unknown_id';
  if (new Set(ids).size !== ids.length) return 'duplicate_id';
  if (payload.mode === 'program') {
    const locked = payload.locked_ids;
    if (ids.length !== locked.length || ids.some((id, i) => id !== locked[i])) {
      return 'program_changed';
    }
  } else {
    const total = ids.reduce((sum, id) => sum + (byId.get(id)?.duration_min ?? 0), 0);
    if (total > payload.budget_minutes) return 'over_budget';
  }
  if (countSentences(output.why_today) > MAX_WHY_SENTENCES) return 'why_too_long';
  return null;
}
