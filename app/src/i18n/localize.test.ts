import { describe, expect, it } from 'vitest';

import { habitText, localized } from './localize';

const template = { title_fr: 'Lire son objectif', title_en: 'Read your goal' };

describe('localized', () => {
  it('picks the column of the language', () => {
    expect(localized(template, 'title', 'fr')).toBe('Lire son objectif');
    expect(localized(template, 'title', 'en')).toBe('Read your goal');
    expect(localized(template, 'missing', 'en')).toBe('');
  });
});

describe('habitText', () => {
  it('shows the template text in the current language when nothing was customized', () => {
    expect(habitText(null, template, 'title', 'en')).toBe('Read your goal');
    expect(habitText('  ', template, 'title', 'fr')).toBe('Lire son objectif');
  });

  it('keeps the user text (custom cue or habit without template)', () => {
    expect(habitText('Après mon café', template, 'title', 'en')).toBe('Après mon café');
    expect(habitText('Marcher', null, 'title', 'fr')).toBe('Marcher');
  });
});
