// Provider and model chosen by environment variables, never hard-coded:
// LLM_PROVIDER (anthropic | mistral | mock | none), LLM_MODEL, ANTHROPIC_API_KEY / MISTRAL_API_KEY,
// LLM_PRICE_IN_EUR_PER_MTOK / LLM_PRICE_OUT_EUR_PER_MTOK (cost estimate),
// LLM_ANTHROPIC_EFFORT (low by default), LLM_MOCK_DELAY_MS / LLM_MOCK_MODE (mock only).
// The Coach Edge assistant has its own variables: LLM_ASSISTANT_PROVIDER, LLM_ASSISTANT_MODEL,
// LLM_ASSISTANT_PRICE_IN_EUR_PER_MTOK / ..._OUT_..., LLM_ASSISTANT_EFFORT, LLM_ASSISTANT_MOCK_CHUNK_MS
// (the provider keys are shared). Cache prices: ..._PRICE_CACHE_READ_EUR_PER_MTOK and
// ..._PRICE_CACHE_WRITE_EUR_PER_MTOK (default 0.1x and 1.25x the input price).
// A missing setting disables the AI: the rules apply.
import { createAnthropicProvider } from './anthropic.ts';
import { createMistralProvider } from './mistral.ts';
import { createMockProvider, type MockMode } from './mock.ts';
import type { LlmPricing, LlmProvider } from './types.ts';

export type EnvGetter = (name: string) => string | undefined;

export type LlmConfig =
  | { enabled: true; provider: LlmProvider; pricing: LlmPricing }
  | { enabled: false; reason: string };

const number = (value: string | undefined): number => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export function llmConfigFromEnv(
  get: EnvGetter,
  scope: 'default' | 'assistant' = 'default',
): LlmConfig {
  const prefix = scope === 'assistant' ? 'LLM_ASSISTANT_' : 'LLM_';
  const name = (get(`${prefix}PROVIDER`) ?? 'none').trim().toLowerCase();
  const model = get(`${prefix}MODEL`)?.trim();
  const optional = (name: string) => {
    const value = get(`${prefix}${name}`);
    return value === undefined || value === '' ? undefined : number(value);
  };
  const pricing: LlmPricing = {
    inputPerMTok: number(get(`${prefix}PRICE_IN_EUR_PER_MTOK`)),
    outputPerMTok: number(get(`${prefix}PRICE_OUT_EUR_PER_MTOK`)),
    cacheReadPerMTok: optional('PRICE_CACHE_READ_EUR_PER_MTOK'),
    cacheWritePerMTok: optional('PRICE_CACHE_WRITE_EUR_PER_MTOK'),
  };
  if (name === 'none' || name === '') return { enabled: false, reason: 'provider_none' };
  if (name === 'mock') {
    const mode = (get('LLM_MOCK_MODE') ?? 'valid') as MockMode;
    return {
      enabled: true,
      pricing,
      provider: createMockProvider({
        model: model || 'mock',
        mode,
        delayMs: scope === 'assistant' ? 0 : number(get('LLM_MOCK_DELAY_MS')),
        chunkDelayMs: number(get('LLM_ASSISTANT_MOCK_CHUNK_MS')),
      }),
    };
  }
  if (!model) return { enabled: false, reason: 'missing_model' };
  if (name === 'anthropic') {
    const apiKey = get('ANTHROPIC_API_KEY');
    if (!apiKey) return { enabled: false, reason: 'missing_key' };
    const effort = get(scope === 'assistant' ? 'LLM_ASSISTANT_EFFORT' : 'LLM_ANTHROPIC_EFFORT');
    return {
      enabled: true,
      pricing,
      provider: createAnthropicProvider({
        apiKey,
        model,
        effort: effort === 'medium' || effort === 'high' ? effort : 'low',
      }),
    };
  }
  if (name === 'mistral') {
    const apiKey = get('MISTRAL_API_KEY');
    if (!apiKey) return { enabled: false, reason: 'missing_key' };
    return { enabled: true, pricing, provider: createMistralProvider({ apiKey, model }) };
  }
  return { enabled: false, reason: 'unknown_provider' };
}
