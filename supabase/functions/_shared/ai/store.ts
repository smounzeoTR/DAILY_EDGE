// llm_calls access (server-side client) and AI eligibility.
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../database.types.ts';
import type { LlmCallRecord, LlmFeature, LlmStore } from '../llm/runTask.ts';

type Client = SupabaseClient<Database>;
type Profile = Database['public']['Tables']['profiles']['Row'];

export function supabaseLlmStore(db: Client): LlmStore {
  return {
    async countCalls(userId: string, features: LlmFeature[], localDate: string) {
      const { count, error } = await db
        .from('llm_calls')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('local_date', localDate)
        .in('feature', features)
        .in('outcome', ['success', 'fallback'])
        .gt('attempts', 0);
      if (error) throw error;
      return count ?? 0;
    },
    async findCachedOutput(userId: string, inputHash: string) {
      const { data, error } = await db
        .from('llm_calls')
        .select('output')
        .eq('user_id', userId)
        .eq('input_hash', inputHash)
        .in('outcome', ['success', 'cache_hit'])
        .not('output', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.output ?? null;
    },
    async logCall(r: LlmCallRecord) {
      const { error } = await db.from('llm_calls').insert({
        user_id: r.userId,
        feature: r.feature,
        local_date: r.localDate,
        provider: r.provider,
        model: r.model,
        outcome: r.outcome,
        fallback_reason: r.fallbackReason,
        attempts: r.attempts,
        input_tokens: r.inputTokens,
        output_tokens: r.outputTokens,
        cost_eur: r.costEur,
        latency_ms: r.latencyMs,
        input_hash: r.inputHash,
        output: (r.output ?? null) as Database['public']['Tables']['llm_calls']['Insert']['output'],
        decision_id: r.decisionId ?? null,
        review_id: r.reviewId ?? null,
      });
      if (error) throw error;
    },
  };
}

// AI personalization: premium (is_premium, single point of truth), AI consent,
// account not pending deletion
export async function isAiEligible(db: Client, profile: Profile): Promise<boolean> {
  if (!profile.consent_ai || profile.deletion_requested_at) return false;
  const { data, error } = await db.rpc('is_premium', { p_user_id: profile.user_id });
  if (error) throw error;
  return data === true;
}
