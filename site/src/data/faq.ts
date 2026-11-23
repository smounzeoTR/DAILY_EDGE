export interface FaqItem {
  question: string;
  answer: string;
}

export const faq: FaqItem[] = [
  {
    question: 'Daily Edge est-il gratuit ?',
    answer:
      'Oui. Le programme de 28 jours, le principe et l’exercice du jour, les habitudes et le check-in du soir sont gratuits, sans limite de durée. Premium ajoute la personnalisation par l’IA, le bilan de la semaine rédigé et Coach Edge. Les 14 premiers jours de Premium sont offerts, sans carte bancaire.',
  },
  {
    question: 'Combien de temps faut-il y consacrer chaque jour ?',
    answer:
      'Environ 10 minutes. Chaque soir, tu indiques le temps dont tu disposes le lendemain (5, 15 ou 30 minutes) et le plan s’ajuste. Les jours chargés, une version courte suffit.',
  },
  {
    question: 'Quelle différence avec une app de résumés de livres ?',
    answer:
      'Daily Edge ne te fait pas lire un résumé de plus. Chaque jour, un seul principe, puis un exercice concret à faire aujourd’hui et de petites habitudes. Le plan du lendemain tient compte de ce que tu as vraiment fait.',
  },
  {
    question: 'Où sont stockées mes données ?',
    answer:
      'En Europe, chez des hébergeurs européens ou dans leurs régions de l’Union européenne. Elles ne sont jamais revendues. Depuis l’app, tu peux exporter tes données ou supprimer ton compte à tout moment.',
  },
  {
    question: 'L’IA lit-elle ce que j’écris ?',
    answer:
      'Non. Tes notes et tes réflexions ne sont jamais lues par l’IA. La personnalisation par l’IA est facultative : elle ne reçoit que ton programme et ton rythme, sans ton nom ni ton e-mail. Seul un texte que tu choisis toi-même de partager avec Coach Edge lui est transmis.',
  },
  {
    question: 'Comment annuler mon abonnement ?',
    answer:
      'En deux gestes, depuis les réglages d’abonnement de ton téléphone (App Store ou Google Play). Tu gardes Premium jusqu’à la fin de la période payée. Pour la liste d’attente, chaque e-mail contient un lien de désinscription.',
  },
  {
    question: 'Quand l’app sera-t-elle disponible ?',
    answer:
      'Le 4 janvier 2027, sur iPhone et Android. Les 100 premiers de la liste d’attente accèdent à la bêta en priorité, puis reçoivent l’offre Fondateurs 48 heures avant tout le monde.',
  },
  {
    question: 'Comment gagner des places dans la liste d’attente ?',
    answer:
      'Une fois ton inscription confirmée, tu reçois un lien personnel. Chaque personne qui s’inscrit avec ton lien et confirme son adresse te fait gagner 10 places.',
  },
];
