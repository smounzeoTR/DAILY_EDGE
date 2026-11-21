// Mistral provider (chat completions API, JSON mode). Model and key come from the environment.
import { LlmError, type LlmProvider, type LlmRequest, type LlmResponse } from './types.ts';

const ENDPOINT = 'https://api.mistral.ai/v1/chat/completions';

export type MistralOptions = {
  apiKey: string;
  model: string;
  // Tests inject a fetch (never a real network call in tests)
  fetch?: typeof fetch;
};

type MistralChoice = { message?: { content?: string | null }; finish_reason?: string };
type MistralBody = {
  model?: string;
  choices?: MistralChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export function createMistralProvider(options: MistralOptions): LlmProvider {
  const doFetch = options.fetch ?? fetch;
  return {
    name: 'mistral',
    model: options.model,
    async complete(request: LlmRequest): Promise<LlmResponse> {
      if (request.tools?.length) throw new LlmError('unsupported', 'tools come with lot 9');
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
              { role: 'system', content: request.system },
              ...request.messages.map((m) => ({
                role: m.role,
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
              })),
            ],
            ...(request.jsonSchema ? { response_format: { type: 'json_object' } } : {}),
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
      return {
        model: body.model ?? options.model,
        content: [{ type: 'text', text: choice?.message?.content ?? '' }],
        usage: {
          inputTokens: body.usage?.prompt_tokens ?? 0,
          outputTokens: body.usage?.completion_tokens ?? 0,
        },
        stopReason:
          choice?.finish_reason === 'stop'
            ? 'end_turn'
            : choice?.finish_reason === 'length'
              ? 'max_tokens'
              : 'other',
      };
    },
  };
}
