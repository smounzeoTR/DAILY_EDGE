// Premium enrichment of a weekly review (runs in the background): the AI writes the summary
// and rewords the rule proposals. Proposals stay computed by the rules: apply_review_enrichment
// only writes the summary and one text per proposal (types and parameters never change).
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../database.types.ts';
import {
  buildReviewPayload,
  buildReviewRequest,
  checkReviewOutput,
  REVIEW_PROMPT_VERSION,
  ReviewOutputSchema,
} from '../llm/reviewTask.ts';
import { runTask, type LlmStore, type RunTaskResult } from '../llm/runTask.ts';
import type { LlmPricing, LlmProvider } from '../llm/types.ts';
import type { Proposal, ReviewStats } from '../review/buildWeeklyReview.ts';

type Client = SupabaseClient<Database>;
type Profile = Database['public']['Tables']['profiles']['Row'];

type Titled = {
  title_fr: string;
  title_en: string;
};

const pick = (row: Titled | null | undefined, lang: 'fr' | 'en') =>
  row ? (lang === 'en' ? row.title_en : row.title_fr) : '';

export async function enrichReview(
  db: Client,
  ai: { provider: LlmProvider; pricing: LlmPricing; store: LlmStore },
  args: { profile: Profile; reviewId: string; localDate: string },
): Promise<RunTaskResult<unknown>> {
  const { profile } = args;
  const lang = profile.locale === 'en' ? 'en' : 'fr';
  const { data: review, error } = await db
    .from('weekly_reviews')
    .select('id, stats, proposals')
    .eq('id', args.reviewId)
    .single();
  if (error) throw error;
  const stats = review.stats as unknown as ReviewStats;
  const proposals = (review.proposals ?? []) as unknown as Proposal[];

  const [habits, templates, goals] = await Promise.all([
    db
      .from('user_habits')
      .select('id, title, template:habit_templates(title_fr, title_en)')
      .eq('user_id', profile.user_id),
    db.from('habit_templates').select('id, title_fr, title_en'),
    db
      .from('goals')
      .select('title')
      .eq('user_id', profile.user_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1),
  ]);
  for (const result of [habits, templates, goals]) if (result.error) throw result.error;
  const habitTitle = (id: unknown) => {
    const h = (habits.data ?? []).find((row) => row.id === id);
    return h ? (h.title ?? pick(h.template as Titled | null, lang)) : '';
  };
  const templateTitle = (id: unknown) =>
    pick(
      (templates.data ?? []).find((row) => row.id === id),
      lang,
    );

  const payload = buildReviewPayload({
    language: lang,
    weekStart: stats.weekStart,
    weekEnd: stats.weekEnd,
    exercisesDone: stats.exercisesDone,
    exercisesPlanned: stats.exercisesPlanned,
    energyAverage: stats.energyAverage,
    bestDay: stats.bestDay,
    habits: stats.habits.map((h) => ({
      title: habitTitle(h.habitId),
      done: h.done,
      expected: h.expected,
      rate: h.rate,
    })),
    goalTitle: goals.data?.[0]?.title ?? null,
    proposals: proposals.map((p) => {
      const names: Record<string, string> = {};
      if (p.params.user_habit_id) names.habit = habitTitle(p.params.user_habit_id);
      if (p.params.template_id) names.template = templateTitle(p.params.template_id);
      // Internal identifiers are replaced by names
      const params = Object.fromEntries(
        Object.entries(p.params).filter(([key]) => !key.endsWith('_id')),
      );
      return { type: p.type, params, names };
    }),
  });

  const fallback = async () => {
    const { error: e } = await db.rpc('apply_review_enrichment', {
      p_review_id: args.reviewId,
      p_result: { status: 'fallback' },
    });
    if (e) throw e;
  };

  return runTask({
    ...ai,
    userId: profile.user_id,
    feature: 'review',
    localDate: args.localDate,
    promptVersion: REVIEW_PROMPT_VERSION,
    request: buildReviewRequest(payload),
    schema: ReviewOutputSchema,
    check: (output) => checkReviewOutput(output, payload),
    links: { reviewId: args.reviewId },
    apply: async (output) => {
      const { data, error: e } = await db.rpc('apply_review_enrichment', {
        p_review_id: args.reviewId,
        p_result: { status: 'enriched', summary: output.summary, texts: output.proposal_texts },
      });
      if (e) throw e;
      return data === 'applied' ? null : String(data);
    },
    onFallback: fallback,
  });
}
