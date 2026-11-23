// Profile of the web diagnostic, from the blocker (site § 7). Two sentences per profile.
import type { DiagnosticAnswers } from './schema.ts';

export type Profile = 'reveur' | 'batisseur' | 'sprinteur' | 'stratege';

export const PROFILES: Record<Profile, { title: string; text: string }> = {
  reveur: {
    title: 'Le rêveur en attente',
    text: 'Tu sais ce que tu veux, mais l’élan retombe avant le premier pas. Un objectif net et un geste minuscule chaque jour suffisent à rallumer la machine.',
  },
  batisseur: {
    title: 'Le bâtisseur dispersé',
    text: 'Les idées ne te manquent pas, c’est le temps qui s’éparpille. Une seule priorité par jour et un plan qui tient en 10 minutes remettent de l’ordre.',
  },
  sprinteur: {
    title: 'Le sprinteur',
    text: 'Tu démarres fort, puis la régularité s’essouffle. De petites habitudes et un plan qui s’allège les jours chargés t’aident à durer.',
  },
  stratege: {
    title: 'Le stratège prudent',
    text: 'Tu réfléchis beaucoup avant d’agir, parfois trop longtemps. Des exercices courts et concrets transforment la préparation en action.',
  },
};

export function profileOf(blocker: DiagnosticAnswers['blocker']): Profile {
  switch (blocker) {
    case 'motivation':
      return 'reveur';
    case 'organisation':
      return 'batisseur';
    case 'constance':
      return 'sprinteur';
    case 'fear':
      return 'stratege';
  }
}
