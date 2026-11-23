// Waitlist form: UTM and ?ref from the URL, inline validation, POST to waitlist-join.
import { altchaPayload, resetAltcha } from './altcha';
import { track } from './analytics';
import { callFunction } from './api';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;

function setError(form: HTMLFormElement, input: HTMLInputElement, message: string | null) {
  const error = form.querySelector<HTMLElement>(`#${CSS.escape(input.id)}-error`);
  if (!error) return;
  error.textContent = message ?? '';
  error.hidden = message === null;
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
  const ids = new Set((input.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean));
  if (message) ids.add(error.id);
  else ids.delete(error.id);
  if (ids.size) input.setAttribute('aria-describedby', [...ids].join(' '));
  else input.removeAttribute('aria-describedby');
}

function prefill(form: HTMLFormElement) {
  const params = new URLSearchParams(window.location.search);
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    const field = form.elements.namedItem(key);
    if (value && field instanceof HTMLInputElement) field.value = value.slice(0, 100);
  }
  const ref = params.get('ref')?.trim().toUpperCase();
  const refField = form.elements.namedItem('ref');
  if (ref && /^[A-Z2-9]{6}$/.test(ref) && refField instanceof HTMLInputElement) {
    refField.value = ref;
  }
}

function value(form: HTMLFormElement, name: string): string | undefined {
  const field = form.elements.namedItem(name);
  return field instanceof HTMLInputElement && field.value ? field.value : undefined;
}

function setup(form: HTMLFormElement) {
  prefill(form);
  const email = form.querySelector<HTMLInputElement>('input[name="email"]')!;
  const consent = form.querySelector<HTMLInputElement>('input[name="consent_marketing"]')!;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const status = form.querySelector<HTMLElement>('[data-waitlist-status]')!;
  const label = submit.textContent;

  email.addEventListener('input', () => setError(form, email, null));
  consent.addEventListener('change', () => setError(form, consent, null));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.textContent = '';
    const emailValue = email.value.trim();
    const emailOk = emailValue !== '' && email.checkValidity();
    setError(
      form,
      email,
      emailOk ? null : 'Indique une adresse e-mail valide, par exemple prenom@exemple.fr.',
    );
    setError(
      form,
      consent,
      consent.checked
        ? null
        : 'Coche cette case pour recevoir le lien de confirmation et les nouvelles du lancement.',
    );
    if (!emailOk) return email.focus();
    if (!consent.checked) return consent.focus();

    submit.disabled = true;
    submit.textContent = 'Envoi…';
    try {
      const altcha = await altchaPayload(form);
      const { status: code, data } = await callFunction('waitlist-join', {
        altcha,
        email: emailValue,
        consent_marketing: true,
        ref: value(form, 'ref'),
        utm_source: value(form, 'utm_source'),
        utm_medium: value(form, 'utm_medium'),
        utm_campaign: value(form, 'utm_campaign'),
        landing_path: value(form, 'landing_path'),
        locale: 'fr',
      });
      if (code === 202) {
        track('waitlist_joined', {
          landing_path: value(form, 'landing_path'),
          utm_source: value(form, 'utm_source'),
          referred: Boolean(value(form, 'ref')),
        });
        const done = document.createElement('div');
        done.className = 'waitlist-done';
        done.setAttribute('role', 'status');
        done.tabIndex = -1;
        done.innerHTML =
          '<p class="waitlist-done-title">C’est presque fini.</p>' +
          '<p>Ouvre l’e-mail que nous venons de t’envoyer et clique sur le lien pour confirmer ta place. Il est valable 48 heures.</p>' +
          '<p class="waitlist-done-hint">Rien reçu dans quelques minutes ? Regarde dans les courriers indésirables.</p>';
        form.replaceWith(done);
        done.focus();
        return;
      }
      resetAltcha(form);
      if (code === 400 && data?.field === 'email') {
        setError(form, email, 'Indique une adresse e-mail valide, par exemple prenom@exemple.fr.');
        email.focus();
      } else if (code === 429) {
        status.textContent =
          'Trop de tentatives depuis ta connexion. Réessaie dans quelques minutes.';
      } else if (code === 400 && data?.error === 'altcha') {
        status.textContent = 'La vérification anti-robot n’a pas abouti. Réessaie.';
      } else {
        status.textContent = 'L’envoi n’a pas abouti. Réessaie dans un instant.';
      }
    } catch {
      status.textContent = 'Connexion impossible pour le moment. Vérifie ta connexion et réessaie.';
    } finally {
      submit.disabled = false;
      submit.textContent = label;
    }
  });
}

document.querySelectorAll<HTMLFormElement>('form[data-waitlist-form]').forEach(setup);
