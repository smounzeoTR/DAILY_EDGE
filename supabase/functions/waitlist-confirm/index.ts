// waitlist-confirm: confirms a sign-up with the token of the e-mail link (48 h, single use).
// Returns the rank, the referral code and a status token for the "Ta place est réservée" page.
import { createClient } from '@supabase/supabase-js';

import { allowedOrigins, handlePublicPost, jsonResponse } from '../_shared/waitlist/http.ts';
import { confirmSchema } from '../_shared/waitlist/schemas.ts';
import { confirmWaitlist } from '../_shared/waitlist/service.ts';

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing env ${name}`);
  return value;
};

const origins = allowedOrigins(env('SITE_URL'), Deno.env.get('SITE_EXTRA_ORIGINS'));
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve((req) =>
  handlePublicPost(req, origins, async (body, headers) => {
    const parsed = confirmSchema.safeParse(body);
    if (!parsed.success) return jsonResponse(400, { error: 'invalid_input' }, headers);
    const place = await confirmWaitlist(db, parsed.data.token);
    if (!place) return jsonResponse(410, { error: 'invalid_or_expired' }, headers);
    return jsonResponse(200, place, headers);
  }),
);
