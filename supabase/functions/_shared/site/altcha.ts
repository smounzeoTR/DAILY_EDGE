// ALTCHA proof-of-work, self-hosted: challenges created and verified here, no third party, no
// cookie. Secret: ALTCHA_HMAC_KEY. Each solved challenge is accepted once (altcha_mark_used).
// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from '@supabase/supabase-js';
import { createChallenge, randomInt } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { deriveHmacKeySecret, verify } from 'altcha-lib/frameworks/shared';

export const CHALLENGE_TTL_SECONDS = 600;

export interface AltchaConfig {
  hmacKey: string;
  // PBKDF2 iterations and counter range (difficulty); lower on the local stack
  cost: number;
  counterMin: number;
  counterMax: number;
}

export function altchaConfigFrom(get: (name: string) => string | undefined): AltchaConfig {
  const hmacKey = get('ALTCHA_HMAC_KEY');
  if (!hmacKey) throw new Error('missing env ALTCHA_HMAC_KEY');
  const int = (name: string, fallback: number) => {
    const value = Number(get(name));
    return Number.isInteger(value) && value > 0 ? value : fallback;
  };
  return {
    hmacKey,
    cost: int('ALTCHA_COST', 5_000),
    counterMin: int('ALTCHA_COUNTER_MIN', 5_000),
    counterMax: int('ALTCHA_COUNTER_MAX', 10_000),
  };
}

export async function newChallenge(config: AltchaConfig, now = Date.now()) {
  return createChallenge({
    algorithm: 'PBKDF2/SHA-256',
    cost: config.cost,
    counter: randomInt(config.counterMax, config.counterMin),
    deriveKey,
    hmacSignatureSecret: config.hmacKey,
    hmacKeySignatureSecret: await deriveHmacKeySecret(config.hmacKey),
    expiresAt: Math.floor(now / 1000) + CHALLENGE_TTL_SECONDS,
  });
}

/** True when the payload (widget field) solves one of our challenges, not expired, never used. */
export async function verifyAltcha(
  db: SupabaseClient<any, any, any>,
  config: AltchaConfig,
  payload: unknown,
): Promise<boolean> {
  if (typeof payload !== 'string' || payload.length === 0 || payload.length > 10_000) return false;
  const store = {
    get: () => false,
    set: () => undefined,
    setIfAbsent: async (id: string) => {
      const { data, error } = await db.rpc('altcha_mark_used', {
        p_challenge_id: id.slice(0, 200),
        p_expires_at: new Date(Date.now() + (CHALLENGE_TTL_SECONDS + 60) * 1000).toISOString(),
      });
      if (error) throw new Error(`altcha store failed: ${error.message}`);
      return data === true;
    },
  };
  const result = await verify(
    payload,
    deriveKey,
    config.hmacKey,
    await deriveHmacKeySecret(config.hmacKey),
    store,
  );
  return result.error === null;
}
