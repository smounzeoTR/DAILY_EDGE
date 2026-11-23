// Calls to the waitlist-* Edge Functions.
import { PUBLIC_FUNCTIONS_URL } from 'astro:env/client';

export interface Place {
  rank: number;
  referral_code: string;
  confirmed_referrals: number;
}

export async function callFunction(
  name:
    | 'waitlist-join'
    | 'waitlist-confirm'
    | 'waitlist-status'
    | 'diagnostic-submit'
    | 'diagnostic-confirm-marketing',
  body: unknown,
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const res = await fetch(`${PUBLIC_FUNCTIONS_URL.replace(/\/+$/, '')}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, data };
}
