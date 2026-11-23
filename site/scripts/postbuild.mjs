// After `astro build`: writes the Cloudflare Pages _headers, robots.txt and sitemap.xml of the
// environment, then refuses any inline script, style element or style attribute (strict CSP).
// DEPLOY_ENV: production | recette | local (local = production rules, for the tests).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const env = process.env.DEPLOY_ENV || 'local';
if (!['production', 'recette', 'local'].includes(env)) throw new Error(`DEPLOY_ENV ${env}`);
const origin = (process.env.SITE_ORIGIN || 'https://dailyedge.fr').replace(/\/+$/, '');
const functionsOrigin = new URL(
  process.env.PUBLIC_FUNCTIONS_URL || 'http://127.0.0.1:54321/functions/v1',
).origin;
const posthog = process.env.PUBLIC_POSTHOG_KEY ? 'https://eu.i.posthog.com' : '';
const hstsMaxAge = Number(process.env.HSTS_MAX_AGE || 86400);

// Pages that are not meant to be found by search engines
const NOT_LISTED = ['/404', '/confirmer', '/ma-place', '/diagnostic/confirmer'];

const pages = readdirSync(dist, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith('.html'));

// ---- Strict CSP: no inline code (JSON-LD data blocks are not executed: allowed)
const problems = [];
for (const page of pages) {
  const html = readFileSync(join(dist, page), 'utf8');
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const attrs = m[1];
    if (/type="application\/ld\+json"/.test(attrs)) continue;
    if (!/\bsrc=/.test(attrs) || m[2].trim() !== '') problems.push(`${page}: inline <script>`);
  }
  if (/<style\b/.test(html)) problems.push(`${page}: <style> element`);
  if (/\sstyle="/.test(html)) problems.push(`${page}: style attribute`);
}
if (problems.length > 0) {
  console.error(`Strict CSP: inline code found\n${problems.join('\n')}`);
  process.exit(1);
}

// ---- _headers
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' ${functionsOrigin}${posthog ? ` ${posthog}` : ''}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const security = [
  `Content-Security-Policy: ${csp}`,
  // No includeSubDomains / preload for now (docs/dns-migration.md: HTTPS of every subdomain)
  `Strict-Transport-Security: max-age=${hstsMaxAge}`,
  'Referrer-Policy: strict-origin-when-cross-origin',
  'Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  'X-Content-Type-Options: nosniff',
  'Cross-Origin-Opener-Policy: same-origin',
];

const rules = [
  '/*',
  ...security.map((h) => `  ${h}`),
  '  Cache-Control: public, max-age=0, must-revalidate',
  ...(env === 'recette' ? ['  X-Robots-Tag: noindex, nofollow'] : []),
  '',
  // Versioned files (hash in the name): cached for a year
  '/_astro/*',
  '  ! Cache-Control',
  '  Cache-Control: public, max-age=31536000, immutable',
  '',
];
if (env !== 'recette') {
  // Only dailyedge.fr is indexed: never the *.pages.dev addresses of the project
  rules.push('https://:project.pages.dev/*', '  X-Robots-Tag: noindex, nofollow', '');
}
writeFileSync(join(dist, '_headers'), `${rules.join('\n')}\n`);

// ---- robots.txt and sitemap.xml
// Pages marked noindex (e.g. /diagnostic in waitlist mode) are not listed either
const listed = pages
  .filter((p) => !/<meta name="robots" content="noindex/.test(readFileSync(join(dist, p), 'utf8')))
  .map((p) => `/${p.replace(/\.html$/, '')}`.replace(/\/index$/, '/'))
  .filter((p) => !NOT_LISTED.includes(p) && !p.startsWith('/kit'))
  .sort();
if (env === 'recette') {
  writeFileSync(join(dist, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
} else {
  writeFileSync(
    join(dist, 'robots.txt'),
    `User-agent: *\nAllow: /\nDisallow: /confirmer\nDisallow: /ma-place\nDisallow: /diagnostic/confirmer\n\nSitemap: ${origin}/sitemap.xml\n`,
  );
  const urls = listed.map((p) => `  <url><loc>${origin}${p === '/' ? '/' : p}</loc></url>`);
  writeFileSync(
    join(dist, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
  );
}
console.log(
  `postbuild (${env}): ${relative(process.cwd(), join(dist, '_headers'))}, robots.txt${env === 'recette' ? '' : ', sitemap.xml'} (${listed.length} pages listed)`,
);
