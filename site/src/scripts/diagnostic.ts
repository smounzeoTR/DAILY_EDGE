// Web diagnostic: steps, progress, back and skip, draft kept in this browser (never the e-mail),
// POST to diagnostic-submit, result shown on the page.
import { callFunction } from './api';

const DRAFT_KEY = 'dailyedge.diagnostic.draft';

type Draft = { step: number; answers: Record<string, string | string[]> };

function readDraft(): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function writeDraft(draft: Draft) {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // The diagnostic still works for this visit
  }
}

function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing stored
  }
}

const quiz = document.querySelector<HTMLElement>('[data-quiz]');
if (quiz) setup(quiz);

function setup(quiz: HTMLElement) {
  const steps = [...quiz.querySelectorAll<HTMLElement>('[data-step]')];
  const total = steps.length;
  const progress = quiz.querySelector<HTMLElement>('[data-progress]')!;
  const bar = quiz.querySelector<HTMLElement>('[data-progress-bar]')!;
  const label = quiz.querySelector<HTMLElement>('[data-progress-label]')!;
  const draft = readDraft();
  let current = 0;

  // Restore the draft (answers of the choice steps only)
  if (draft) {
    for (const [key, value] of Object.entries(draft.answers)) {
      const values = Array.isArray(value) ? value : [value];
      for (const input of quiz.querySelectorAll<HTMLInputElement>(
        `input[name="${CSS.escape(key)}"]`,
      )) {
        input.checked = values.includes(input.value);
      }
    }
  }

  const choiceValue = (key: string): string | string[] | null => {
    const inputs = [...quiz.querySelectorAll<HTMLInputElement>(`input[name="${CSS.escape(key)}"]`)];
    const checked = inputs.filter((i) => i.checked).map((i) => i.value);
    if (inputs[0]?.type === 'checkbox') return checked.length ? checked : null;
    return checked[0] ?? null;
  };

  const answers = () => {
    const out: Record<string, string | string[]> = {};
    for (const step of steps) {
      const key = step.dataset.key!;
      if (key === 'email') continue;
      const value = choiceValue(key);
      if (value !== null) out[key] = value;
    }
    return out;
  };

  const save = () => writeDraft({ step: current, answers: answers() });

  const refreshNext = (step: HTMLElement) => {
    const next = step.querySelector<HTMLButtonElement>('[data-next]');
    if (next) next.disabled = choiceValue(step.dataset.key!) === null;
  };

  const show = (index: number, focus = true) => {
    current = Math.max(0, Math.min(index, total - 1));
    steps.forEach((s, i) => (s.hidden = i !== current));
    label.textContent = `Question ${current + 1} sur ${total}`;
    progress.setAttribute('aria-valuenow', String(current + 1));
    bar.style.width = `${((current + 1) / total) * 100}%`;
    refreshNext(steps[current]!);
    if (focus) steps[current]!.querySelector<HTMLElement>('[data-step-title]')?.focus();
    save();
  };

  for (const step of steps) {
    step.addEventListener('change', (event) => {
      const input = event.target as HTMLInputElement;
      // "Aucun" excludes the authors, and the reverse
      if (input.type === 'checkbox' && input.checked && input.name === 'authors') {
        for (const other of step.querySelectorAll<HTMLInputElement>('input[name="authors"]')) {
          if (other !== input && (input.value === 'none' || other.value === 'none'))
            other.checked = false;
        }
      }
      refreshNext(step);
      save();
    });
    step.querySelector('[data-next]')?.addEventListener('click', () => show(current + 1));
    step.querySelector('[data-back]')?.addEventListener('click', () => show(current - 1));
    step.querySelector('[data-skip]')?.addEventListener('click', () => {
      for (const input of step.querySelectorAll<HTMLInputElement>('input')) input.checked = false;
      show(current + 1);
    });
  }

  show(draft ? Math.min(draft.step, total - 2) : 0, false);
  setupForm(quiz, answers);
}

function setError(form: HTMLFormElement, input: HTMLInputElement, message: string | null) {
  const error = form.querySelector<HTMLElement>(`#${CSS.escape(input.id)}-error`);
  if (!error) return;
  error.textContent = message ?? '';
  error.hidden = message === null;
  if (message) {
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', error.id);
  } else {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  }
}

function setupForm(quiz: HTMLElement, answers: () => Record<string, string | string[]>) {
  const form = quiz.querySelector<HTMLFormElement>('[data-diagnostic-form]')!;
  const email = form.querySelector<HTMLInputElement>('input[name="email"]')!;
  const consent = form.querySelector<HTMLInputElement>('input[name="consent_marketing"]')!;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const status = form.querySelector<HTMLElement>('[data-diagnostic-status]')!;
  const params = new URLSearchParams(window.location.search);
  const param = (key: string) => params.get(key)?.slice(0, 100) || undefined;
  const invalidEmail = 'Indique une adresse e-mail valide, par exemple prenom@exemple.fr.';

  email.addEventListener('input', () => setError(form, email, null));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.textContent = '';
    const value = email.value.trim();
    if (!value || !email.checkValidity()) {
      setError(form, email, invalidEmail);
      email.focus();
      return;
    }
    const raw = answers();
    const payload = {
      answers: {
        ...raw,
        daily_minutes: Number(raw.daily_minutes),
        ...(raw.authors ? { authors: raw.authors } : {}),
      },
      email: value,
      consent_marketing: consent.checked,
      utm_source: param('utm_source'),
      utm_medium: param('utm_medium'),
      utm_campaign: param('utm_campaign'),
      referral_code: param('ref')?.toUpperCase(),
      landing_path: window.location.pathname,
      locale: 'fr',
    };
    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = 'Envoi…';
    try {
      const { status: code, data } = await callFunction('diagnostic-submit', payload);
      if (code === 200 && data) {
        clearDraft();
        showResult(data as unknown as DiagnosticResult);
        return;
      }
      if (code === 400 && data?.field === 'email') {
        setError(form, email, invalidEmail);
        email.focus();
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

interface DiagnosticResult {
  profile: { title: string; text: string };
  program: { name: string; description: string };
  principle: { title: string; summary: string };
  exercise: { title: string; instructions: string; duration_min: number };
  email_notice: string;
}

function showResult(result: DiagnosticResult) {
  const root = document.querySelector<HTMLElement>('[data-result]')!;
  const set = (selector: string, text: string) => {
    root.querySelector(selector)!.textContent = text;
  };
  set('[data-result-profile]', result.profile.title);
  set('[data-result-profile-text]', result.profile.text);
  set('[data-result-program]', result.program.name);
  set('[data-result-program-text]', result.program.description);
  set('[data-result-principle]', result.principle.title);
  set('[data-result-principle-text]', result.principle.summary);
  set(
    '[data-result-exercise]',
    `À essayer aujourd’hui (${result.exercise.duration_min} min) : ${result.exercise.title}`,
  );
  set('[data-result-exercise-text]', result.exercise.instructions);
  set('[data-result-notice]', result.email_notice);
  document.querySelector<HTMLElement>('[data-quiz]')!.hidden = true;
  root.hidden = false;
  root.querySelector<HTMLElement>('[data-result-profile]')!.focus();
}
