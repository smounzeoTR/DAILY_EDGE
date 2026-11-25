// The ONE place that decides which client IP the rate limits use (docs/exploitation.md, § 8).
// CLIENT_IP_SOURCE:
// - "x-real-ip" (default, Supabase hosted): written by Supabase's API gateway from the client
//   address (a forged X-Real-IP is overwritten: checked on recette). cf-connecting-ip is NOT
//   usable inside the function: the request crosses Cloudflare twice (supabase.co, then the
//   Edge runtime), and the second hop rewrites it with a gateway address that changes from one
//   request to the next (31 requests from one Mac gave 15 different hashes on recette).
// - "cf-connecting-ip": kept for a deployment where the function is the first hop behind Cloudflare.
// - "xff-rightmost" (local stack only): the entry appended by the local Kong gateway.
// The left-most x-forwarded-for value is whatever the client sent: never used.
export type IpSource = 'x-real-ip' | 'cf-connecting-ip' | 'xff-rightmost';

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:]{2,39}$/i;

function valid(value: string | null | undefined): string | null {
  const ip = (value ?? '').trim();
  return ip && (IPV4.test(ip) || (ip.includes(':') && IPV6.test(ip))) ? ip : null;
}

export function ipSourceFrom(value: string | undefined): IpSource {
  return value === 'xff-rightmost' || value === 'cf-connecting-ip' ? value : 'x-real-ip';
}

/** Client IP for the rate limits, or null when the trusted header is absent or malformed. */
export function clientIp(headers: Headers, source: IpSource): string | null {
  if (source === 'x-real-ip') return valid(headers.get('x-real-ip'));
  if (source === 'cf-connecting-ip') return valid(headers.get('cf-connecting-ip'));
  const entries = (headers.get('x-forwarded-for') ?? '').split(',');
  return valid(entries[entries.length - 1]);
}
