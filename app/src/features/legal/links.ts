// Legal pages hosted on the product domain (GitHub Pages from legal/ in the repository).
export type LegalPage = 'terms' | 'privacy' | 'notice';
export const LEGAL_PAGES: readonly LegalPage[] = ['terms', 'privacy', 'notice'];

const SLUGS: Record<'fr' | 'en', Record<LegalPage, string>> = {
  fr: { terms: 'cgu', privacy: 'confidentialite', notice: 'mentions-legales' },
  en: { terms: 'terms', privacy: 'privacy', notice: 'legal-notice' },
};

export function legalUrl(page: LegalPage, language: string, base?: string): string {
  const lang = language === 'en' ? 'en' : 'fr';
  const root = (base || 'https://dailyedge.trasenel.com').replace(/\/+$/, '');
  return `${root}/${lang}/${SLUGS[lang][page]}.html`;
}
