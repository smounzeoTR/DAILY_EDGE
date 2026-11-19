// Pure helper, kept free of native imports so Vitest can test it
export const supportedLanguages = ['fr', 'en'] as const;
export type Language = (typeof supportedLanguages)[number];
export const defaultLanguage: Language = 'fr';

export function resolveLanguage(languageCode: string | null | undefined): Language {
  const code = languageCode?.toLowerCase().slice(0, 2);
  return code === 'en' ? 'en' : defaultLanguage;
}
