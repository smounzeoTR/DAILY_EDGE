// The ONE place that decides which client IP the rate limits use (docs/exploitation.md, § IP).
// CLIENT_IP_SOURCE:
// - "cf-connecting-ip" (default, Supabase hosted): set by Cloudflare in front of Supabase, which
//   rejects any request that sends this header itself (checked on recette, 403): not forgeable.
//   The left-most x-forwarded-for value, on the contrary, is whatever the client sent.
// - "xff-rightmost" (local stack only): the entry appended by the local Kong gateway.
export type IpSource = 'cf-connecting-ip' | 'xff-rightmost';

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:]{2,39}$/i;

function valid(value: string | null | undefined): string | null {
  const ip = (value ?? '').trim();
  return ip && (IPV4.test(ip) || (ip.includes(':') && IPV6.test(ip))) ? ip : null;
}

export function ipSourceFrom(value: string | undefined): IpSource {
  return value === 'xff-rightmost' ? 'xff-rightmost' : 'cf-connecting-ip';
}

/** Client IP for the rate limits, or null when the trusted header is absent or malformed. */
export function clientIp(headers: Headers, source: IpSource): string | null {
  if (source === 'cf-connecting-ip') return valid(headers.get('cf-connecting-ip'));
  const entries = (headers.get('x-forwarded-for') ?? '').split(',');
  return valid(entries[entries.length - 1]);
}
