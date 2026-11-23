// Served like Cloudflare Pages (scripts/serve.mjs): security headers, cache, 404, redirects of
// the former legal addresses, robots.txt, sitemap.xml and structured data.
import { expect, test } from './fixtures';

const PAGES = [
  '/',
  '/diagnostic',
  '/equipes',
  '/cgu',
  '/confidentialite',
  '/mentions-legales',
  '/en/terms',
];

test('security headers on every page, strict CSP', async ({ request }) => {
  for (const path of PAGES) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    const h = res.headers();
    const csp = h['content-security-policy'] ?? '';
    expect(csp, path).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self';");
    expect(csp).toContain("style-src 'self';");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toMatch(/connect-src 'self' https?:\/\/\S+ https:\/\/eu\.i\.posthog\.com/);
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(h['strict-transport-security']).toBe('max-age=86400');
    expect(h['strict-transport-security']).not.toContain('includeSubDomains');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['permissions-policy']).toContain('camera=()');
    expect(h['cache-control']).toBe('public, max-age=0, must-revalidate');
    expect(h['x-robots-tag']).toBeUndefined();
  }
});

test('no third-party script, no inline code in the pages', async ({ request }) => {
  for (const path of PAGES) {
    const html = await (await request.get(path)).text();
    for (const m of html.matchAll(/<script\b([^>]*)>/g)) {
      const attrs = m[1] ?? '';
      if (attrs.includes('application/ld+json')) continue;
      expect(attrs, path).toMatch(/src="\/_astro\//);
    }
    expect(html).not.toMatch(/\sstyle="/);
  }
});

test('versioned files are cached for a year', async ({ page, request }) => {
  await page.goto('/');
  const script = await page.locator('script[src^="/_astro/"]').first().getAttribute('src');
  const res = await request.get(script!);
  expect(res.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
});

test('404 page with the brand, real 404 status', async ({ page }) => {
  const res = await page.goto('/cette-page-nexiste-pas');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Cette page n’existe pas' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Revenir à l’accueil' })).toBeVisible();
});

test('former legal addresses redirect permanently', async ({ request }) => {
  for (const [from, to] of [
    ['/fr/cgu.html', '/cgu'],
    ['/fr/confidentialite.html', '/confidentialite'],
    ['/fr/mentions-legales.html', '/mentions-legales'],
    ['/en/privacy.html', '/en/privacy'],
  ]) {
    const res = await request.get(from!, { maxRedirects: 0 });
    expect(res.status(), from).toBe(301);
    expect(res.headers()['location']).toBe(to);
  }
});

test('legal pages: French at the root, English under /en, linked from the footer', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Politique de confidentialité' }).first().click();
  await expect(page).toHaveURL(/\/confidentialite$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Politique de confidentialité');
  await page.getByRole('link', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/en\/privacy$/);
  expect(await page.getAttribute('html', 'lang')).toBe('en');
});

test('robots.txt, sitemap.xml, share image and structured data', async ({ page, request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Sitemap: https://dailyedge.fr/sitemap.xml');
  expect(robots).toContain('Disallow: /ma-place');
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('<loc>https://dailyedge.fr/</loc>');
  expect(sitemap).toContain('<loc>https://dailyedge.fr/equipes</loc>');
  expect(sitemap).toContain('<loc>https://dailyedge.fr/cgu</loc>');
  for (const hidden of ['/ma-place', '/confirmer', '/404', '/kit']) {
    expect(sitemap).not.toContain(`dailyedge.fr${hidden}<`);
  }
  // Waitlist mode: the diagnostic page is noindex, so not listed
  expect(sitemap).not.toContain('/diagnostic<');
  const png = await request.get('/og.png');
  expect(png.headers()['content-type']).toBe('image/png');
  await page.goto('/');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    'https://dailyedge.fr/og.png',
  );
  const jsonLd = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
  );
  expect(jsonLd).toMatchObject({ '@type': 'SoftwareApplication', name: 'Daily Edge' });
  expect(jsonLd.aggregateRating).toBeUndefined();
  expect(jsonLd.offers.map((o: { price: string }) => o.price)).toEqual(['0', '119', '14.99']);
});
