// Shared plan generation (generate-plan and generate-plans-batch use the same code):
// touched plan -> unchanged; otherwise load, buildPlan, save_daily_plan (one transaction).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../database.types.ts';
import { buildPlan, type ISODate } from '../engine/index.ts';
import { loadEngineInput, type Profile } from './load.ts';

export { localDate, type Profile } from './load.ts';

type Client = SupabaseClient<Database>;

export type GenerateResult = {
  status: 'created' | 'recomputed' | 'unchanged';
  plan: Awaited<ReturnType<typeof savedPlan>>;
};

// Server-side client: bypasses RLS, never exposed to the app
export function serviceClient(url: string, serviceKey: string): Client {
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function savedPlan(db: Client, planId: string) {
  const { data, error } = await db
    .from('daily_plans')
    .select(
      'id, date, mode, program_day, principle_id, why_today, introduced_habit_id, generated_at, plan_items(id, exercise_id, position, status, rating, proof_value, origin, adopted)',
    )
    .eq('id', planId)
    .single();
  if (error) throw error;
  return { ...data, plan_items: [...data.plan_items].sort((a, b) => a.position - b.position) };
}

export async function loadProfile(db: Client, userId: string): Promise<Profile | null> {
  const { data, error } = await db.from('profiles').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function generatePlanForUser(
  db: Client,
  profile: Profile,
  date: ISODate,
): Promise<GenerateResult> {
  // Touched plan: returned as is, nothing recomputed
  const { data: existing, error: existingError } = await db
    .from('daily_plans')
    .select('id, plan_items(status, origin)')
    .eq('user_id', profile.user_id)
    .eq('date', date)
    .maybeSingle();
  if (existingError) throw existingError;
  // Only engine items decide: a plan with user additions only stays untouched
  if (existing && existing.plan_items.some((i) => i.origin === 'engine' && i.status !== 'todo')) {
    return { status: 'unchanged', plan: await savedPlan(db, existing.id) };
  }

  const started = performance.now();
  const input = await loadEngineInput(db, profile, date);
  const decision = buildPlan(input);
  const latencyMs = Math.round(performance.now() - started);

  const { data: saved, error: saveError } = await db.rpc('save_daily_plan', {
    p_user_id: profile.user_id,
    p_date: date,
    p_plan: {
      mode: decision.mode,
      program_day: decision.programDay,
      next_program_day: decision.nextProfileProgramDay,
      program_id: decision.programId,
      principle_id: decision.principleId,
      introduced_habit_id: decision.introducedHabitId,
      why_today: decision.whyToday,
      items: decision.items.map((i) => ({
        exercise_id: i.exerciseId,
        position: i.position,
        adopted: i.adopted,
      })),
    },
    p_decision: {
      rules_fired: decision.rulesFired,
      candidates: decision.candidates,
      why: { key: decision.whyKey, params: decision.whyParams, text: decision.whyToday },
      latency_ms: latencyMs,
    },
  });
  if (saveError) throw saveError;
  const result = saved as { plan_id: string; status: GenerateResult['status'] };
  return { status: result.status, plan: await savedPlan(db, result.plan_id) };
}

export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
