// Input validation of the waitlist-* Edge Functions.
import { z } from 'zod';

import { normalizeReferralCode } from './referral.ts';
import { TOKEN_PATTERN } from './token.ts';

// Tracking values: an unusable value is dropped, never a reason to refuse a sign-up
const utmValue = z
  .string()
  .trim()
  .max(100)
  .regex(/^[\w.\-+]+$/)
  .optional()
  .catch(undefined);

export const joinSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  consent_marketing: z.literal(true),
  ref: z
    .unknown()
    .transform((value) => normalizeReferralCode(value))
    .optional(),
  utm_source: utmValue,
  utm_medium: utmValue,
  utm_campaign: utmValue,
  landing_path: z
    .string()
    .max(200)
    .regex(/^\/[a-z0-9\-/]*$/)
    .optional()
    .catch(undefined),
  locale: z.enum(['fr', 'en']).catch('fr').default('fr'),
});

export type JoinInput = z.infer<typeof joinSchema>;

export const confirmSchema = z.object({ token: z.string().regex(TOKEN_PATTERN) });
export const statusSchema = z.object({ status_token: z.string().regex(TOKEN_PATTERN) });
