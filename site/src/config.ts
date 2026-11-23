// Site configuration, resolved at build time (static output).
import {
  APP_STORE_URL,
  MEETING_URL,
  PLAY_STORE_URL,
  SITE_LAUNCH_AT,
  SITE_MODE_OVERRIDE,
} from 'astro:env/server';

import { resolveSiteMode, type SiteMode } from './mode';

export type { SiteMode };

// Decided once per build (see src/mode.ts and docs/exploitation.md)
export const siteMode: SiteMode = resolveSiteMode({
  override: SITE_MODE_OVERRIDE,
  launchAt: SITE_LAUNCH_AT,
});

export const contactEmail = 'contact@dailyedge.fr';

// Legal pages, served by the site itself (lot S5)
export const legalLinks = {
  notice: '/mentions-legales',
  terms: '/cgu',
  privacy: '/confidentialite',
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

// Store links: hidden while empty (apps not published yet)
export const storeLinks = { appStore: APP_STORE_URL, googlePlay: PLAY_STORE_URL };
