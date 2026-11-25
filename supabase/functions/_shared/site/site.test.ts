import { describe, expect, it } from 'vitest';

import { altchaConfigFrom } from './altcha.ts';
import { clientIp, ipSourceFrom } from './clientIp.ts';
import { LIMITS } from './rateLimit.ts';

const headers = (values: Record<string, string>) => new Headers(values);

describe('client IP (one place for the trusted header)', () => {
  it('Supabase hosted: x-real-ip (set by the API gateway), never x-forwarded-for', () => {
    const h = headers({
      'x-real-ip': '88.191.219.182',
      'cf-connecting-ip': '172.69.12.34',
      'x-forwarded-for': '203.0.113.7',
    });
    expect(clientIp(h, 'x-real-ip')).toBe('88.191.219.182');
    expect(clientIp(headers({ 'x-forwarded-for': '203.0.113.7' }), 'x-real-ip')).toBeNull();
  });

  it('cf-connecting-ip only when explicitly chosen', () => {
    const h = headers({ 'cf-connecting-ip': '88.191.219.182', 'x-real-ip': '10.0.0.1' });
    expect(clientIp(h, 'cf-connecting-ip')).toBe('88.191.219.182');
  });

  it('local stack: the right-most x-forwarded-for entry (appended by Kong), not the forged left one', () => {
    const h = headers({ 'x-forwarded-for': '198.51.100.1, 172.18.0.1' });
    expect(clientIp(h, 'xff-rightmost')).toBe('172.18.0.1');
  });

  it('IPv6 accepted, garbage refused', () => {
    expect(clientIp(headers({ 'x-real-ip': '2a01:e0a:1:2::5' }), 'x-real-ip')).toBe(
      '2a01:e0a:1:2::5',
    );
    expect(clientIp(headers({ 'x-real-ip': 'unknown' }), 'x-real-ip')).toBeNull();
    expect(clientIp(headers({ 'x-real-ip': '1.2.3.4; drop' }), 'x-real-ip')).toBeNull();
  });

  it('defaults to x-real-ip unless another source is set', () => {
    expect(ipSourceFrom(undefined)).toBe('x-real-ip');
    expect(ipSourceFrom('anything')).toBe('x-real-ip');
    expect(ipSourceFrom('cf-connecting-ip')).toBe('cf-connecting-ip');
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
