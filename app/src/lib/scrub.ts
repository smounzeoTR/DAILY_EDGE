// Monitoring without personal data (pure): no user, no request body, no typed text, no e-mail,
// no token, no id in the error events and their breadcrumbs.
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const JWT = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const QUERY = /\?[^\s"']*/g;

export function scrubText(text: string): string {
  return text
    .replace(JWT, '[token]')
    .replace(EMAIL, '[email]')
    .replace(UUID, '[id]')
    .replace(QUERY, '');
}

type Breadcrumb = { category?: string; message?: string; data?: Record<string, unknown> };
type ErrorEvent = {
  user?: unknown;
  request?: unknown;
  extra?: unknown;
  message?: string;
  breadcrumbs?: Breadcrumb[];
  exception?: { values?: { value?: string }[] };
  contexts?: Record<string, Record<string, unknown> | undefined>;
};

// Typed text and console output never leave the device
const DROPPED_CATEGORIES = new Set(['ui.input', 'console', 'xhr', 'fetch']);

export function scrubBreadcrumb<B extends Breadcrumb>(crumb: B): B | null {
  if (crumb.category && DROPPED_CATEGORIES.has(crumb.category)) return null;
  return {
    ...crumb,
    message: crumb.message ? scrubText(crumb.message) : crumb.message,
    data: undefined,
  };
}

export function scrubEvent<E extends ErrorEvent>(event: E): E {
  const scrubbed: E = { ...event, user: undefined, request: undefined, extra: undefined };
  if (scrubbed.message) scrubbed.message = scrubText(scrubbed.message);
  if (scrubbed.exception?.values) {
    scrubbed.exception = {
      ...scrubbed.exception,
      values: scrubbed.exception.values.map((v) => ({
        ...v,
        value: v.value ? scrubText(v.value) : v.value,
      })),
    };
  }
  if (scrubbed.breadcrumbs) {
    scrubbed.breadcrumbs = scrubbed.breadcrumbs
      .map((b) => scrubBreadcrumb(b))
      .filter((b): b is Breadcrumb => b !== null);
  }
  if (scrubbed.contexts?.device) {
    scrubbed.contexts = {
      ...scrubbed.contexts,
      device: { ...scrubbed.contexts.device, name: undefined },
    };
  }
  return scrubbed;
}
