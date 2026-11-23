// Referral codes: 6 characters without look-alikes (no 0/O, 1/I/L), shared as ?ref=XXXXXX.

export const REFERRAL_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const REFERRAL_CODE_PATTERN = /^[A-Z2-9]{6}$/;

export function generateReferralCode(): string {
  // Rejection sampling: uniform over the alphabet
  const limit = 256 - (256 % REFERRAL_ALPHABET.length);
  let code = '';
  while (code.length < 6) {
    for (const b of crypto.getRandomValues(new Uint8Array(12))) {
      if (b < limit && code.length < 6) code += REFERRAL_ALPHABET[b % REFERRAL_ALPHABET.length];
    }
  }
  return code;
}

/** Normalized code, or null when the value cannot be a referral code. */
export function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

export function referralLink(siteUrl: string, code: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/?ref=${code}`;
}
