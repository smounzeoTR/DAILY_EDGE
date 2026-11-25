// Waits for the ALTCHA solution of a form (the widget computes it in the background).
import { loadAltcha } from './altchaLoader';
type AltchaWidget = HTMLElement & {
  verify?: () => void;
  reset?: () => void;
  getState?: () => string;
};

function payloadOf(form: HTMLFormElement): string | null {
  const field = form.querySelector<HTMLInputElement>('input[name="altcha"]');
  return field?.value ? field.value : null;
}

/** The solution to send with the form, or null when it could not be computed in time. */
export async function altchaPayload(
  form: HTMLFormElement,
  timeoutMs = 30_000,
): Promise<string | null> {
  await loadAltcha();
  const ready = payloadOf(form);
  if (ready) return Promise.resolve(ready);
  const widget = form.querySelector<AltchaWidget>('altcha-widget');
  if (!widget) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(payloadOf(form)), timeoutMs);
    widget.addEventListener(
      'verified',
      () => {
        clearTimeout(timer);
        // The hidden field is filled right after the event
        setTimeout(() => resolve(payloadOf(form)), 0);
      },
      { once: true },
    );
    if (widget.getState?.() !== 'verifying') widget.verify?.();
  });
}

/** A solution is accepted once: start a new one after each sending attempt. */
export function resetAltcha(form: HTMLFormElement): void {
  void loadAltcha();
  const widget = form.querySelector<AltchaWidget>('altcha-widget');
  widget?.reset?.();
  widget?.verify?.();
}
