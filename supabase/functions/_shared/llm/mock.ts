// Mock provider: deterministic answers for tests and the local stack (never a network call).
// It reads the task payload (daily_plan or weekly_review) from the user message.
import {
  LlmError,
  type LlmContentBlock,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
  type LlmStreamEvent,
} from './types.ts';

export type MockMode = 'valid' | 'invalid_json' | 'unknown_id' | 'timeout' | 'error';

export type MockOptions = {
  model?: string;
  mode?: MockMode;
  // Applied to every answer (simulates a slow provider)
  delayMs?: number;
  // Custom answer (overrides mode)
  respond?: (request: LlmRequest, payload: unknown) => string;
  // Assistant stream: pause between chunks
  chunkDelayMs?: number;
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
      let payload: PlanPayloadLike | ReviewPayloadLike | null = null;
      try {
        // A header line may come before the JSON data
        const raw = typeof last?.content === 'string' ? last.content : '{}';
        payload = JSON.parse(raw.slice(Math.max(0, raw.indexOf('{')))) as
          PlanPayloadLike | ReviewPayloadLike;
      } catch {
        payload = null;
      }
      // Not a JSON task (assistant history summary): a plain text answer
      if (!payload || !('task' in payload)) {
        const summary = 'Résumé : échanges précédents sur le programme et la journée.';
        return {
          model: options.model ?? 'mock',
          content: [{ type: 'text', text: summary }],
          usage: { inputTokens: Math.ceil(JSON.stringify(request).length / 4), outputTokens: 12 },
          stopReason: 'end_turn',
        };
      }
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
    async *stream(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
      calls.push(request);
      const mode = options.mode ?? 'valid';
      if (options.delayMs) await wait(options.delayMs, request.signal);
      if (mode === 'timeout') await wait(60_000, request.signal);
      if (mode === 'error') throw new LlmError('provider_error', 'mock error');
      const turn = assistantTurn(request);
      const content: LlmContentBlock[] = [];
      if (turn.text) {
        // Streamed word by word
        for (const chunk of turn.text.match(/\S+\s*/g) ?? []) {
          if (options.chunkDelayMs) await wait(options.chunkDelayMs, request.signal);
          yield { type: 'text_delta', text: chunk };
        }
        content.push({ type: 'text', text: turn.text });
      }
      if (turn.tool) {
        const block = {
          type: 'tool_use' as const,
          id: `toolu_mock_${calls.length}`,
          name: turn.tool.name,
          input: turn.tool.input,
        };
        content.push(block);
        yield { type: 'tool_use', block };
      }
      yield {
        type: 'done',
        response: {
          model: options.model ?? 'mock',
          content,
          usage: {
            inputTokens: Math.ceil(JSON.stringify(request).length / 4),
            outputTokens: Math.ceil((turn.text ?? '').length / 4) + (turn.tool ? 20 : 0),
          },
          stopReason: turn.tool ? 'tool_use' : 'end_turn',
        },
      };
    },
  };
}

// Scripted assistant: a few triggers call tools, otherwise a kind text answer
function assistantTurn(request: LlmRequest): {
  text?: string;
  tool?: { name: string; input: Record<string, unknown> };
} {
  const en = /Language: en\b/.test(request.system);
  const last = request.messages[request.messages.length - 1];
  const blocks = typeof last?.content === 'string' ? null : (last?.content ?? []);
  const toolResult = blocks?.find((b) => b.type === 'tool_result');
  // Test trigger: keeps calling a tool (the orchestrator caps the tool calls per message)
  const firstUser = [...request.messages]
    .reverse()
    .find((m) => m.role === 'user' && typeof m.content === 'string');
  const looping =
    typeof firstUser?.content === 'string' && firstUser.content.includes('BOUCLE_OUTILS');
  if (looping && request.tools?.length && request.toolChoice !== 'none') {
    return { tool: { name: 'get_today', input: {} } };
  }
  if (toolResult && toolResult.type === 'tool_result') {
    if (toolResult.content.includes('proof_required')) {
      return {
        text: en
          ? 'Great! What did you do, in a few words? I will then propose to record it.'
          : 'Bravo ! Qu’as-tu fait, en quelques mots ? Je te proposerai ensuite de l’enregistrer.',
      };
    }
    const pending = toolResult.content.includes('pending_confirmation');
    return {
      text: pending
        ? en
          ? 'I suggest this change. Tap "Apply" to confirm it, or "Cancel".'
          : 'Je te propose ce changement. Touche « Appliquer » pour le confirmer, ou « Annuler ».'
        : en
          ? 'Here is what I found.'
          : 'Voici ce que j’ai trouvé.',
    };
  }
  const text =
    typeof last?.content === 'string'
      ? last.content
      : (blocks ?? []).flatMap((b) => (b.type === 'text' ? [b.text] : [])).join(' ');
  const canUseTools = Boolean(request.tools?.length) && request.toolChoice !== 'none';
  const minutes = /(\d+)\s*min/i.exec(text);
  if (canUseTools && minutes) {
    return { tool: { name: 'adapt_today', input: { minutes: Number(minutes[1]) } } };
  }
  if (canUseTools && /méditer|meditate/i.test(text)) {
    return { tool: { name: 'search_catalog', input: { query: text.slice(0, 80), kind: 'habit' } } };
  }
  if (canUseTools && /comme fait|as done/i.test(text)) {
    return {
      tool: { name: 'save_exercise_result', input: { exercise_id: 'E001', status: 'done' } },
    };
  }
  const progress = /(?:j'en suis à|j’en suis à|i am at)\s*(\d+)/i.exec(text);
  if (canUseTools && progress) {
    return { tool: { name: 'update_goal_progress', input: { value: Number(progress[1]) } } };
  }
  if (
    canUseTools &&
    /(aujourd'hui|aujourd’hui|today)/i.test(text) &&
    /(plan|programme)/i.test(text)
  ) {
    return { tool: { name: 'get_today', input: {} } };
  }
  return {
    text: en
      ? 'Thanks for sharing this. Let us take it one small step at a time.'
      : 'Merci de partager cela avec moi. Avançons pas à pas, à ton rythme.',
  };
}
