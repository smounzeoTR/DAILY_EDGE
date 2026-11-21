// Provider-neutral LLM interface (Anthropic, Mistral, mock).
// Plan and review (lot 7): one user message and a JSON output. Coach Edge assistant (lot 9):
// conversation, tools and streamed answers.

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
  // Assistant turn exactly as the provider returned it (e.g. thinking blocks), replayed as is
  // inside a tool loop; neutral `content` is used otherwise
  raw?: unknown;
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
  // Assistant (lot 9): tools the model may call; 'none' forces a text answer
  tools?: LlmTool[];
  toolChoice?: 'auto' | 'none';
  // JSON Schema the answer must follow (structured output when the provider supports it)
  jsonSchema?: Record<string, unknown>;
  maxTokens: number;
  signal?: AbortSignal;
};

export type LlmUsage = { inputTokens: number; outputTokens: number };

export type LlmResponse = {
  model: string;
  content: LlmContentBlock[];
  // Provider-specific assistant content to replay in the next request of a tool loop
  raw?: unknown;
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
