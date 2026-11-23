// Web diagnostic operations on the database (service role), shared by diagnostic-submit and
// diagnostic-confirm-marketing. The client is untyped until database.types.ts is regenerated.
// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Mailer } from '../mailer/mailer.ts';
import { assignPersona, selectProgram, type ProgramRow } from '../onboarding/program.ts';
import { generateToken, hashToken } from '../waitlist/token.ts';
import { profileOf } from './profile.ts';
import {
  marketingConfirmUrl,
  profileResult,
  resultEmail,
  type DiagnosticResult,
  type StoreLinks,
} from './result.ts';
import type { DiagnosticSubmission } from './schema.ts';

type Db = SupabaseClient<any, any, any>;

function check<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what} failed: ${res.error.message}`);
  if (res.data === null) throw new Error(`${what}: not found`);
  return res.data;
}

/** Profile, program (same rule as the onboarding) and day 1 content, from the published catalogue. */
export async function computeResult(
  db: Db,
  answers: DiagnosticSubmission['answers'],
): Promise<DiagnosticResult> {
  const programs = check(
    await db.from('programs').select('id, persona, status').eq('status', 'published').order('id'),
    'programs',
  ) as ProgramRow[];
  const persona = assignPersona({
    priorityDomains: [answers.domain],
    situation: answers.situation,
  });
  const chosen = selectProgram(persona, programs);
  if (!chosen) throw new Error(`no published program for ${persona}`);

  const program = check(
    await db.from('programs').select('id, name_fr, description_fr').eq('id', chosen.id).single(),
    'program',
  ) as any;
  const step = check(
    await db
      .from('program_steps')
      .select('principle_id, minimal_exercise_id')
      .eq('program_id', chosen.id)
      .eq('day_index', 1)
      .single(),
    'program step',
  ) as any;
  const principle = check(
    await db
      .from('principles')
      .select('title_fr, summary_fr')
      .eq('id', step.principle_id)
      .eq('status', 'published')
      .single(),
    'principle',
  ) as any;
  const exercise = check(
    await db
      .from('exercises')
      .select('title_fr, instructions_fr, duration_min')
      .eq('id', step.minimal_exercise_id)
      .eq('status', 'published')
      .single(),
    'exercise',
  ) as any;

  return {
    profile: profileResult(profileOf(answers.blocker)),
    program: { id: chosen.id, name: program.name_fr, description: program.description_fr },
    principle: { title: principle.title_fr, summary: principle.summary_fr },
    exercise: {
      title: exercise.title_fr,
      instructions: exercise.instructions_fr,
      duration_min: exercise.duration_min,
    },
  };
}

/**
 * Saves the diagnostic and sends the result e-mail (at most one per address per 24 h, decided
 * by the database). A failed send releases the reservation; the result is returned anyway.
 */
export async function submitDiagnostic(
  db: Db,
  mailer: Mailer,
  config: { siteUrl: string; stores: StoreLinks },
  input: DiagnosticSubmission,
): Promise<{ result: DiagnosticResult; emailSent: boolean }> {
  const result = await computeResult(db, input.answers);
  const token = input.consent_marketing ? generateToken() : null;
  const saved = check(
    await db.rpc('save_web_diagnostic', {
      p_email: input.email,
      p_answers: input.answers,
      p_profile: result.profile.id,
      p_program_id: result.program.id,
      p_consent_marketing: input.consent_marketing,
      p_utm_source: input.utm_source ?? null,
      p_utm_medium: input.utm_medium ?? null,
      p_utm_campaign: input.utm_campaign ?? null,
      p_landing_path: input.landing_path ?? null,
      p_referral_code: input.referral_code ?? null,
      p_locale: input.locale,
      p_token_hash: token ? await hashToken(token) : null,
    }),
    'save diagnostic',
  ) as any[];
  const row = saved[0] as {
    diagnostic_id: string;
    send_email: boolean;
    marketing_pending: boolean;
  };
  if (!row.send_email) return { result, emailSent: false };

  const confirmUrl =
    row.marketing_pending && token ? marketingConfirmUrl(config.siteUrl, token) : null;
  try {
    await mailer.send({
      to: input.email,
      ...resultEmail(result, { stores: config.stores, confirmUrl }),
    });
    return { result, emailSent: true };
  } catch (err) {
    console.error('diagnostic e-mail failed', err instanceof Error ? err.message : err);
    await db.rpc('release_web_diagnostic_email', { p_diagnostic_id: row.diagnostic_id });
    return { result, emailSent: false };
  }
}

/** Marketing consent confirmed by the e-mail link; false when the link is unknown, used or expired. */
export async function confirmMarketing(db: Db, token: string): Promise<boolean> {
  const { data, error } = await db.rpc('confirm_diagnostic_marketing', {
    p_token_hash: await hashToken(token),
  });
  if (error) throw new Error(`confirm marketing failed: ${error.message}`);
  return data === true;
}
