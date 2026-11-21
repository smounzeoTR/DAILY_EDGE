// deno-lint-ignore-file require-await -- async test doubles implement Promise-based interfaces
// AI layer with the mock provider: never a real network call.
import { describe, expect, it } from 'vitest';

import { createAnthropicProvider } from '../anthropic.ts';
import { llmConfigFromEnv } from '../config.ts';
import { createMistralProvider } from '../mistral.ts';
import { createMockProvider, type MockOptions } from '../mock.ts';
import {
  buildPlanPayload,
  buildPlanRequest,
  checkPlanOutput,
  countSentences,
  PLAN_PROMPT_VERSION,
  PlanOutputSchema,
  type ExerciseSource,
  type PlanOutput,
  type PlanTaskInput,
} from '../planTask.ts';
import {
  buildReviewPayload,
  buildReviewRequest,
  checkReviewOutput,
  REVIEW_PROMPT_VERSION,
  ReviewOutputSchema,
  type ReviewOutput,
} from '../reviewTask.ts';
import {
  DAILY_LIMITS,
  estimateCost,
  parseJsonAnswer,
  runTask,
  type LlmCallRecord,
  type LlmStore,
} from '../runTask.ts';

const exercise = (id: string, duration = 10): ExerciseSource => ({
  id,
  title_fr: `Titre ${id}`,
  title_en: `Title ${id}`,
  instructions_fr: `Consigne ${id}`,
  instructions_en: `Instructions ${id}`,
  duration_min: duration,
  energy: 'medium',
  difficulty: 2,
  domain: 'clarity_goals',
  status: 'published',
});

const REFLECTION = 'Mon associé Paul me met la pression, je dors mal.';
const NOTE = 'Note privée sur ma santé';

function planInput(overrides: Partial<PlanTaskInput> = {}): PlanTaskInput {
  return {
    language: 'fr',
    mode: 'catalog',
    planMode: 'normal',
    programDay: null,
    budgetMinutes: 30,
    rulesWhy: 'Variété : un nouveau domaine aujourd’hui.',
    profile: {
      // Fields that must never be sent
      user_id: '11111111-2222-3333-4444-555555555555',
      display_name: 'Camille Martin',
      email: 'camille.martin@example.com',
      timezone: 'Europe/Paris',
      // Allowed fields
      locale: 'fr',
      situation: 'entrepreneur',
      level: 'beginner',
      persona: 'entrepreneur',
      chronotype: 'morning',
      motivation_style: 'challenge',
      daily_minutes: 30,
      priority_domains: ['clarity_goals'],
      blockers: ['procrastination'],
    },
    goal: {
      title: 'Signer 5 clients',
      why: 'Vivre de mon activité',
      target_value: 5,
      unit: 'clients',
      deadline: '2027-01-31',
      id: 'goal-id',
      user_id: '11111111-2222-3333-4444-555555555555',
    },
    checkins: [
      {
        date: '2026-11-17',
        energy: 2,
        mood: 3,
        minutes_tomorrow: 15,
        reflection: REFLECTION,
        note: NOTE,
      },
      { date: '2026-11-18', energy: 3, mood: 3, minutes_tomorrow: 30, reflection: REFLECTION },
      { date: '2026-11-19', energy: 4, mood: 4, minutes_tomorrow: 30, reflection: REFLECTION },
      { date: '2026-11-20', energy: 4, mood: 5, minutes_tomorrow: 45, reflection: REFLECTION },
    ],
    candidates: [exercise('E002'), exercise('E003', 15), exercise('E004', 25)],
    lockedIds: [],
    ...overrides,
  };
}

function memoryStore(initialCount = 0): LlmStore & { records: LlmCallRecord[] } {
  const records: LlmCallRecord[] = [];
  return {
    records,
    async countCalls() {
      return initialCount + records.filter((r) => r.attempts > 0).length;
    },
    async findCachedOutput(_user, hash) {
      const hit = [...records].reverse().find((r) => r.inputHash === hash && r.output !== null);
      return hit ? hit.output : null;
    },
    async logCall(record) {
      records.push(record);
    },
  };
}

type Applied = { applied: PlanOutput[]; fallbacks: string[] };

async function runPlan(
  mock: MockOptions,
  options: {
    input?: PlanTaskInput;
    store?: ReturnType<typeof memoryStore>;
    timeoutMs?: number;
  } = {},
) {
  const provider = createMockProvider(mock);
  const store = options.store ?? memoryStore();
  const payload = buildPlanPayload(options.input ?? planInput());
  const state: Applied = { applied: [], fallbacks: [] };
  const result = await runTask({
    provider,
    pricing: { inputPerMTok: 0.1, outputPerMTok: 0.5 },
    store,
    userId: 'u1',
    feature: 'plan',
    localDate: '2026-11-21',
    promptVersion: PLAN_PROMPT_VERSION,
    request: buildPlanRequest(payload),
    schema: PlanOutputSchema,
    check: (output) => checkPlanOutput(output, payload),
    apply: async (output) => {
      state.applied.push(output);
      return null;
    },
    onFallback: async (reason) => {
      state.fallbacks.push(reason);
    },
    timeoutMs: options.timeoutMs,
  });
  return { result, provider, store, state, payload };
}

describe('plan task with the mock provider', () => {
  it('applies a valid answer and logs tokens, cost and latency', async () => {
    const { result, store, state } = await runPlan({});
    expect(result.outcome).toBe('success');
    expect(state.applied[0]?.items[0]?.exercise_id).toBe('E002');
    expect(state.applied[0]?.items[0]?.instructions).toContain('Signer 5 clients');
    const record = store.records[0]!;
    expect(record).toMatchObject({
      outcome: 'success',
      attempts: 1,
      feature: 'plan',
      model: 'mock',
    });
    expect(record.inputTokens).toBeGreaterThan(0);
    expect(record.costEur).toBeGreaterThan(0);
    expect(record.latencyMs).not.toBeNull();
    expect(record.inputHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('falls back completely on an id outside the candidates (after one retry)', async () => {
    const { result, provider, state, store } = await runPlan({ mode: 'unknown_id' });
    expect(result).toMatchObject({
      output: null,
      outcome: 'fallback',
      fallbackReason: 'unknown_id',
    });
    expect(provider.calls).toHaveLength(2);
    expect(state.applied).toHaveLength(0);
    expect(state.fallbacks).toEqual(['unknown_id']);
    expect(store.records[0]?.attempts).toBe(2);
  });

  it('falls back on invalid JSON', async () => {
    const { result, state } = await runPlan({ mode: 'invalid_json' });
    expect(result.fallbackReason).toBe('invalid_json');
    expect(state.applied).toHaveLength(0);
  });

  it('falls back after the timeout and a single retry', async () => {
    const started = Date.now();
    const { result, provider, store } = await runPlan({ mode: 'timeout' }, { timeoutMs: 50 });
    expect(result.fallbackReason).toBe('timeout');
    expect(provider.calls).toHaveLength(2);
    expect(store.records[0]?.attempts).toBe(2);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('retries once and keeps a valid second answer', async () => {
    let n = 0;
    const { result, provider } = await runPlan({
      respond: () => {
        n += 1;
        return n === 1
          ? 'not json'
          : JSON.stringify({
              items: [{ exercise_id: 'E003', instructions: 'Fais-le.' }],
              why_today: 'Bon moment.',
            });
      },
    });
    expect(provider.calls).toHaveLength(2);
    expect(result.outcome).toBe('success');
  });

  it('never calls the provider beyond the daily cap', async () => {
    const store = memoryStore(DAILY_LIMITS.plan_review);
    const { result, provider, state } = await runPlan({}, { store });
    expect(result).toMatchObject({ outcome: 'quota_exceeded', fallbackReason: 'quota' });
    expect(provider.calls).toHaveLength(0);
    expect(state.fallbacks).toEqual(['quota']);
    expect(store.records[0]).toMatchObject({ outcome: 'quota_exceeded', attempts: 0, costEur: 0 });
  });

  it('reuses the answer for an identical input without calling the provider', async () => {
    const store = memoryStore();
    await runPlan({}, { store });
    const second = await runPlan({}, { store });
    expect(second.provider.calls).toHaveLength(0);
    expect(second.result.outcome).toBe('cache_hit');
    expect(second.state.applied).toHaveLength(1);
    // A cache hit does not count in the cap
    expect(await store.countCalls('u1', ['plan'], '2026-11-21')).toBe(1);
  });

  it('logs the reason when a valid answer cannot be applied (plan touched)', async () => {
    const provider = createMockProvider();
    const store = memoryStore();
    const payload = buildPlanPayload(planInput());
    const result = await runTask({
      provider,
      pricing: { inputPerMTok: 0, outputPerMTok: 0 },
      store,
      userId: 'u1',
      feature: 'plan',
      localDate: '2026-11-21',
      promptVersion: PLAN_PROMPT_VERSION,
      request: buildPlanRequest(payload),
      schema: PlanOutputSchema,
      check: (output) => checkPlanOutput(output, payload),
      apply: async () => 'plan_touched',
      onFallback: async () => undefined,
    });
    expect(result).toMatchObject({ outcome: 'fallback', fallbackReason: 'plan_touched' });
    expect(store.records[0]?.output).toBeNull();
  });
});

describe('plan payload (data minimization)', () => {
  it('never sends the e-mail, the name, a reflection or a note', async () => {
    const { provider } = await runPlan({});
    const sent = JSON.stringify(provider.calls[0]);
    for (const forbidden of [
      'camille.martin@example.com',
      'Camille',
      'Martin',
      '11111111-2222-3333-4444-555555555555',
      REFLECTION,
      NOTE,
      'Europe/Paris',
    ]) {
      expect(sent).not.toContain(forbidden);
    }
  });

  it('sends the goal, the last 3 check-in numbers and at most 10 candidates', () => {
    const many = Array.from({ length: 14 }, (_, i) => exercise(`E1${String(i).padStart(2, '0')}`));
    const payload = buildPlanPayload(planInput({ candidates: many }));
    expect(payload.goal).toEqual({
      title: 'Signer 5 clients',
      why: 'Vivre de mon activité',
      target_value: 5,
      unit: 'clients',
      deadline: '2027-01-31',
    });
    expect(payload.recent_checkins).toEqual([
      { energy: 3, mood: 3, minutes_available: 30 },
      { energy: 4, mood: 4, minutes_available: 30 },
      { energy: 4, mood: 5, minutes_available: 45 },
    ]);
    expect(payload.candidates).toHaveLength(10);
    expect(Object.keys(payload.profile).sort()).toEqual([
      'blockers',
      'chronotype',
      'daily_minutes',
      'level',
      'motivation_style',
      'persona',
      'priority_domains',
      'situation',
    ]);
  });

  it('uses the user language for candidates', () => {
    const payload = buildPlanPayload(planInput({ language: 'en' }));
    expect(payload.candidates[0]).toMatchObject({
      title: 'Title E002',
      instructions: 'Instructions E002',
    });
  });
});

describe('plan output checks', () => {
  const payload = buildPlanPayload(planInput());
  const programPayload = buildPlanPayload(
    planInput({ mode: 'program', candidates: [exercise('E001')], lockedIds: ['E001'] }),
  );
  const out = (ids: string[], why = 'Une phrase.'): PlanOutput => ({
    items: ids.map((id) => ({ exercise_id: id, instructions: 'Consigne.' })),
    why_today: why,
  });

  it('accepts candidates that fit the budget', () => {
    expect(checkPlanOutput(out(['E002', 'E003']), payload)).toBeNull();
  });
  it('refuses an unknown id, a duplicate or a choice over the budget', () => {
    expect(checkPlanOutput(out(['E999']), payload)).toBe('unknown_id');
    expect(checkPlanOutput(out(['E002', 'E002']), payload)).toBe('duplicate_id');
    expect(checkPlanOutput(out(['E002', 'E004']), payload)).toBe('over_budget');
  });
  it('keeps the program exercise in program mode', () => {
    expect(checkPlanOutput(out(['E001']), programPayload)).toBeNull();
    expect(
      checkPlanOutput(
        out(['E002']),
        buildPlanPayload(
          planInput({
            mode: 'program',
            candidates: [exercise('E001'), exercise('E002')],
            lockedIds: ['E001'],
          }),
        ),
      ),
    ).toBe('program_changed');
  });
  it('limits why to 2 sentences and instructions to 400 characters', () => {
    expect(checkPlanOutput(out(['E002'], 'Un. Deux. Trois.'), payload)).toBe('why_too_long');
    expect(countSentences('Ton énergie était basse hier : voici une version courte.')).toBe(1);
    expect(countSentences('Bravo ! Continue comme ça.')).toBe(2);
    const long = {
      items: [{ exercise_id: 'E002', instructions: 'x'.repeat(401) }],
      why_today: 'Ok.',
    };
    expect(PlanOutputSchema.safeParse(long).success).toBe(false);
    expect(PlanOutputSchema.safeParse({ items: [], why_today: 'Ok.' }).success).toBe(false);
    const four = out(['E002', 'E003', 'E004', 'E005']);
    expect(PlanOutputSchema.safeParse(four).success).toBe(false);
  });
});

describe('review task', () => {
  const payload = buildReviewPayload({
    language: 'fr',
    weekStart: '2026-11-09',
    weekEnd: '2026-11-15',
    exercisesDone: 5,
    exercisesPlanned: 7,
    energyAverage: 3.4,
    bestDay: '2026-11-12',
    habits: [{ title: 'Lire 10 pages', done: 2, expected: 7, rate: 0.29 }],
    goalTitle: 'Signer 5 clients',
    proposals: [
      {
        type: 'habit_simplify',
        params: { user_habit_id: 'h1' },
        names: { habit: 'Lire 10 pages' },
      },
      { type: 'daily_minutes', params: { minutes: 15, average: 12 }, names: {} },
    ],
  });

  it('writes the summary and one text per proposal', async () => {
    const provider = createMockProvider();
    const store = memoryStore();
    let applied: ReviewOutput | null = null;
    const result = await runTask({
      provider,
      pricing: { inputPerMTok: 0, outputPerMTok: 0 },
      store,
      userId: 'u1',
      feature: 'review',
      localDate: '2026-11-21',
      promptVersion: REVIEW_PROMPT_VERSION,
      request: buildReviewRequest(payload),
      schema: ReviewOutputSchema,
      check: (output) => checkReviewOutput(output, payload),
      apply: async (output) => {
        applied = output;
        return null;
      },
      onFallback: async () => undefined,
    });
    expect(result.outcome).toBe('success');
    expect(applied!.proposal_texts).toHaveLength(2);
    expect(store.records[0]?.feature).toBe('review');
  });

  it('refuses another number of proposal texts', () => {
    expect(checkReviewOutput({ summary: 'Ok', proposal_texts: ['Un'] }, payload)).toBe(
      'proposal_count',
    );
    expect(
      checkReviewOutput({ summary: 'Ok', proposal_texts: ['Un', 'Deux', 'Trois'] }, payload),
    ).toBe('proposal_count');
  });

  it('shares the daily cap with the plan', async () => {
    const store = memoryStore(DAILY_LIMITS.plan_review);
    const provider = createMockProvider();
    const result = await runTask({
      provider,
      pricing: { inputPerMTok: 0, outputPerMTok: 0 },
      store,
      userId: 'u1',
      feature: 'review',
      localDate: '2026-11-21',
      promptVersion: REVIEW_PROMPT_VERSION,
      request: buildReviewRequest(payload),
      schema: ReviewOutputSchema,
      check: (output) => checkReviewOutput(output, payload),
      apply: async () => null,
      onFallback: async () => undefined,
    });
    expect(result.outcome).toBe('quota_exceeded');
    expect(provider.calls).toHaveLength(0);
  });
});

describe('helpers and configuration', () => {
  it('estimates the cost from the environment prices', () => {
    expect(estimateCost({ inputPerMTok: 0.1, outputPerMTok: 0.5 }, 2500, 500)).toBeCloseTo(
      0.0005,
      6,
    );
  });
  it('parses JSON wrapped in a code fence', () => {
    expect(parseJsonAnswer('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('disables the AI when a setting is missing', () => {
    const env = (values: Record<string, string>) => (k: string) => values[k];
    expect(llmConfigFromEnv(env({}))).toMatchObject({ enabled: false, reason: 'provider_none' });
    expect(
      llmConfigFromEnv(env({ LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' })),
    ).toMatchObject({
      enabled: false,
      reason: 'missing_model',
    });
    expect(llmConfigFromEnv(env({ LLM_PROVIDER: 'anthropic', LLM_MODEL: 'm' }))).toMatchObject({
      enabled: false,
      reason: 'missing_key',
    });
    const mistral = llmConfigFromEnv(
      env({
        LLM_PROVIDER: 'mistral',
        LLM_MODEL: 'some-model',
        MISTRAL_API_KEY: 'k',
        LLM_PRICE_IN_EUR_PER_MTOK: '0.2',
      }),
    );
    expect(mistral).toMatchObject({
      enabled: true,
      pricing: { inputPerMTok: 0.2, outputPerMTok: 0 },
    });
    expect(mistral.enabled && mistral.provider.model).toBe('some-model');
  });
});

describe('providers (stubbed fetch, no network)', () => {
  const request = buildPlanRequest(buildPlanPayload(planInput()));

  it('Anthropic: model, effort, JSON schema and usage', async () => {
    let sent: Record<string, unknown> = {};
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'model-from-env',
          content: [{ type: 'text', text: '{"items":[],"why_today":"x"}' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1200, output_tokens: 300 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;
    const provider = createAnthropicProvider({
      apiKey: 'test-key',
      model: 'model-from-env',
      effort: 'low',
      fetch: fakeFetch,
    });
    const response = await provider.complete(request);
    expect(sent).toMatchObject({
      model: 'model-from-env',
      output_config: { effort: 'low', format: { type: 'json_schema' } },
    });
    expect(response.usage).toEqual({ inputTokens: 1200, outputTokens: 300 });
    expect(response.content[0]).toEqual({ type: 'text', text: '{"items":[],"why_today":"x"}' });
  });

  it('Mistral: JSON mode and usage', async () => {
    let sent: Record<string, unknown> = {};
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          model: 'mistral-model',
          choices: [{ message: { content: '{"a":1}' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 900, completion_tokens: 100 },
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    const provider = createMistralProvider({
      apiKey: 'k',
      model: 'mistral-model',
      fetch: fakeFetch,
    });
    const response = await provider.complete(request);
    expect(sent).toMatchObject({
      model: 'mistral-model',
      response_format: { type: 'json_object' },
    });
    expect(response).toMatchObject({
      stopReason: 'end_turn',
      usage: { inputTokens: 900, outputTokens: 100 },
    });
  });

  it('rejects tools until the assistant lot', async () => {
    const provider = createMistralProvider({
      apiKey: 'k',
      model: 'm',
      fetch: (async () => new Response('{}')) as typeof fetch,
    });
    await expect(
      provider.complete({ ...request, tools: [{ name: 't', description: 'd', inputSchema: {} }] }),
    ).rejects.toMatchObject({ reason: 'unsupported' });
  });
});
