// waitlist-status: current rank of a confirmed sign-up, from its status token.
import { createClient } from '@supabase/supabase-js';

import {
  allowedOrigins,
  handlePublicPost,
  jsonResponse,
  tooManyRequests,
} from '../_shared/waitlist/http.ts';
import { clientIp, ipSourceFrom } from '../_shared/site/clientIp.ts';
import { allowRequest } from '../_shared/site/rateLimit.ts';

import { statusSchema } from '../_shared/waitlist/schemas.ts';
import { waitlistStatus } from '../_shared/waitlist/service.ts';

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing env ${name}`);
  return value;
};

const origins = allowedOrigins(env('SITE_URL'), Deno.env.get('SITE_EXTRA_ORIGINS'));
const ipSource = ipSourceFrom(Deno.env.get('CLIENT_IP_SOURCE'));
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve((req) =>
  handlePublicPost(req, origins, async (body, headers, request) => {
    if (!(await allowRequest(db, 'waitlist-status', clientIp(request.headers, ipSource)))) {
      return tooManyRequests(headers);
    }
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) return jsonResponse(400, { error: 'invalid_input' }, headers);
    const place = await waitlistStatus(db, parsed.data.status_token);
    if (!place) return jsonResponse(404, { error: 'not_found' }, headers);
    return jsonResponse(200, place, headers);
  }),
);
