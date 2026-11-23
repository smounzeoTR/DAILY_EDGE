import { describe, expect, it } from 'vitest';

import { legalUrl } from './links';

describe('legal page links', () => {
  it('French pages by default, on the product domain', () => {
    expect(legalUrl('terms', 'fr')).toBe('https://dailyedge.trasenel.com/fr/cgu.html');
    expect(legalUrl('privacy', 'de')).toBe(
      'https://dailyedge.trasenel.com/fr/confidentialite.html',
    );
  });
  it('English pages and a configured base', () => {
    expect(legalUrl('notice', 'en', 'https://example.test/')).toBe(
      'https://example.test/en/legal-notice.html',
    );
  });
});
