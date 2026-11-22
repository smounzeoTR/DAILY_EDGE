// Anthropic provider (official SDK). Model, key and effort come from the environment.
// complete(): plan and review (JSON output); stream(): assistant (text deltas and tool calls).
import Anthropic from '@anthropic-ai/sdk';

import {
  LlmError,
  type LlmContentBlock,
  type LlmMessage,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
  type LlmStreamEvent,
} from './types.ts';

export type AnthropicOptions = {
  apiKey: string;
  model: string;
  effort: 'low' | 'medium' | 'high';
  // Tests inject a fetch (never a real network call in tests)
  fetch?: typeof fetch;
};

function toAnthropicMessage(m: LlmMessage): Anthropic.MessageParam {
  // An assistant turn of the current tool loop is replayed exactly as returned
  if (m.role === 'assistant' && m.raw) {
    return { role: 'assistant', content: m.raw as Anthropic.ContentBlockParam[] };
  }
  if (typeof m.content === 'string') return { role: m.role, content: m.content };
  const content: Anthropic.ContentBlockParam[] = m.content.map((b) => {
    if (b.type === 'text') return { type: 'text', text: b.text };
    if (b.type === 'tool_use') {
      return {
        type: 'tool_use',
        id: b.id,
        name: b.name,
        input: b.input as Record<string, unknown>,
      };
    }
    return {
      type: 'tool_result',
      tool_use_id: b.toolUseId,
      content: b.content,
      ...(b.isError ? { is_error: true } : {}),
    };
  });
  return { role: m.role, content };
}

function params(options: AnthropicOptions, request: LlmRequest) {
  return {
    model: options.model,
    max_tokens: request.maxTokens,
    // The fixed part is cached (with the tool definitions, which come before it)
    system: request.cachedSystem
      ? [
          {
            type: 'text' as const,
            text: request.cachedSystem,
            cache_control: { type: 'ephemeral' as const },
          },
          { type: 'text' as const, text: request.system },
        ]
      : request.system,
    messages: request.messages.map(toAnthropicMessage),
    ...(request.tools?.length
      ? {
          tools: request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
          })),
          tool_choice: { type: request.toolChoice ?? 'auto' } as Anthropic.ToolChoice,
        }
      : {}),
    output_config: {
      effort: options.effort,
      ...(request.jsonSchema
        ? { format: { type: 'json_schema' as const, schema: request.jsonSchema } }
        : {}),
    },
  };
}

function toResponse(message: Anthropic.Message): LlmResponse {
  if (message.stop_reason === 'refusal') throw new LlmError('refusal', 'refused');
  const content: LlmContentBlock[] = [];
  for (const block of message.content) {
    if (block.type === 'text') content.push({ type: 'text', text: block.text });
    else if (block.type === 'tool_use') {
      content.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input });
    }
    // Thinking blocks are kept in `raw` only
  }
  return {
    model: message.model,
    content,
    raw: message.content,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    },
    stopReason:
      message.stop_reason === 'end_turn' ||
      message.stop_reason === 'max_tokens' ||
      message.stop_reason === 'tool_use'
        ? message.stop_reason
        : 'other',
  };
}

function toLlmError(error: unknown, signal?: AbortSignal): LlmError {
  if (error instanceof LlmError) return error;
  if (error instanceof Anthropic.APIUserAbortError || signal?.aborted) {
    return new LlmError('timeout', 'aborted');
  }
  if (error instanceof Anthropic.APIError) {
    return new LlmError('provider_error', `anthropic ${error.status ?? ''} ${error.message}`);
  }
  return new LlmError('provider_error', String(error));
}

export function createAnthropicProvider(options: AnthropicOptions): LlmProvider {
  // Retries and timeouts are handled by the callers
  const client = new Anthropic({
    apiKey: options.apiKey,
    maxRetries: 0,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });

  return {
    name: 'anthropic',
    model: options.model,
    async complete(request: LlmRequest): Promise<LlmResponse> {
      try {
        return toResponse(
          await client.messages.create(params(options, request), { signal: request.signal }),
        );
      } catch (error) {
        throw toLlmError(error, request.signal);
      }
    },
    async *stream(request: LlmRequest): AsyncIterable<LlmStreamEvent> {
      try {
        const stream = client.messages.stream(params(options, request), {
          signal: request.signal,
        });
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            yield { type: 'text_delta', text: event.delta.text };
          }
        }
        const response = toResponse(await stream.finalMessage());
        for (const block of response.content) {
          if (block.type === 'tool_use') yield { type: 'tool_use', block };
        }
        yield { type: 'done', response };
      } catch (error) {
        throw toLlmError(error, request.signal);
      }
    },
  };
}
