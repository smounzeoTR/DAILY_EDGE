// Mock provider: deterministic answers for tests and the local stack (never a network call).
// It reads the task payload (daily_plan or weekly_review) from the user message.
import { LlmError, type LlmProvider, type LlmRequest, type LlmResponse } from './types.ts';

export type MockMode = 'valid' | 'invalid_json' | 'unknown_id' | 'timeout' | 'error';

export type MockOptions = {
  model?: string;
  mode?: MockMode;
  // Applied to every answer (simulates a slow provider)
  delayMs?: number;
  // Custom answer (overrides mode)
  respond?: (request: LlmRequest, payload: unknown) => string;
};

export type MockProvider = LlmProvider & { calls: LlmRequest[] };

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new LlmError('timeout', 'aborted'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new LlmError('timeout', 'aborted'));
    });
  });

type Candidate = { id: string; instructions: string; duration_min: number };
type PlanPayloadLike = {
  task: 'daily_plan';
  language: 'fr' | 'en';
  mode: 'program' | 'catalog';
  candidates: Candidate[];
  locked_ids: string[];
  goal: { title: string } | null;
};
type ReviewPayloadLike = {
  task: 'weekly_review';
  language: 'fr' | 'en';
  stats: { exercises_done: number; exercises_planned: number };
  proposals: { type: string }[];
};

function validAnswer(payload: PlanPayloadLike | ReviewPayloadLike, unknownId: boolean): string {
  const fr = payload.language !== 'en';
  if (payload.task === 'weekly_review') {
    const s = payload.stats;
    return JSON.stringify({
      summary: fr
        ? `Cette semaine, tu as fait ${s.exercises_done} exercices sur ${s.exercises_planned}. Chaque pas compte.`
        : `This week you did ${s.exercises_done} of ${s.exercises_planned} exercises. Every step counts.`,
      proposal_texts: payload.proposals.map((p) =>
        fr ? `Proposition rédigée pour toi (${p.type}).` : `Proposal written for you (${p.type}).`,
      ),
    });
  }
  const goal = payload.goal?.title;
  const chosen =
    payload.mode === 'program'
      ? payload.locked_ids.map((id) => payload.candidates.find((c) => c.id === id)!)
      : payload.candidates.slice(0, 1);
  const prefix = fr
    ? `Pour ton objectif${goal ? ` « ${goal} »` : ''} : `
    : `For your goal${goal ? ` "${goal}"` : ''}: `;
  return JSON.stringify({
    items: chosen.map((c) => ({
      exercise_id: unknownId ? 'E999' : c.id,
      instructions: (prefix + c.instructions).slice(0, 400),
    })),
    why_today: fr
      ? 'Cet exercice te rapproche de ton objectif aujourd’hui. Garde le rythme, sans pression.'
      : 'This exercise brings you closer to your goal today. Keep the pace, no pressure.',
  });
}

export function createMockProvider(options: MockOptions = {}): MockProvider {
  const calls: LlmRequest[] = [];
  return {
    name: 'mock',
    model: options.model ?? 'mock',
    calls,
    async complete(request: LlmRequest): Promise<LlmResponse> {
      calls.push(request);
      const mode = options.mode ?? 'valid';
      if (options.delayMs) await wait(options.delayMs, request.signal);
      if (mode === 'timeout') {
        await wait(60_000, request.signal);
      }
      if (mode === 'error') throw new LlmError('provider_error', 'mock error');
      const last = request.messages[request.messages.length - 1];
      const payload = JSON.parse(typeof last?.content === 'string' ? last.content : '{}') as
        PlanPayloadLike | ReviewPayloadLike;
      const text = options.respond
        ? options.respond(request, payload)
        : mode === 'invalid_json'
          ? '{"items": [ not json'
          : validAnswer(payload, mode === 'unknown_id');
      return {
        model: options.model ?? 'mock',
        content: [{ type: 'text', text }],
        usage: {
          inputTokens: Math.ceil(JSON.stringify(request).length / 4),
          outputTokens: Math.ceil(text.length / 4),
        },
        stopReason: 'end_turn',
      };
    },
  };
}
