// Runs one AI task for a user: identical input reused (hash), daily cap per feature,
// 8 s timeout and a single retry, zod validation, then the caller's apply step.
// Every outcome is logged once in llm_calls (through the store). Never throws on AI errors:
// the caller keeps the rules result when `output` is null.
import type { z } from 'zod';

import { LlmError, textOf, type LlmPricing, type LlmProvider, type LlmRequest } from './types.ts';

export const LLM_TIMEOUT_MS = 8000;
export const LLM_MAX_ATTEMPTS = 2;
// Plan and review share this daily cap; the assistant gets its own (lot 9)
export const DAILY_LIMITS = { plan_review: 3 } as const;
export const FEATURE_GROUPS: Record<'plan' | 'review', ('plan' | 'review')[]> = {
  plan: ['plan', 'review'],
  review: ['plan', 'review'],
};

export type LlmFeature = 'plan' | 'review' | 'assistant';
export type LlmOutcome = 'success' | 'fallback' | 'cache_hit' | 'quota_exceeded';

export type LlmCallRecord = {
  userId: string;
  feature: LlmFeature;
  localDate: string;
  provider: string;
  model: string;
  outcome: LlmOutcome;
  fallbackReason: string | null;
  attempts: number;
  inputTokens: number;
  outputTokens: number;
  costEur: number;
  latencyMs: number | null;
  inputHash: string;
  output: unknown;
  decisionId?: string | null;
  reviewId?: string | null;
};

export interface LlmStore {
  // Calls that reached the provider today (success or fallback) for these features
  countCalls(userId: string, features: LlmFeature[], localDate: string): Promise<number>;
  // Latest validated output for an identical input, or null
  findCachedOutput(userId: string, inputHash: string): Promise<unknown | null>;
  logCall(record: LlmCallRecord): Promise<void>;
}

export type RunTaskArgs<T> = {
  provider: LlmProvider;
  pricing: LlmPricing;
  store: LlmStore;
  userId: string;
  feature: 'plan' | 'review';
  localDate: string;
  promptVersion: string;
  request: Omit<LlmRequest, 'signal'>;
  schema: z.ZodType<T>;
  // Checks the schema cannot express: a fallback reason or null
  check: (output: T) => string | null;
  // Applies a valid output: null when applied, else the reason it was not (e.g. plan_touched)
  apply: (output: T) => Promise<string | null>;
  // Keeps the rules result (marks the plan or review as fallback)
  onFallback: (reason: string) => Promise<void>;
  links?: { decisionId?: string | null; reviewId?: string | null };
  timeoutMs?: number;
};

export type RunTaskResult<T> = {
  output: T | null;
  outcome: LlmOutcome;
  fallbackReason: string | null;
};

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function estimateCost(pricing: LlmPricing, inputTokens: number, outputTokens: number) {
  const cost =
    (inputTokens / 1_000_000) * pricing.inputPerMTok +
    (outputTokens / 1_000_000) * pricing.outputPerMTok;
  return Math.round(cost * 1e6) / 1e6;
}

// JSON answer, tolerating a Markdown code fence around it
export function parseJsonAnswer(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(trimmed);
}

type Attempt<T> =
  | { ok: true; output: T; inputTokens: number; outputTokens: number }
  | { ok: false; reason: string; inputTokens: number; outputTokens: number };

async function attemptOnce<T>(args: RunTaskArgs<T>): Promise<Attempt<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? LLM_TIMEOUT_MS);
  try {
    const response = await args.provider.complete({ ...args.request, signal: controller.signal });
    const tokens = {
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    };
    if (response.stopReason === 'max_tokens') return { ok: false, reason: 'max_tokens', ...tokens };
    let raw: unknown;
    try {
      raw = parseJsonAnswer(textOf(response));
    } catch {
      return { ok: false, reason: 'invalid_json', ...tokens };
    }
    const parsed = args.schema.safeParse(raw);
    if (!parsed.success) return { ok: false, reason: 'invalid_output', ...tokens };
    const problem = args.check(parsed.data);
    if (problem) return { ok: false, reason: problem, ...tokens };
    return { ok: true, output: parsed.data, ...tokens };
  } catch (error) {
    const reason = controller.signal.aborted
      ? 'timeout'
      : error instanceof LlmError
        ? error.reason
        : 'provider_error';
    return { ok: false, reason, inputTokens: 0, outputTokens: 0 };
  } finally {
    clearTimeout(timer);
  }
}

export async function runTask<T>(args: RunTaskArgs<T>): Promise<RunTaskResult<T>> {
  const { provider, store } = args;
  const inputHash = await sha256Hex(
    JSON.stringify([args.promptVersion, provider.name, provider.model, args.request]),
  );
  const base = {
    userId: args.userId,
    feature: args.feature,
    localDate: args.localDate,
    provider: provider.name,
    model: provider.model,
    inputHash,
    decisionId: args.links?.decisionId ?? null,
    reviewId: args.links?.reviewId ?? null,
  };
  const log = async (record: Omit<LlmCallRecord, keyof typeof base>) => {
    try {
      await store.logCall({ ...base, ...record });
    } catch (error) {
      console.error('llm_calls insert failed', error);
    }
  };
  const finish = async <R extends RunTaskResult<T>>(
    result: R,
    record: Omit<LlmCallRecord, keyof typeof base | 'outcome' | 'fallbackReason' | 'output'>,
  ): Promise<R> => {
    await log({
      ...record,
      outcome: result.outcome,
      fallbackReason: result.fallbackReason,
      output: result.output,
    });
    return result;
  };
  const safeFallback = async (reason: string) => {
    try {
      await args.onFallback(reason);
    } catch (error) {
      console.error('AI fallback failed', error);
    }
  };
  const noCall = { attempts: 0, inputTokens: 0, outputTokens: 0, costEur: 0, latencyMs: null };

  // Identical input already answered: reused, no provider call, not counted in the cap
  const cached = await store.findCachedOutput(args.userId, inputHash);
  if (cached !== null) {
    const parsed = args.schema.safeParse(cached);
    if (parsed.success && args.check(parsed.data) === null) {
      const notApplied = await args.apply(parsed.data);
      return finish(
        notApplied
          ? { output: null, outcome: 'fallback', fallbackReason: notApplied }
          : { output: parsed.data, outcome: 'cache_hit', fallbackReason: null },
        noCall,
      );
    }
  }

  const used = await store.countCalls(args.userId, FEATURE_GROUPS[args.feature], args.localDate);
  if (used >= DAILY_LIMITS.plan_review) {
    await safeFallback('quota');
    return finish({ output: null, outcome: 'quota_exceeded', fallbackReason: 'quota' }, noCall);
  }

  const started = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let attempts = 0;
  let last: Attempt<T> | null = null;
  while (attempts < LLM_MAX_ATTEMPTS) {
    attempts += 1;
    last = await attemptOnce(args);
    inputTokens += last.inputTokens;
    outputTokens += last.outputTokens;
    if (last.ok) break;
  }
  const record = {
    attempts,
    inputTokens,
    outputTokens,
    costEur: estimateCost(args.pricing, inputTokens, outputTokens),
    latencyMs: Date.now() - started,
  };
  if (!last || !last.ok) {
    const reason = last?.ok === false ? last.reason : 'unknown';
    await safeFallback(reason);
    return finish({ output: null, outcome: 'fallback', fallbackReason: reason }, record);
  }
  const notApplied = await args.apply(last.output);
  return finish(
    notApplied
      ? { output: null, outcome: 'fallback', fallbackReason: notApplied }
      : { output: last.output, outcome: 'success', fallbackReason: null },
    record,
  );
}
