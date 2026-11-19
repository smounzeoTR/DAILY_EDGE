// Pure helpers for the e-mail + 6-digit code sign-in.
export const OTP_LENGTH = 6;
export const RESEND_COOLDOWN_SECONDS = 30;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// Pragmatic check; the server is the final judge
export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(raw));
}

// Keeps digits only (handles pasted "123 456" or "Code: 123456")
export function normalizeOtp(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, OTP_LENGTH);
}

export function isCompleteOtp(code: string): boolean {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code);
}

export type AuthErrorKey =
  'auth.tooManyRequests' | 'auth.network' | 'auth.invalidCode' | 'common.errorGeneric';

// Maps a Supabase auth error to an i18n key
export function authErrorKey(
  error: { status?: number; code?: string; name?: string } | null,
  context: 'send' | 'verify',
): AuthErrorKey {
  if (!error) return 'common.errorGeneric';
  if (error.status === 429 || error.code === 'over_email_send_rate_limit')
    return 'auth.tooManyRequests';
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'auth.network';
  if (context === 'verify') return 'auth.invalidCode';
  return 'common.errorGeneric';
}
