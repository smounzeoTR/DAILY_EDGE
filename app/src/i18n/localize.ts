// Pick the *_fr / *_en column of a catalogue row for the current language.
import type { Language } from './language';

export function localized(row: object, field: string, language: Language): string {
  const value = (row as Record<string, unknown>)[`${field}_${language}`];
  return typeof value === 'string' ? value : '';
}

// Template-based habits store only user changes: own value first, else the template text
export function habitText(
  own: string | null,
  templateRow: object | null,
  field: string,
  language: Language,
): string {
  if (own !== null && own.trim() !== '') return own;
  return templateRow ? localized(templateRow, field, language) : '';
}
