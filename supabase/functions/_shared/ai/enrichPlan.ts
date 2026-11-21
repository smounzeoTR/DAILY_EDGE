// Premium enrichment of a plan computed by the rules (runs in the background):
// the AI chooses among the engine candidates (catalogue mode) or keeps the program exercise,
// personalizes the instructions and writes "why today". Applied only if the plan was neither
// recomputed nor touched meanwhile; any failure keeps the rules plan.
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../database.types.ts';
import type { PlanDecision } from '../engine/index.ts';
import {
  buildPlanPayload,
  buildPlanRequest,
  checkPlanOutput,
  MAX_CANDIDATES,
  PLAN_PROMPT_VERSION,
  PlanOutputSchema,
  RECENT_CHECKINS,
} from '../llm/planTask.ts';
import { runTask, type LlmStore, type RunTaskResult } from '../llm/runTask.ts';
import type { LlmPricing, LlmProvider } from '../llm/types.ts';

type Client = SupabaseClient<Database>;
type Profile = Database['public']['Tables']['profiles']['Row'];

export type EnrichPlanArgs = {
  profile: Profile;
  planId: string;
  generatedAt: string;
  decisionId: string | null;
  decision: Pick<
    PlanDecision,
    'items' | 'candidates' | 'mode' | 'programDay' | 'budgetMinutes' | 'whyToday'
  >;
  // User's local date of the call (daily cap)
  localDate: string;
};

async function markFallback(db: Client, planId: string, generatedAt: string) {
  const { error } = await db.rpc('apply_plan_enrichment', {
    p_plan_id: planId,
    p_generated_at: generatedAt,
    p_result: { status: 'fallback' },
  });
  if (error) throw error;
}

export async function enrichPlan(
  db: Client,
  ai: { provider: LlmProvider; pricing: LlmPricing; store: LlmStore },
  args: EnrichPlanArgs,
): Promise<RunTaskResult<unknown> | null> {
  const { profile, decision } = args;
  const language = profile.locale === 'en' ? 'en' : 'fr';
  const programMode = decision.programDay !== null;
  const engineIds = decision.items.map((i) => i.exerciseId);
  if (engineIds.length === 0) {
    await markFallback(db, args.planId, args.generatedAt);
    return null;
  }
  // Program: the engine exercise only; catalogue: the best candidates (engine choice included)
  const candidateIds = programMode
    ? engineIds
    : [...new Set([...engineIds, ...decision.candidates.map((c) => c.exerciseId)])].slice(
        0,
        MAX_CANDIDATES,
      );

  const [goals, checkins, exercises] = await Promise.all([
    db
      .from('goals')
      .select('title, why, target_value, unit, deadline')
      .eq('user_id', profile.user_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1),
    // Numbers only (never the reflection or the note)
    db
      .from('checkins')
      .select('date, energy, mood, minutes_tomorrow')
      .eq('user_id', profile.user_id)
      .order('date', { ascending: false })
      .limit(RECENT_CHECKINS),
    db
      .from('exercises')
      .select(
        'id, title_fr, title_en, instructions_fr, instructions_en, duration_min, energy, difficulty, domain',
      )
      .eq('status', 'published')
      .in('id', candidateIds),
  ]);
  for (const result of [goals, checkins, exercises]) if (result.error) throw result.error;
  const byId = new Map((exercises.data ?? []).map((e) => [e.id, e]));
  const candidates = candidateIds.flatMap((id) => {
    const e = byId.get(id);
    return e ? [e] : [];
  });
  // The engine choice always fits (some relaxations may exceed the nominal budget)
  const engineMinutes = engineIds.reduce((sum, id) => sum + (byId.get(id)?.duration_min ?? 0), 0);

  const payload = buildPlanPayload({
    language,
    mode: programMode ? 'program' : 'catalog',
    planMode: decision.mode,
    programDay: decision.programDay,
    budgetMinutes: Math.max(decision.budgetMinutes, engineMinutes),
    rulesWhy: decision.whyToday,
    profile,
    goal: goals.data?.[0] ?? null,
    checkins: checkins.data ?? [],
    candidates,
    lockedIds: programMode ? engineIds : [],
  });

  return runTask({
    ...ai,
    userId: profile.user_id,
    feature: 'plan',
    localDate: args.localDate,
    promptVersion: PLAN_PROMPT_VERSION,
    request: buildPlanRequest(payload),
    schema: PlanOutputSchema,
    check: (output) => checkPlanOutput(output, payload),
    links: { decisionId: args.decisionId },
    apply: async (output) => {
      const { data, error } = await db.rpc('apply_plan_enrichment', {
        p_plan_id: args.planId,
        p_generated_at: args.generatedAt,
        p_result: {
          status: 'enriched',
          replace: !programMode,
          why_today: output.why_today,
          items: output.items.map((i) => ({
            exercise_id: i.exercise_id,
            instructions: i.instructions,
          })),
        },
      });
      if (error) throw error;
      return data === 'applied' ? null : data === 'stale' ? 'plan_touched' : String(data);
    },
    onFallback: () => markFallback(db, args.planId, args.generatedAt),
  });
}
