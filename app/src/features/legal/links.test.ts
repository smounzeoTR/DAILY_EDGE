import { describe, expect, it } from 'vitest';

import { legalUrl } from './links';

describe('legal page links', () => {
  it('French pages by default, on dailyedge.fr', () => {
    expect(legalUrl('terms', 'fr')).toBe('https://dailyedge.fr/cgu');
    expect(legalUrl('privacy', 'de')).toBe('https://dailyedge.fr/confidentialite');
    expect(legalUrl('notice', 'fr')).toBe('https://dailyedge.fr/mentions-legales');
  });
  it('English pages under /en and a configured base', () => {
    expect(legalUrl('terms', 'en')).toBe('https://dailyedge.fr/en/terms');
    expect(legalUrl('notice', 'en', 'https://recette.dailyedge.fr/')).toBe(
      'https://recette.dailyedge.fr/en/legal-notice',
    );
  });
});
