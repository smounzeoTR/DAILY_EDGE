// waitlist-join: public sign-up to the dailyedge.fr waitlist (double opt-in).
// Always answers 202 with the same body, whether the address is new, pending or confirmed.
import { createClient } from '@supabase/supabase-js';

import { mailerFromEnv } from '../_shared/mailer/mailer.ts';
import { allowedOrigins, handlePublicPost, jsonResponse } from '../_shared/waitlist/http.ts';
import { joinSchema } from '../_shared/waitlist/schemas.ts';
import { joinWaitlist } from '../_shared/waitlist/service.ts';

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing env ${name}`);
  return value;
};

const siteUrl = env('SITE_URL');
const origins = allowedOrigins(siteUrl, Deno.env.get('SITE_EXTRA_ORIGINS'));
const mailer = mailerFromEnv((name) => Deno.env.get(name));
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve((req) =>
  handlePublicPost(req, origins, async (body, headers) => {
    const parsed = joinSchema.safeParse(body);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      return jsonResponse(400, { error: 'invalid_input', field }, headers);
    }
    await joinWaitlist(db, mailer, siteUrl, parsed.data);
    return jsonResponse(202, { ok: true }, headers);
  }),
);
