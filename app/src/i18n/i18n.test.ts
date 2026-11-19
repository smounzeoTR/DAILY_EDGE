import { describe, expect, it } from 'vitest';

import en from './en.json';
import fr from './fr.json';
import { resolveLanguage } from './language';

function flattenKeys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === 'object' ? flattenKeys(value, path) : [path];
  });
}

function emptyValues(obj: object): string[] {
  return flattenKeys(obj).filter((path) => {
    const value = path
      .split('.')
      .reduce<unknown>((acc, k) => (acc as Record<string, unknown>)[k], obj);
    return typeof value !== 'string' || value.trim() === '';
  });
}

describe('i18n resources', () => {
  it('fr and en have the same keys', () => {
    expect(flattenKeys(en).sort()).toEqual(flattenKeys(fr).sort());
  });

  it('no empty translation', () => {
    expect(emptyValues(fr)).toEqual([]);
    expect(emptyValues(en)).toEqual([]);
  });
});

describe('resolveLanguage', () => {
  it('maps English locales to en', () => {
    expect(resolveLanguage('en')).toBe('en');
    expect(resolveLanguage('EN')).toBe('en');
  });

  it('falls back to French otherwise', () => {
    expect(resolveLanguage('fr')).toBe('fr');
    expect(resolveLanguage('de')).toBe('fr');
    expect(resolveLanguage(null)).toBe('fr');
  });
});
