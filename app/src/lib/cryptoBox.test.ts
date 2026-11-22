import { describe, expect, it } from 'vitest';

import { decryptValue, encryptValue, isEncrypted } from './cryptoBox';

const key = new Uint8Array(32).map((_, i) => i * 7);
const iv = (n: number) => new Uint8Array(16).fill(n);

describe('local value encryption', () => {
  it('round trip, accents and long JSON included', () => {
    const session = JSON.stringify({ access_token: 'a'.repeat(1500), user: { email: 'é@x.fr' } });
    const cipher = encryptValue(session, key, iv(1));
    expect(isEncrypted(cipher)).toBe(true);
    expect(cipher).not.toContain('access_token');
    expect(decryptValue(cipher, key)).toBe(session);
  });
  it('a random IV per write gives different ciphertexts', () => {
    expect(encryptValue('x', key, iv(1))).not.toBe(encryptValue('x', key, iv(2)));
  });
  it('a legacy plain value is recognized', () => {
    expect(isEncrypted('{"access_token":"..."}')).toBe(false);
  });
  it('another key does not give the plain text back', () => {
    const cipher = encryptValue('secret session', key, iv(3));
    expect(decryptValue(cipher, new Uint8Array(32).fill(9))).not.toBe('secret session');
  });
});
