// Anthropic provider (official SDK). Model, key and effort come from the environment.
import Anthropic from '@anthropic-ai/sdk';

import {
  LlmError,
  type LlmContentBlock,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
} from './types.ts';

export type AnthropicOptions = {
  apiKey: string;
  model: string;
  effort: 'low' | 'medium' | 'high';
  // Tests inject a fetch (never a real network call in tests)
  fetch?: typeof fetch;
};

export function createAnthropicProvider(options: AnthropicOptions): LlmProvider {
  // Retries and timeouts are handled by callLlm (8 s, one retry)
  const client = new Anthropic({
    apiKey: options.apiKey,
    maxRetries: 0,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });

  return {
    name: 'anthropic',
    model: options.model,
    async complete(request: LlmRequest): Promise<LlmResponse> {
      if (request.tools?.length) throw new LlmError('unsupported', 'tools come with lot 9');
      let message: Anthropic.Message;
      try {
        message = await client.messages.create(
          {
            model: options.model,
            max_tokens: request.maxTokens,
            system: request.system,
            messages: request.messages.map((m) => ({
              role: m.role,
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            })),
            output_config: {
              effort: options.effort,
              ...(request.jsonSchema
                ? { format: { type: 'json_schema' as const, schema: request.jsonSchema } }
                : {}),
            },
          },
          { signal: request.signal },
        );
      } catch (error) {
        if (error instanceof Anthropic.APIUserAbortError || request.signal?.aborted) {
          throw new LlmError('timeout', 'aborted');
        }
        if (error instanceof Anthropic.APIError) {
          throw new LlmError('provider_error', `anthropic ${error.status ?? ''} ${error.message}`);
        }
        throw new LlmError('provider_error', String(error));
      }
      if (message.stop_reason === 'refusal') throw new LlmError('refusal', 'refused');

      const content: LlmContentBlock[] = [];
      for (const block of message.content) {
        if (block.type === 'text') content.push({ type: 'text', text: block.text });
        else if (block.type === 'tool_use') {
          content.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input });
        }
        // Thinking blocks are not used
      }
      return {
        model: message.model,
        content,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        },
        stopReason:
          message.stop_reason === 'end_turn' ||
          message.stop_reason === 'max_tokens' ||
          message.stop_reason === 'tool_use'
            ? message.stop_reason
            : 'other',
      };
    },
  };
}
