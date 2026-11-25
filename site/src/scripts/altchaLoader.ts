// Loads the ALTCHA widget on first use of a form only (it costs ~120 KB of JavaScript to parse):
// external build (strict CSP), PBKDF2 worker served as a file of the site.
let loading: Promise<void> | null = null;

export function loadAltcha(): Promise<void> {
  loading ??= (async () => {
    // Widget styles as a file, added only now (never render-blocking)
    const { default: cssUrl } = await import('altcha/altcha.css?url');
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssUrl;
    document.head.append(link);
    await import('altcha/external');
    const { default: Pbkdf2Worker } = await import('altcha/workers/pbkdf2?worker');
    const registry = (
      globalThis as unknown as {
        $altcha?: { algorithms: { set: (name: string, create: () => Worker) => void } };
      }
    ).$altcha;
    registry?.algorithms.set('PBKDF2/SHA-256', () => new Pbkdf2Worker());
    await customElements.whenDefined('altcha-widget');
  })();
  return loading;
}
