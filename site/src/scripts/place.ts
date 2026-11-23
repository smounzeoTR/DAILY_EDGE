// Fills the "Ta place est réservée" view and its share buttons.
import { track } from './analytics';
import type { Place } from './api';

export function showPlace(place: Place) {
  const root = document.querySelector<HTMLElement>('[data-place]');
  if (!root) return;
  const link = `${window.location.origin}/?ref=${place.referral_code}`;
  const text =
    'Je viens de réserver ma place sur Daily Edge : un principe, un exercice, trois habitudes, 10 minutes par jour. Rejoins-moi :';

  root.querySelector('[data-place-rank]')!.textContent = String(place.rank);
  root.querySelector('[data-place-detail]')!.textContent =
    place.rank <= 100
      ? 'Tu fais partie des 100 premiers : accès prioritaire à la bêta, puis l’offre Fondateurs 48 heures avant tout le monde.'
      : `Encore ${place.rank - 100} places pour entrer dans les 100 premiers, qui accèdent à la bêta en priorité.`;
  root.querySelector('[data-place-referrals]')!.textContent =
    place.confirmed_referrals === 0
      ? ''
      : place.confirmed_referrals === 1
        ? 'Déjà 1 ami confirmé.'
        : `Déjà ${place.confirmed_referrals} amis confirmés.`;
  root.querySelector<HTMLInputElement>('[data-place-link]')!.value = link;
  root.querySelector<HTMLAnchorElement>('[data-share="linkedin"]')!.href =
    `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`;
  root.querySelector<HTMLAnchorElement>('[data-share="whatsapp"]')!.href =
    `https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`;

  const status = root.querySelector<HTMLElement>('[data-share-status]')!;
  root.querySelector('[data-share="copy"]')!.addEventListener('click', async () => {
    const input = root.querySelector<HTMLInputElement>('[data-place-link]')!;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      input.select();
      document.execCommand('copy');
    }
    status.textContent = 'Lien copié.';
    track('referral_shared', { channel: 'copy' });
  });

  for (const channel of ['linkedin', 'whatsapp'] as const) {
    root
      .querySelector(`[data-share="${channel}"]`)!
      .addEventListener('click', () => track('referral_shared', { channel }));
  }
  root.hidden = false;
  root.querySelector<HTMLElement>('[data-place-title]')!.focus();
}
