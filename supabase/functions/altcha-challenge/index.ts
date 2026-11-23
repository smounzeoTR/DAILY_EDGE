// altcha-challenge: a new ALTCHA proof-of-work challenge for the site forms (GET, no session).
// Self-hosted: signed with ALTCHA_HMAC_KEY, verified by waitlist-join and diagnostic-submit.
import { createClient } from '@supabase/supabase-js';

import { altchaConfigFrom, newChallenge } from '../_shared/site/altcha.ts';
import { clientIp, ipSourceFrom } from '../_shared/site/clientIp.ts';
import { allowRequest } from '../_shared/site/rateLimit.ts';
import {
  allowedOrigins,
  corsHeaders,
  jsonResponse,
  tooManyRequests,
} from '../_shared/waitlist/http.ts';

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing env ${name}`);
  return value;
};

const origins = allowedOrigins(env('SITE_URL'), Deno.env.get('SITE_EXTRA_ORIGINS'));
const ipSource = ipSourceFrom(Deno.env.get('CLIENT_IP_SOURCE'));
const altcha = altchaConfigFrom((name) => Deno.env.get(name));
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  const headers = corsHeaders(origin, origins);
  headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'GET') return jsonResponse(405, { error: 'method_not_allowed' }, headers);
  if (origin && !origins.includes(origin)) {
    return jsonResponse(403, { error: 'forbidden_origin' }, headers);
  }
  try {
    if (!(await allowRequest(db, 'altcha-challenge', clientIp(req.headers, ipSource)))) {
      return tooManyRequests(headers);
    }
    return jsonResponse(200, await newChallenge(altcha), headers);
  } catch (err) {
    console.error('public function failed', err instanceof Error ? err.message : err);
    return jsonResponse(500, { error: 'internal_error' }, headers);
  }
});
