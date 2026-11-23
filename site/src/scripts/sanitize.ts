// Filtering of every PostHog event before it leaves the browser (pure, tested in tests/site):
// no value that looks like an e-mail, no URL fragment (tokens live there), no query parameter
// other than utm_* and ref.
export const EMAIL_PATTERN = /[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}/i;

// Property names that could carry an e-mail: never sent
export const PROPERTY_DENYLIST = [
  'email',
  '$email',
  'e-mail',
  'mail',
  'user_email',
  'to',
  'recipient',
  'name',
  '$name',
];

const URL_KEYS = new Set([
  '$current_url',
  '$referrer',
  '$initial_referrer',
  '$initial_current_url',
  '$session_entry_url',
]);

export function cleanUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (!key.startsWith('utm_') && key !== 'ref') url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return '';
  }
}

function cleanValue(key: string, value: unknown): unknown {
  if (typeof value === 'string') {
    if (URL_KEYS.has(key)) return cleanUrl(value);
    return EMAIL_PATTERN.test(value) ? undefined : value;
  }
  if (Array.isArray(value))
    return value.map((v) => cleanValue('', v)).filter((v) => v !== undefined);
  if (value && typeof value === 'object') return cleanProperties(value as Record<string, unknown>);
  return value;
}

export function cleanProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (PROPERTY_DENYLIST.includes(key.toLowerCase())) continue;
    const cleaned = cleanValue(key, value);
    if (cleaned !== undefined) out[key] = cleaned;
  }
  return out;
}

type CaptureLike = { event: string; properties?: Record<string, unknown> };

/** before_send hook: a cleaned copy of the event (null drops it). */
export function sanitizeEvent<T extends CaptureLike>(event: T | null): T | null {
  if (!event) return null;
  if (EMAIL_PATTERN.test(event.event)) return null;
  const out = { ...event } as T & Record<string, unknown>;
  if (event.properties) out.properties = cleanProperties(event.properties);
  for (const key of ['$set', '$set_once']) {
    const value = out[key];
    if (value && typeof value === 'object') {
      (out as Record<string, unknown>)[key] = cleanProperties(value as Record<string, unknown>);
    }
  }
  return out;
}
