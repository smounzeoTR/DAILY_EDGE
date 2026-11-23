// diagnostic-confirm-marketing: confirms the marketing consent of a web diagnostic with the token
// of the result e-mail (48 h, single use). The Make webhook (Brevo) follows from the database.
import { createClient } from '@supabase/supabase-js';

import { confirmMarketing } from '../_shared/diagnostic/service.ts';
import { allowedOrigins, handlePublicPost, jsonResponse } from '../_shared/waitlist/http.ts';
import { confirmSchema } from '../_shared/waitlist/schemas.ts';

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
    const ok = await confirmMarketing(db, parsed.data.token);
    if (!ok) return jsonResponse(410, { error: 'invalid_or_expired' }, headers);
    return jsonResponse(200, { ok: true }, headers);
  }),
);
