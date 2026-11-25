// Checks a deployed site (after each deployment, before going further):
// key pages, security headers, no third-party script nor Cloudflare injection, noindex outside
// dailyedge.fr, and for production the www redirect, robots.txt and sitemap.xml.
// Usage: node scripts/remote-check.mjs --base https://recette.dailyedge.fr --env recette
//          [--pages-dev https://dailyedge-site.pages.dev] [--expect-mode waitlist|launch]
// Cloudflare Access (recette): CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET (service token).
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    base: { type: 'string' },
    env: { type: 'string' },
    'pages-dev': { type: 'string' },
    'expect-mode': { type: 'string' },
  },
});
const base = (values.base ?? '').replace(/\/+$/, '');
const env = values.env;
if (!base || !['production', 'recette'].includes(env ?? '')) {
  console.error('usage: --base <url> --env production|recette');
  process.exit(2);
}
const access =
  process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET
    ? {
        'CF-Access-Client-Id': process.env.CF_ACCESS_CLIENT_ID,
        'CF-Access-Client-Secret': process.env.CF_ACCESS_CLIENT_SECRET,
      }
    : {};

const PAGES = ['/', '/diagnostic', '/equipes', '/cgu', '/confidentialite', '/mentions-legales'];
const failures = [];
const check = (ok, text) => {
  console.log(`${ok ? '✅' : '❌'} ${text}`);
  if (!ok) failures.push(text);
};
const once = (url, init = {}) =>
  fetch(url, { redirect: 'manual', ...init, headers: { ...access, ...(init.headers ?? {}) } });

// A deployment that has just been published can answer 5xx for a few seconds at some edges:
// retry a 5xx answer for up to two minutes before reporting it
async function get(url, init = {}) {
  let res = await once(url, init);
  for (let attempt = 1; res.status >= 500 && attempt <= 12; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    res = await once(url, init);
  }
  return res;
}

for (const path of PAGES) {
  const res = await get(`${base}${path}`);
  const html = await res.text();
  const h = res.headers;
  check(res.status === 200, `${path} : 200 (${res.status})`);
  const csp = h.get('content-security-policy') ?? '';
  check(
    csp.includes("script-src 'self'") &&
      csp.includes("frame-ancestors 'none'") &&
      !csp.includes('unsafe-inline'),
    `${path} : CSP stricte`,
  );
  check(
    /^max-age=\d+$/.test(h.get('strict-transport-security') ?? ''),
    `${path} : HSTS (sans includeSubDomains)`,
  );
  check(h.get('x-content-type-options') === 'nosniff', `${path} : X-Content-Type-Options`);
  check(
    h.get('referrer-policy') === 'strict-origin-when-cross-origin',
    `${path} : Referrer-Policy`,
  );
  check(Boolean(h.get('permissions-policy')), `${path} : Permissions-Policy`);
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
  const foreign = scripts.filter(
    (a) => !a.includes('application/ld+json') && !/src="\/_astro\//.test(a),
  );
  check(
    foreign.length === 0,
    `${path} : aucun script tiers ni inline${foreign.length ? ` (${foreign.join(' | ')})` : ''}`,
  );
  check(
    !/cdn-cgi|cloudflareinsights|rocket-loader|email-decode/.test(html),
    `${path} : aucune injection de Cloudflare (Web Analytics, Rocket Loader, Email Obfuscation)`,
  );
  const robots = h.get('x-robots-tag') ?? '';
  if (env === 'recette')
    check(robots.includes('noindex'), `${path} : X-Robots-Tag noindex (recette)`);
  else check(!robots.includes('noindex'), `${path} : indexable sur dailyedge.fr`);
  if (path === '/' && values['expect-mode']) {
    const mode = html.match(/data-site-mode="(\w+)"/)?.[1];
    check(
      mode === values['expect-mode'],
      `mode du site : ${mode} (attendu ${values['expect-mode']})`,
    );
  }
}

const missing = await get(`${base}/page-qui-nexiste-pas-${Date.now()}`);
check(missing.status === 404, `page inconnue : 404 (${missing.status})`);

const robotsTxt = await (await get(`${base}/robots.txt`)).text();
if (env === 'recette') {
  check(/Disallow: \/\s*$/m.test(robotsTxt), 'robots.txt interdit tout (recette)');
} else {
  check(
    robotsTxt.includes('Sitemap: https://dailyedge.fr/sitemap.xml'),
    'robots.txt avec le sitemap',
  );
  const sitemap = await get(`${base}/sitemap.xml`);
  check(sitemap.status === 200, 'sitemap.xml servi');
  const www = await get(base.replace('://', '://www.') + '/equipes?x=1');
  check(
    www.status === 301 && www.headers.get('location') === `${base}/equipes?x=1`,
    `www : 301 vers ${base} (chemin conservé) (${www.status} ${www.headers.get('location')})`,
  );
  const http = await get(base.replace('https://', 'http://') + '/');
  check(
    [301, 308].includes(http.status) && (http.headers.get('location') ?? '').startsWith('https://'),
    'http : redirigé vers https',
  );
}

if (values['pages-dev']) {
  const res = await get(`${values['pages-dev'].replace(/\/+$/, '')}/`);
  check(
    (res.headers.get('x-robots-tag') ?? '').includes('noindex'),
    `${values['pages-dev']} : noindex`,
  );
}

if (failures.length > 0) {
  console.error(`\n${failures.length} contrôle(s) en échec`);
  process.exit(1);
}
console.log('\nTous les contrôles sont passés.');
