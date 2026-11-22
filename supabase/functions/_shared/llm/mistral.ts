// Mistral provider (chat completions API). Model and key come from the environment.
// JSON mode for plan and review; tools for the assistant. The stream is emulated in one chunk.
import {
  LlmError,
  type LlmContentBlock,
  type LlmMessage,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
  type LlmStreamEvent,
} from './types.ts';

const ENDPOINT = 'https://api.mistral.ai/v1/chat/completions';

export type MistralOptions = {
  apiKey: string;
  model: string;
  // Tests inject a fetch (never a real network call in tests)
  fetch?: typeof fetch;
};

type MistralToolCall = { id: string; type?: string; function: { name: string; arguments: string } };
type MistralChoice = {
  message?: { content?: string | null; tool_calls?: MistralToolCall[] | null };
  finish_reason?: string;
};
type MistralBody = {
  model?: string;
  choices?: MistralChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

// One neutral message can become several Mistral messages (tool results are separate)
function toMistralMessages(m: LlmMessage): Record<string, unknown>[] {
  if (typeof m.content === 'string') return [{ role: m.role, content: m.content }];
  if (m.role === 'assistant') {
    const text = m.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    const calls = m.content.flatMap((b) =>
      b.type === 'tool_use'
        ? [
            {
              id: b.id,
              type: 'function',
              function: { name: b.name, arguments: JSON.stringify(b.input) },
            },
          ]
        : [],
    );
    return [{ role: 'assistant', content: text, ...(calls.length ? { tool_calls: calls } : {}) }];
  }
  const out: Record<string, unknown>[] = [];
  const text = m.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  for (const b of m.content) {
    if (b.type === 'tool_result')
      out.push({ role: 'tool', tool_call_id: b.toolUseId, content: b.content });
  }
  if (text) out.push({ role: 'user', content: text });
  return out;
}

export function createMistralProvider(options: MistralOptions): LlmProvider {
  const doFetch = options.fetch ?? fetch;

  async function complete(request: LlmRequest): Promise<LlmResponse> {
    let res: Response;
    try {
      res = await doFetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model,
          max_tokens: request.maxTokens,
          messages: [
            {
              role: 'system',
              content: request.cachedSystem
                ? `${request.cachedSystem}\n\n${request.system}`
                : request.system,
            },
            ...request.messages.flatMap(toMistralMessages),
          ],
          ...(request.jsonSchema ? { response_format: { type: 'json_object' } } : {}),
          ...(request.tools?.length
            ? {
                tools: request.tools.map((t) => ({
                  type: 'function',
                  function: { name: t.name, description: t.description, parameters: t.inputSchema },
                })),
                tool_choice: request.toolChoice ?? 'auto',
              }
            : {}),
        }),
        signal: request.signal,
      });
    } catch (error) {
      if (request.signal?.aborted) throw new LlmError('timeout', 'aborted');
      throw new LlmError('provider_error', String(error));
    }
    if (!res.ok) throw new LlmError('provider_error', `mistral ${res.status}`);
    const body = (await res.json()) as MistralBody;
    const choice = body.choices?.[0];
    const content: LlmContentBlock[] = [];
    if (choice?.message?.content) content.push({ type: 'text', text: choice.message.content });
    for (const call of choice?.message?.tool_calls ?? []) {
      let input: unknown = {};
      try {
        input = JSON.parse(call.function.arguments || '{}');
      } catch {
        input = {};
      }
      content.push({ type: 'tool_use', id: call.id, name: call.function.name, input });
    }
    if (content.length === 0) content.push({ type: 'text', text: '' });
    return {
      model: body.model ?? options.model,
      content,
      usage: {
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
      },
      stopReason:
        choice?.finish_reason === 'tool_calls'
          ? 'tool_use'
          : choice?.finish_reason === 'stop'
            ? 'end_turn'
            : choice?.finish_reason === 'length'
              ? 'max_tokens'
              : 'other',
    };
  }

  return {
    name: 'mistral',
    model: options.model,
    complete,
    // Emulated: the whole answer in one chunk (true streaming may come later)
    async *stream(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
      const response = await complete(request);
      for (const block of response.content) {
        if (block.type === 'text' && block.text) yield { type: 'text_delta', text: block.text };
        if (block.type === 'tool_use') yield { type: 'tool_use', block };
      }
      yield { type: 'done', response };
    },
  };
}
