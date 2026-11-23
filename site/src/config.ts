// Site configuration, resolved at build time (static output).
import { MEETING_URL, SITE_MODE } from 'astro:env/server';

export type SiteMode = 'waitlist' | 'launch';

export const siteMode: SiteMode = SITE_MODE;

export const contactEmail = 'contact@dailyedge.fr';

const legalRoot = 'https://dailyedge.trasenel.com/fr';

export const legalLinks = {
  notice: `${legalRoot}/mentions-legales.html`,
  terms: `${legalRoot}/cgu.html`,
  privacy: `${legalRoot}/confidentialite.html`,
};

// Social profiles: an entry without href is not displayed
export const socialLinks: { label: string; href: string }[] = [
  { label: 'LinkedIn', href: '' },
  { label: 'Instagram', href: '' },
].filter((link) => link.href !== '');

// "Prendre rendez-vous" on /equipes: calendar or form URL, e-mail fallback
export const meetingUrl =
  MEETING_URL || `mailto:${contactEmail}?subject=${encodeURIComponent('Daily Edge Équipes')}`;

export const launchDate = '4 janvier 2027';

export const catalogFacts = {
  principles: 115,
  exercises: 287,
  habits: 42,
  programs: 4,
  programDays: 28,
};

export const pricing = {
  yearly: '119 €',
  monthly: '14,99 €',
  trialDays: 14,
  founders: { price: '249 €', seats: 500 },
  teamsPerUserYearEur: 79,
  teamsMinimumUsers: 10,
};
