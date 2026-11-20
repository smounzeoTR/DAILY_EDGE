import { describe, expect, it } from 'vitest';

import { assertLocal, isLocalSupabaseUrl } from './guard.ts';

describe('seed:demo guard', () => {
  it('accepts local URLs only', () => {
    expect(isLocalSupabaseUrl('http://127.0.0.1:54321')).toBe(true);
    expect(isLocalSupabaseUrl('http://localhost:54321')).toBe(true);
    expect(isLocalSupabaseUrl('https://abcd.supabase.co')).toBe(false);
    expect(isLocalSupabaseUrl('http://192.168.1.10:54321')).toBe(false);
    expect(isLocalSupabaseUrl('not a url')).toBe(false);
  });

  it('throws on a remote project', () => {
    expect(() => assertLocal('https://abcd.supabase.co')).toThrow('non-local');
    expect(() => assertLocal('http://127.0.0.1:54321')).not.toThrow();
  });
});
