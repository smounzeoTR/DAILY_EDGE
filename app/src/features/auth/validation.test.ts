import { describe, expect, it } from 'vitest';

import {
  authErrorKey,
  isCompleteOtp,
  isValidEmail,
  normalizeEmail,
  normalizeOtp,
} from './validation';

describe('email', () => {
  it('normalizes and validates', () => {
    expect(normalizeEmail('  Sam@Example.COM ')).toBe('sam@example.com');
    expect(isValidEmail('sam@example.com')).toBe(true);
    expect(isValidEmail('sam@example')).toBe(false);
    expect(isValidEmail('sam example.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('otp', () => {
  it('keeps 6 digits only', () => {
    expect(normalizeOtp('123 456')).toBe('123456');
    expect(normalizeOtp('Code : 1234567')).toBe('123456');
    expect(normalizeOtp('12a')).toBe('12');
  });

  it('requires exactly 6 digits', () => {
    expect(isCompleteOtp('123456')).toBe(true);
    expect(isCompleteOtp('12345')).toBe(false);
    expect(isCompleteOtp('12345a')).toBe(false);
  });
});

describe('authErrorKey', () => {
  it('maps rate limits, network and invalid codes', () => {
    expect(authErrorKey({ status: 429 }, 'send')).toBe('auth.tooManyRequests');
    expect(authErrorKey({ name: 'AuthRetryableFetchError' }, 'send')).toBe('auth.network');
    expect(authErrorKey({ status: 403, code: 'otp_expired' }, 'verify')).toBe('auth.invalidCode');
    expect(authErrorKey({ status: 500 }, 'send')).toBe('common.errorGeneric');
  });
});
