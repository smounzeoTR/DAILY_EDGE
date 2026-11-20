// generate-review: generates the user's weekly review if due (Sunday from 18:00 local time,
// or the previous week if it is missing) and returns the current review.
// The user comes from the JWT only. Idempotent.
import { env, json, loadProfile, serviceClient } from '../_shared/plans/generatePlan.ts';
import {
  generateReviewForUser,
  localClock,
  REVIEW_OPEN_DAYS,
  reviewWeekStart,
} from '../_shared/review/generateReview.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'unauthorized' });

  const db = serviceClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user) return json(401, { error: 'unauthorized' });

  // No parameters: never a user id or a week from the client
  const text = await req.text();
  if (text.trim() !== '' && text.trim() !== '{}') return json(400, { error: 'invalid_request' });

  try {
    const profile = await loadProfile(db, auth.user.id);
    if (!profile) return json(404, { error: 'profile_not_found' });
    if (!profile.onboarded_at) return json(409, { error: 'not_onboarded' });
    if (profile.deletion_requested_at) return json(409, { error: 'deletion_requested' });

    const weekStart = reviewWeekStart(localClock(new Date(), profile.timezone));
    const generated = await generateReviewForUser(db, profile, weekStart);

    // Current review: the latest one, open for REVIEW_OPEN_DAYS days
    const since = new Date(Date.now() - REVIEW_OPEN_DAYS * 86_400_000).toISOString();
    const { data: review, error } = await db
      .from('weekly_reviews')
      .select('id, week_start, stats, proposals, accepted, generated_at')
      .eq('user_id', profile.user_id)
      .gte('generated_at', since)
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return json(200, { status: generated.status, review });
  } catch (error) {
    console.error('generate-review failed', error);
    return json(500, { error: 'internal_error' });
  }
});
