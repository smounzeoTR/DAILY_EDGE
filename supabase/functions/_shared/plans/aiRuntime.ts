// Edge runtime glue for the AI enrichment (Deno only): configuration from the environment
// and background work that continues after the response (EdgeRuntime.waitUntil).
import { supabaseLlmStore } from '../ai/store.ts';
import { llmConfigFromEnv } from '../llm/config.ts';
import type { LlmStore } from '../llm/runTask.ts';
import type { LlmPricing, LlmProvider } from '../llm/types.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../database.types.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

export type AiContext = { provider: LlmProvider; pricing: LlmPricing; store: LlmStore };

// null when the AI is disabled (missing provider, model or key): the rules apply
export function aiContext(db: SupabaseClient<Database>): AiContext | null {
  const config = llmConfigFromEnv((name) => Deno.env.get(name));
  if (!config.enabled) return null;
  return { provider: config.provider, pricing: config.pricing, store: supabaseLlmStore(db) };
}

// Runs after the response is sent; the user never waits for the AI
export function inBackground(task: () => Promise<unknown>, onError: () => Promise<unknown>) {
  const promise = task().catch(async (error) => {
    console.error('AI enrichment failed', error);
    await onError().catch((e) => console.error('AI fallback failed', e));
  });
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(promise);
}
