// export-my-data: JSON export of all the caller's data (engine decisions included).
// Available to accounts pending deletion. The user comes from the JWT only.
import { env, json, serviceClient } from '../_shared/plans/generatePlan.ts';

const USER_TABLES = [
  'profiles',
  'subscriptions',
  'goals',
  'user_habits',
  'habit_logs',
  'checkins',
  'daily_plans',
  'plan_items',
  'weekly_reviews',
  'favorites',
  'profile_stats',
  'engine_decisions',
  'llm_calls',
] as const;

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET')
    return json(405, { error: 'method_not_allowed' });
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'unauthorized' });

  const db = serviceClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user) return json(401, { error: 'unauthorized' });
  const userId = auth.user.id;

  try {
    const data: Record<string, unknown[]> = {};
    for (const table of USER_TABLES) {
      const { data: rows, error } = await db.from(table).select('*').eq('user_id', userId);
      if (error) throw error;
      data[table] = rows ?? [];
    }
    const body = {
      format: 'daily-edge-export',
      version: 1,
      exported_at: new Date().toISOString(),
      account: { id: userId, email: auth.user.email, created_at: auth.user.created_at },
      data,
    };
    return new Response(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="daily-edge-export.json"',
      },
    });
  } catch (error) {
    console.error('export-my-data failed', error);
    return json(500, { error: 'internal_error' });
  }
});
