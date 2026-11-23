// Web diagnostic (site § 7): answers, shared by diagnostic-submit, the site and (lot S3b) the app.
// Values are those of the app's enums (domain, situation, chronotype, daily_minutes) so that the
// onboarding can be prefilled with them.
import { z } from 'zod';

import {
  AUTHORS,
  CHRONOTYPES,
  DIAGNOSTIC_BLOCKERS,
  DIAGNOSTIC_MINUTES,
  DOMAINS,
  SITUATIONS,
} from './values.ts';

export { AUTHORS, CHRONOTYPES, DIAGNOSTIC_BLOCKERS, DIAGNOSTIC_MINUTES };

export const answersSchema = z
  .object({
    domain: z.enum(DOMAINS),
    situation: z.enum(SITUATIONS),
    blocker: z.enum(DIAGNOSTIC_BLOCKERS),
    daily_minutes: z.union([z.literal(5), z.literal(15), z.literal(30)]),
    chronotype: z.enum(CHRONOTYPES),
    // Optional question ("Passer"): absent, the authors read, or "none"
    authors: z
      .union([z.array(z.enum(AUTHORS)).min(1).max(AUTHORS.length), z.tuple([z.literal('none')])])
      .optional(),
  })
  .strict()
  .refine((a) => !a.authors || new Set(a.authors).size === a.authors.length, {
    message: 'duplicate authors',
    path: ['authors'],
  });

export type DiagnosticAnswers = z.infer<typeof answersSchema>;

// Tracking values: an unusable value is dropped, never a reason to refuse a diagnostic
const trackingValue = z
  .string()
  .trim()
  .max(100)
  .regex(/^[\w.\-+]+$/)
  .optional()
  .catch(undefined);

export const submitSchema = z.object({
  answers: answersSchema,
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  consent_marketing: z.boolean().default(false),
  utm_source: trackingValue,
  utm_medium: trackingValue,
  utm_campaign: trackingValue,
  landing_path: z
    .string()
    .max(200)
    .regex(/^\/[a-z0-9\-/]*$/)
    .optional()
    .catch(undefined),
  referral_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z2-9]{6}$/)
    .optional()
    .catch(undefined),
  locale: z.enum(['fr', 'en']).catch('fr').default('fr'),
});

export type DiagnosticSubmission = z.infer<typeof submitSchema>;

// Onboarding prefill (lot S3b): app blockers; "constance" has no equivalent in the app
export function appBlockers(
  blocker: DiagnosticAnswers['blocker'],
): ('motivation' | 'organisation' | 'fear')[] {
  return blocker === 'constance' ? [] : [blocker];
}
