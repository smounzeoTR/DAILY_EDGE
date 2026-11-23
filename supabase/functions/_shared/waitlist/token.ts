// Waitlist tokens: 32 random bytes (base64url, 43 characters); only the SHA-256 hash is stored.
// Confirm tokens: valid 48 hours, single use. Status tokens ("Ta place est réservée"): 90 days.

export const CONFIRM_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;
export const STATUS_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function tokenExpiry(kind: 'confirm' | 'status', now: Date): Date {
  return new Date(
    now.getTime() + (kind === 'confirm' ? CONFIRM_TOKEN_TTL_MS : STATUS_TOKEN_TTL_MS),
  );
}

export type TokenState = 'valid' | 'expired' | 'used';

export function tokenState(
  token: { expires_at: string; used_at: string | null },
  now: Date,
): TokenState {
  if (token.used_at !== null) return 'used';
  return new Date(token.expires_at).getTime() > now.getTime() ? 'valid' : 'expired';
}
