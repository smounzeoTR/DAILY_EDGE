// generate-plan: computes and saves the plan of a day for the calling user.
// The user comes from the JWT only. Writes go through save_daily_plan (one transaction).
// Body: { "date"?: "YYYY-MM-DD" } (today or tomorrow in the user's time zone; default today).
import { addDays } from '../_shared/engine/dates.ts';
import {
  env,
  generatePlanForUser,
  json,
  loadProfile,
  localDate,
  serviceClient,
} from '../_shared/plans/generatePlan.ts';

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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'unauthorized' });

  const db = serviceClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user) return json(401, { error: 'unauthorized' });

  const body = await parseBody(req);
  if (!body) return json(400, { error: 'invalid_request' });

  try {
    const profile = await loadProfile(db, auth.user.id);
    if (!profile) return json(404, { error: 'profile_not_found' });
    if (!profile.onboarded_at) return json(409, { error: 'not_onboarded' });

    const today = localDate(new Date(), profile.timezone);
    const date = body.date ?? today;
    if (date !== today && date !== addDays(today, 1)) {
      return json(400, { error: 'invalid_date' });
    }

    return json(200, await generatePlanForUser(db, profile, date));
  } catch (error) {
    console.error('generate-plan failed', error);
    return json(500, { error: 'internal_error' });
  }
});
