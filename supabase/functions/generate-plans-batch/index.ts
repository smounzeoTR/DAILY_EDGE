// generate-plans-batch: hourly fallback generation, called by pg_cron (pg_net).
// Protected by the PLANS_BATCH_SECRET server secret (header x-batch-secret), never by a user JWT.
// For each onboarded user between 2:00 and 5:00 local time without a plan for the local date,
// generates the plan with the same code as generate-plan. At most BATCH_LIMIT users per run.
// Body: {} or { "now": ISO timestamp } (tests only; requires the secret like any call).
import {
  env,
  generatePlanForUser,
  json,
  loadProfile,
  serviceClient,
} from '../_shared/plans/generatePlan.ts';

const BATCH_LIMIT = 200;

// Constant-time comparison of two strings
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function parseNow(req: Request): Promise<Date | null> {
  const text = await req.text();
  if (text.trim() === '') return new Date();
  try {
    const body = JSON.parse(text) as unknown;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
    const keys = Object.keys(body);
    if (keys.some((k) => k !== 'now')) return null;
    const now = (body as { now?: unknown }).now;
    if (now === undefined) return new Date();
    if (typeof now !== 'string') return null;
    const date = new Date(now);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const secret = req.headers.get('x-batch-secret') ?? '';
  if (!secret || !safeEqual(secret, env('PLANS_BATCH_SECRET'))) {
    return json(401, { error: 'unauthorized' });
  }

  const now = await parseNow(req);
  if (!now) return json(400, { error: 'invalid_request' });

  const db = serviceClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: due, error } = await db.rpc('users_due_for_plan', {
    p_now: now.toISOString(),
    p_limit: BATCH_LIMIT,
  });
  if (error) {
    console.error('users_due_for_plan failed', error);
    return json(500, { error: 'internal_error' });
  }

  const summary = { due: due.length, created: 0, unchanged: 0, recomputed: 0, failed: 0 };
  // Sequential on purpose: bounded load on the database
  for (const { user_id: userId, local_date: date } of due) {
    try {
      const profile = await loadProfile(db, userId);
      if (!profile?.onboarded_at) continue;
      const result = await generatePlanForUser(db, profile, date);
      summary[result.status] += 1;
    } catch (err) {
      summary.failed += 1;
      console.error('batch generation failed', userId, err);
    }
  }
  return json(200, summary);
});
