// diagnostic-submit: web diagnostic of dailyedge.fr (launch mode). Validates the answers, computes
// profile and program server side (same rule as the onboarding), saves them, sends the result
// e-mail (one per address per 24 h) and returns the result to show.
import { createClient } from '@supabase/supabase-js';

import { EMAIL_NOTICE } from '../_shared/diagnostic/result.ts';
import { submitSchema } from '../_shared/diagnostic/schema.ts';
import { submitDiagnostic } from '../_shared/diagnostic/service.ts';
import { mailerFromEnv } from '../_shared/mailer/mailer.ts';
import {
  allowedOrigins,
  handlePublicPost,
  jsonResponse,
  tooManyRequests,
} from '../_shared/waitlist/http.ts';
import { clientIp, ipSourceFrom } from '../_shared/site/clientIp.ts';
import { allowRequest } from '../_shared/site/rateLimit.ts';
import { altchaConfigFrom, verifyAltcha } from '../_shared/site/altcha.ts';

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing env ${name}`);
  return value;
};

const siteUrl = env('SITE_URL');
const origins = allowedOrigins(siteUrl, Deno.env.get('SITE_EXTRA_ORIGINS'));
const mailer = mailerFromEnv((name) => Deno.env.get(name));
const stores = {
  appStore: Deno.env.get('APP_STORE_URL') ?? '',
  googlePlay: Deno.env.get('PLAY_STORE_URL') ?? '',
};
const ipSource = ipSourceFrom(Deno.env.get('CLIENT_IP_SOURCE'));
const altcha = altchaConfigFrom((name) => Deno.env.get(name));
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve((req) =>
  handlePublicPost(req, origins, async (body, headers, request) => {
    if (!(await allowRequest(db, 'diagnostic-submit', clientIp(request.headers, ipSource)))) {
      return tooManyRequests(headers);
    }
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path.join('.');
      return jsonResponse(400, { error: 'invalid_input', field }, headers);
    }
    // Proof-of-work of the ALTCHA widget (field "altcha"), each challenge accepted once
    const payload = (body as { altcha?: unknown } | null)?.altcha;
    if (!(await verifyAltcha(db, altcha, payload))) {
      return jsonResponse(400, { error: 'altcha' }, headers);
    }
    const { result } = await submitDiagnostic(db, mailer, { siteUrl, stores }, parsed.data);
    // Same answer whether the e-mail was sent or not
    return jsonResponse(200, { ...result, email_notice: EMAIL_NOTICE }, headers);
  }),
);
