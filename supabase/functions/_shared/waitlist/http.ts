// HTTP helpers of the public waitlist-* functions: JSON responses, CORS limited to the site.

/** Allowed origins: SITE_URL's origin, plus SITE_EXTRA_ORIGINS (comma-separated, local only). */
export function allowedOrigins(siteUrl: string, extra: string | undefined): string[] {
  const list = [new URL(siteUrl).origin];
  for (const value of (extra ?? '').split(',')) {
    const trimmed = value.trim();
    if (trimmed) list.push(new URL(trimmed).origin);
  }
  return list;
}

export function corsHeaders(
  origin: string | null,
  allowed: readonly string[],
): Record<string, string> {
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '600';
  }
  return headers;
}

export function jsonResponse(status: number, body: unknown, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/**
 * Common request handling: OPTIONS preflight, POST only, origin check (a browser request from
 * another site is refused; requests without Origin, e.g. tests, are accepted), JSON body.
 */
export async function handlePublicPost(
  req: Request,
  allowed: readonly string[],
  handler: (body: unknown, headers: Record<string, string>) => Promise<Response>,
): Promise<Response> {
  const origin = req.headers.get('Origin');
  const headers = corsHeaders(origin, allowed);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' }, headers);
  if (origin && !allowed.includes(origin))
    return jsonResponse(403, { error: 'forbidden_origin' }, headers);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: 'invalid_json' }, headers);
  }
  try {
    return await handler(body, headers);
  } catch (err) {
    console.error('waitlist function failed', err instanceof Error ? err.message : err);
    return jsonResponse(500, { error: 'internal_error' }, headers);
  }
}
