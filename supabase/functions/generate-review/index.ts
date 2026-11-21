// generate-review: generates the user's weekly review if due (Sunday from 18:00 local time,
// or the previous week if it is missing) and returns the current review.
// The user comes from the JWT only. Idempotent.
// Premium with AI consent: the rules review is returned first (ai_status = pending), then the AI
// writes the summary and rewords the proposals in the background.
import { enrichReview } from '../_shared/ai/enrichReview.ts';
import { isAiEligible } from '../_shared/ai/store.ts';
import { aiContext, inBackground } from '../_shared/plans/aiRuntime.ts';
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

    const clock = localClock(new Date(), profile.timezone);
    const weekStart = reviewWeekStart(clock);
    const generated = await generateReviewForUser(db, profile, weekStart);

    // Current review: the latest one, open for REVIEW_OPEN_DAYS days
    const since = new Date(Date.now() - REVIEW_OPEN_DAYS * 86_400_000).toISOString();
    const { data: review, error } = await db
      .from('weekly_reviews')
      .select('id, week_start, stats, proposals, accepted, generated_at, summary, ai_status')
      .eq('user_id', profile.user_id)
      .gte('generated_at', since)
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    const ai = aiContext(db);
    if (review && review.ai_status === null && ai && (await isAiEligible(db, profile))) {
      // Claimed once (concurrent openings do not enrich twice)
      const { data: claimed, error: claimError } = await db
        .from('weekly_reviews')
        .update({ ai_status: 'pending' })
        .eq('id', review.id)
        .is('ai_status', null)
        .select('id');
      if (claimError) throw claimError;
      if (claimed && claimed.length > 0) {
        review.ai_status = 'pending';
        inBackground(
          () => enrichReview(db, ai, { profile, reviewId: review.id, localDate: clock.date }),
          async () => {
            await db.rpc('apply_review_enrichment', {
              p_review_id: review.id,
              p_result: { status: 'fallback' },
            });
          },
        );
      }
    }
    return json(200, { status: generated.status, review });
  } catch (error) {
    console.error('generate-review failed', error);
    return json(500, { error: 'internal_error' });
  }
});
