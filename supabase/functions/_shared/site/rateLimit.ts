// Rate limits per IP of the public site functions (hashed IP, salt of the day, see the
// migration 20261213090000_site_abuse.sql). Combined with the per-address e-mail limits.
// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from '@supabase/supabase-js';

export type SiteAction =
  | 'waitlist-join'
  | 'waitlist-confirm'
  | 'waitlist-status'
  | 'diagnostic-submit'
  | 'diagnostic-confirm-marketing'
  | 'altcha-challenge';

type Limit = { max: number; seconds: number };

// waitlist-join is generous: shared addresses of mobile networks, offices, QR codes at events
export const LIMITS: Record<SiteAction, Limit[]> = {
  'waitlist-join': [
    { max: 20, seconds: 600 },
    { max: 100, seconds: 86_400 },
  ],
  'diagnostic-submit': [
    { max: 10, seconds: 600 },
    { max: 50, seconds: 86_400 },
  ],
  'waitlist-confirm': [{ max: 30, seconds: 600 }],
  'waitlist-status': [{ max: 30, seconds: 600 }],
  'diagnostic-confirm-marketing': [{ max: 30, seconds: 600 }],
  'altcha-challenge': [{ max: 60, seconds: 600 }],
};

let warned = false;

/** True when the request may go on. Without a trusted IP, the limit cannot apply (logged once). */
export async function allowRequest(
  db: SupabaseClient<any, any, any>,
  action: SiteAction,
  ip: string | null,
): Promise<boolean> {
  if (!ip) {
    if (!warned) console.warn('rate limit skipped: no trusted client IP (CLIENT_IP_SOURCE)');
    warned = true;
    return true;
  }
  const { data, error } = await db.rpc('site_rate_limit', {
    p_action: action,
    p_ip: ip,
    p_limits: LIMITS[action],
  });
  if (error) throw new Error(`rate limit failed: ${error.message}`);
  return data === true;
}
