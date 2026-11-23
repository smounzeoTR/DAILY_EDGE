// Result of the web diagnostic: what the site shows and what the result e-mail contains.
import { renderEmail } from '../mailer/template.ts';
import { PROFILES, type Profile } from './profile.ts';

export interface DiagnosticResult {
  profile: { id: Profile; title: string; text: string };
  program: { id: string; name: string; description: string };
  principle: { title: string; summary: string };
  exercise: { title: string; instructions: string; duration_min: number };
}

export interface StoreLinks {
  appStore: string;
  googlePlay: string;
}

// Same notice whether the e-mail was sent or not (the address is never confirmed as known)
export const EMAIL_NOTICE = 'Ton plan part par e-mail (un envoi par adresse et par jour).';

export function marketingConfirmUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/diagnostic/confirmer#t=${token}`;
}

export function profileResult(profile: Profile): DiagnosticResult['profile'] {
  return { id: profile, ...PROFILES[profile] };
}

/** Result e-mail; the store buttons are hidden while their link is empty. */
export function resultEmail(
  result: DiagnosticResult,
  options: { stores: StoreLinks; confirmUrl: string | null },
) {
  const buttons = [
    ...(options.confirmUrl
      ? [{ label: 'Oui, je veux recevoir les e-mails de Daily Edge', url: options.confirmUrl }]
      : []),
    ...(options.stores.appStore
      ? [{ label: 'Télécharger sur l’App Store', url: options.stores.appStore }]
      : []),
    ...(options.stores.googlePlay
      ? [{ label: 'Télécharger sur Google Play', url: options.stores.googlePlay }]
      : []),
  ];
  const content = renderEmail({
    title: `Ton profil : ${result.profile.title}`,
    intro: [result.profile.text],
    sections: [
      {
        heading: `Ton programme : ${result.program.name}`,
        paragraphs: [result.program.description],
      },
      {
        heading: `Ton premier principe : ${result.principle.title}`,
        paragraphs: [result.principle.summary],
      },
      {
        heading: `À essayer aujourd’hui (${result.exercise.duration_min} min) : ${result.exercise.title}`,
        paragraphs: [result.exercise.instructions],
      },
      ...(options.confirmUrl
        ? [
            {
              heading: 'Les e-mails de Daily Edge',
              paragraphs: [
                'Tu as demandé à recevoir les e-mails de Daily Edge (lancement, principe de la semaine). Confirme ton adresse avec le premier bouton ci-dessous : sans ce clic, tu ne recevras que cet e-mail. Ce lien est valable 48 heures.',
              ],
            },
          ]
        : []),
    ],
    buttons,
    footnote:
      'Tu reçois cet e-mail parce que ton adresse a été saisie dans le diagnostic de dailyedge.fr. Si ce n’est pas toi, ignore-le : ton adresse ne sera ajoutée à aucune liste sans ta confirmation.',
  });
  return { subject: `Ton plan Daily Edge : ${result.program.name}`, ...content };
}
