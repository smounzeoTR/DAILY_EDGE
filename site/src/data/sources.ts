// Landing pages by traffic source (/gdiy, /martingale, /linkedin…): same page,
// adapted headline and source code, default UTM values (overridden by the URL's own UTM).
export interface LandingSource {
  slug: string;
  /** Short line above the headline, e.g. who sent the visitor here */
  eyebrow: string;
  headline?: string;
  subheadline?: string;
  /** Source code shown to the visitor and kept with the sign-up */
  code: string;
  utm: { source: string; medium: string; campaign: string };
}

export const sources: LandingSource[] = [
  {
    slug: 'gdiy',
    eyebrow: 'Bienvenue aux auditeurs de GDIY',
    subheadline:
      'Tu viens d’entendre parler de Daily Edge : un principe, un exercice, trois habitudes. 10 minutes par jour, ajustées chaque soir.',
    code: 'GDIY',
    utm: { source: 'gdiy', medium: 'podcast', campaign: 'waitlist' },
  },
  {
    slug: 'martingale',
    eyebrow: 'Bienvenue aux auditeurs de La Martingale',
    headline: 'Tu as lu les livres sur l’argent. Maintenant, applique-les.',
    subheadline:
      'Un programme de 28 jours pour mettre en pratique ce que tu as lu sur l’argent : budget, épargne, objectifs. 10 minutes par jour.',
    code: 'MARTINGALE',
    utm: { source: 'martingale', medium: 'podcast', campaign: 'waitlist' },
  },
  {
    slug: 'linkedin',
    eyebrow: 'Tu arrives de LinkedIn',
    code: 'LINKEDIN',
    utm: { source: 'linkedin', medium: 'social', campaign: 'waitlist' },
  },
];

export const defaultUtm = { source: 'site', medium: 'direct', campaign: 'waitlist' };
