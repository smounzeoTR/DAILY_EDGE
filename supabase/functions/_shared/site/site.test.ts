import { describe, expect, it } from 'vitest';

import { altchaConfigFrom } from './altcha.ts';
import { clientIp, ipSourceFrom } from './clientIp.ts';
import { LIMITS } from './rateLimit.ts';

const headers = (values: Record<string, string>) => new Headers(values);

describe('client IP (one place for the trusted header)', () => {
  // Headers as received by the function on Supabase (probe on recette, forged XFF and X-Real-IP)
  const hosted = () =>
    headers({
      'cf-connecting-ip': '213.223.155.226',
      'x-forwarded-for': '213.223.155.226,213.223.155.226, 35.34.105.45',
    });

  it('Supabase hosted: cf-connecting-ip, the client address', () => {
    expect(clientIp(hosted(), 'cf-connecting-ip')).toBe('213.223.155.226');
    expect(clientIp(headers({ 'x-forwarded-for': '203.0.113.7' }), 'cf-connecting-ip')).toBeNull();
  });

  it('on Supabase the right-most x-forwarded-for entry is a gateway: never the hosted source', () => {
    expect(clientIp(hosted(), 'xff-rightmost')).toBe('35.34.105.45');
    expect(ipSourceFrom(undefined)).toBe('cf-connecting-ip');
  });

  it('local stack: the right-most x-forwarded-for entry (appended by Kong), not the forged left one', () => {
    const h = headers({ 'x-forwarded-for': '198.51.100.1, 172.18.0.1' });
    expect(clientIp(h, 'xff-rightmost')).toBe('172.18.0.1');
  });

  it('IPv6 accepted, garbage refused', () => {
    expect(clientIp(headers({ 'cf-connecting-ip': '2a01:e0a:1:2::5' }), 'cf-connecting-ip')).toBe(
      '2a01:e0a:1:2::5',
    );
    expect(clientIp(headers({ 'cf-connecting-ip': 'unknown' }), 'cf-connecting-ip')).toBeNull();
    expect(
      clientIp(headers({ 'cf-connecting-ip': '1.2.3.4; drop' }), 'cf-connecting-ip'),
    ).toBeNull();
  });

  it('defaults to cf-connecting-ip unless the local value is set', () => {
    expect(ipSourceFrom('anything')).toBe('cf-connecting-ip');
    expect(ipSourceFrom('x-real-ip')).toBe('cf-connecting-ip');
    expect(ipSourceFrom('xff-rightmost')).toBe('xff-rightmost');
  });
});

describe('limits', () => {
  it('waitlist-join is generous (shared addresses): 20 per 10 min, 100 per day', () => {
    expect(LIMITS['waitlist-join']).toEqual([
      { max: 20, seconds: 600 },
      { max: 100, seconds: 86_400 },
    ]);
    expect(LIMITS['diagnostic-submit']).toEqual([
      { max: 10, seconds: 600 },
      { max: 50, seconds: 86_400 },
    ]);
  });
});

describe('ALTCHA configuration', () => {
  it('requires the HMAC key, production difficulty by default', () => {
    expect(() => altchaConfigFrom(() => undefined)).toThrow('ALTCHA_HMAC_KEY');
    expect(altchaConfigFrom((n) => (n === 'ALTCHA_HMAC_KEY' ? 'k' : undefined))).toEqual({
      hmacKey: 'k',
      cost: 5_000,
      counterMin: 5_000,
      counterMax: 10_000,
    });
  });
});
