// Legal pages, served by the site dailyedge.fr (French at the root, English under /en).
export type LegalPage = 'terms' | 'privacy' | 'notice';
export const LEGAL_PAGES: readonly LegalPage[] = ['terms', 'privacy', 'notice'];

const SLUGS: Record<'fr' | 'en', Record<LegalPage, string>> = {
  fr: { terms: 'cgu', privacy: 'confidentialite', notice: 'mentions-legales' },
  en: { terms: 'terms', privacy: 'privacy', notice: 'legal-notice' },
};

export function legalUrl(page: LegalPage, language: string, base?: string): string {
  const lang = language === 'en' ? 'en' : 'fr';
  const root = (base || 'https://dailyedge.fr').replace(/\/+$/, '');
  return lang === 'fr' ? `${root}/${SLUGS.fr[page]}` : `${root}/en/${SLUGS.en[page]}`;
}
