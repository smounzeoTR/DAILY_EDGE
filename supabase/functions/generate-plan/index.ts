// generate-plan: computes and saves the plan of a day for the calling user.
// The user comes from the JWT only. Writes go through save_daily_plan (one transaction).
// Body: { "date"?: "YYYY-MM-DD" } (today or tomorrow in the user's time zone; default today).
import { createClient } from '@supabase/supabase-js';

import type { Database } from '../_shared/database.types.ts';
import { addDays } from '../_shared/engine/dates.ts';
import { buildPlan } from '../_shared/engine/index.ts';
import { loadEngineInput, localDate } from './load.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

// Accepts {} or { date }; any other field is rejected (no user id from the client)
async function parseBody(req: Request): Promise<{ date?: string } | null> {
  const text = await req.text();
  if (text.trim() === '') return {};
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  if (keys.some((k) => k !== 'date')) return null;
  const date = (body as { date?: unknown }).date;
  if (date !== undefined && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    return null;
  }
  return date === undefined ? {} : { date };
}

async function savedPlan(db: ReturnType<typeof createClient<Database>>, planId: string) {
  const { data, error } = await db
    .from('daily_plans')
    .select(
      'id, date, mode, program_day, principle_id, why_today, introduced_habit_id, plan_items(id, exercise_id, position, status, rating, proof_value)',
    )
    .eq('id', planId)
    .single();
  if (error) throw error;
  return { ...data, plan_items: [...data.plan_items].sort((a, b) => a.position - b.position) };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'unauthorized' });

  // Server-side client: bypasses RLS, never exposed to the app
  const db = createClient<Database>(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user) return json(401, { error: 'unauthorized' });
  const userId = auth.user.id;

  const body = await parseBody(req);
  if (!body) return json(400, { error: 'invalid_request' });

  try {
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (profileError || !profile) return json(404, { error: 'profile_not_found' });
    if (!profile.onboarded_at) return json(409, { error: 'not_onboarded' });

    const today = localDate(new Date(), profile.timezone);
    const date = body.date ?? today;
    if (date !== today && date !== addDays(today, 1)) {
      return json(400, { error: 'invalid_date' });
    }

    // Touched plan: returned as is, nothing recomputed
    const { data: existing } = await db
      .from('daily_plans')
      .select('id, plan_items(status)')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle();
    if (existing && existing.plan_items.some((i) => i.status !== 'todo')) {
      return json(200, { status: 'unchanged', plan: await savedPlan(db, existing.id) });
    }

    const started = performance.now();
    const input = await loadEngineInput(db, profile, date);
    const decision = buildPlan(input);
    const latencyMs = Math.round(performance.now() - started);

    const { data: saved, error: saveError } = await db.rpc('save_daily_plan', {
      p_user_id: userId,
      p_date: date,
      p_plan: {
        mode: decision.mode,
        program_day: decision.programDay,
        next_program_day: decision.nextProfileProgramDay,
        principle_id: decision.principleId,
        introduced_habit_id: decision.introducedHabitId,
        why_today: decision.whyToday,
        items: decision.items.map((i) => ({ exercise_id: i.exerciseId, position: i.position })),
      },
      p_decision: {
        rules_fired: decision.rulesFired,
        candidates: decision.candidates,
        why: { key: decision.whyKey, params: decision.whyParams, text: decision.whyToday },
        latency_ms: latencyMs,
      },
    });
    if (saveError) throw saveError;
    const result = saved as { plan_id: string; status: string };
    return json(200, { status: result.status, plan: await savedPlan(db, result.plan_id) });
  } catch (error) {
    console.error('generate-plan failed', error);
    return json(500, { error: 'internal_error' });
  }
});
