// Status token of the "Ta place est réservée" page, kept in this browser only.
// Storage can be unavailable (private mode, blocked site data): every access is guarded.
const KEY = 'dailyedge.waitlist.status';

export function readStatusToken(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeStatusToken(token: string): void {
  try {
    window.localStorage.setItem(KEY, token);
  } catch {
    // Page still works for this visit
  }
}

export function clearStatusToken(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing stored
  }
}

/** Reads `#key=value` from the URL, then removes the fragment (token never left in the address bar). */
export function takeFragment(key: string): string | null {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const value = params.get(key);
  if (window.location.hash) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
