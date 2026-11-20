// The demo seed only ever runs against a local Supabase stack.
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function isLocalSupabaseUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function assertLocal(url: string): void {
  if (!isLocalSupabaseUrl(url)) {
    throw new Error(`seed:demo refuses to run on a non-local Supabase URL (${url})`);
  }
}
