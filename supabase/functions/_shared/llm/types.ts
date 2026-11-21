// Provider-neutral LLM interface (Anthropic, Mistral, mock).
// Lot 7 uses one user message and a JSON output; tools and streaming are typed
// now for the Coach Edge assistant (lot 9) and not implemented yet.

export type LlmTextBlock = { type: 'text'; text: string };
export type LlmToolUseBlock = { type: 'tool_use'; id: string; name: string; input: unknown };
export type LlmToolResultBlock = {
  type: 'tool_result';
  toolUseId: string;
  content: string;
  isError?: boolean;
};
export type LlmContentBlock = LlmTextBlock | LlmToolUseBlock | LlmToolResultBlock;

export type LlmMessage = {
  role: 'user' | 'assistant';
  content: string | LlmContentBlock[];
};

export type LlmTool = {
  name: string;
  description: string;
  // JSON Schema of the tool input
  inputSchema: Record<string, unknown>;
};

export type LlmRequest = {
  system: string;
  messages: LlmMessage[];
  // Lot 9 (assistant); providers reject it until then
  tools?: LlmTool[];
  // JSON Schema the answer must follow (structured output when the provider supports it)
  jsonSchema?: Record<string, unknown>;
  maxTokens: number;
  signal?: AbortSignal;
};

export type LlmUsage = { inputTokens: number; outputTokens: number };

export type LlmResponse = {
  model: string;
  content: LlmContentBlock[];
  usage: LlmUsage;
  stopReason: 'end_turn' | 'max_tokens' | 'tool_use' | 'refusal' | 'other';
};

// Lot 9: streamed text and tool calls
export type LlmStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use'; block: LlmToolUseBlock }
  | { type: 'done'; response: LlmResponse };

export type LlmProviderName = 'anthropic' | 'mistral' | 'mock';

export interface LlmProvider {
  readonly name: LlmProviderName;
  readonly model: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
  stream?(request: LlmRequest): AsyncIterable<LlmStreamEvent>;
}

// EUR per million tokens (from the environment, never hard-coded)
export type LlmPricing = { inputPerMTok: number; outputPerMTok: number };

export type LlmErrorReason = 'timeout' | 'provider_error' | 'refusal' | 'unsupported';

// No parameter properties: Node's type stripping (scripts) does not support them
export class LlmError extends Error {
  readonly reason: LlmErrorReason;
  constructor(reason: LlmErrorReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

export const textOf = (response: LlmResponse): string =>
  response.content
    .filter((b): b is LlmTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
