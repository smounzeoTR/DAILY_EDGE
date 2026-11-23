// Consent banner and audience measurement (PostHog intercepted, never reached).
// "pending" (no choice yet) is not a refusal chosen by the visitor: the banner comes back at
// every visit, even though PostHog has written its own opt-out flag for the cookieless mode.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

const banner = (page: Page) => page.getByRole('region', { name: 'Mesure d’audience' });

async function storage(page: Page) {
  return page.evaluate(() => ({ ...window.localStorage }));
}

async function posthogCookies(page: Page) {
  return (await page.context().cookies()).filter((c) => c.name.startsWith('ph_'));
}

test.describe('no choice yet', () => {
  test.use({ consent: 'pending' });

  test('the banner shows at every visit, only anonymous cookieless measurement', async ({
    page,
    posthogBodies,
  }) => {
    await page.goto('/');
    await expect(banner(page)).toBeVisible();
    await expect(banner(page)).toContainText(
      'Sans ton accord, seule une mesure anonyme, sans cookie, est faite.',
    );

    // Cookieless measurement is running: PostHog's own opt-out flag, no identifier, no cookie
    await expect.poll(() => posthogBodies.some((b) => b.includes('landing_view'))).toBe(true);
    const stored = await storage(page);
    expect(stored['dailyedge.consent']).toBeUndefined();
    expect(Object.keys(stored).some((k) => k.startsWith('__ph_opt_in_out_'))).toBe(true);
    expect(Object.keys(stored).filter((k) => k.startsWith('ph_'))).toEqual([]);
    expect(await posthogCookies(page)).toEqual([]);

    // PostHog's flag is not a choice of the visitor: the banner is back on the next visit
    await page.goto('/equipes');
    await expect(banner(page)).toBeVisible();
    await page.reload();
    await expect(banner(page)).toBeVisible();
  });

  test('"Refuser" is exactly as visible as "Accepter"', async ({ page }) => {
    await page.goto('/');
    const refuse = await banner(page).getByRole('button', { name: 'Refuser' }).boundingBox();
    const accept = await banner(page).getByRole('button', { name: 'Accepter' }).boundingBox();
    expect(refuse!.width).toBeCloseTo(accept!.width, 0);
    expect(refuse!.height).toBeCloseTo(accept!.height, 0);
    const style = (name: string) =>
      banner(page)
        .getByRole('button', { name })
        .evaluate((el) => {
          const s = getComputedStyle(el);
          return [s.backgroundColor, s.color, s.fontWeight, s.fontSize].join('|');
        });
    expect(await style('Refuser')).toBe(await style('Accepter'));
  });

  test('banner accessible (WCAG 2.1 AA)', async ({ page }) => {
    await page.goto('/');
    await expect(banner(page)).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('refusing: stored as a choice, the banner no longer shows, still no cookie', async ({
    page,
  }) => {
    await page.goto('/');
    await banner(page).getByRole('button', { name: 'Refuser' }).click();
    await expect(banner(page)).toBeHidden();
    expect(JSON.parse((await storage(page))['dailyedge.consent']!).choice).toBe('denied');
    await page.reload();
    await expect(banner(page)).toBeHidden();
    expect(await posthogCookies(page)).toEqual([]);
  });

  test('accepting: stored as a choice, full measurement, never an e-mail sent', async ({
    page,
    posthogBodies,
  }) => {
    await page.goto('/?utm_source=e2e#t=SECRET');
    await banner(page).getByRole('button', { name: 'Accepter' }).click();
    await expect(banner(page)).toBeHidden();
    expect(JSON.parse((await storage(page))['dailyedge.consent']!).choice).toBe('granted');
    await page.reload();
    await expect(banner(page)).toBeHidden();

    // An e-mail typed in the form never reaches PostHog, nor URL fragments
    const form = page.locator('#hero-email').locator('xpath=ancestor::form');
    await form.getByLabel('Ton e-mail').fill('camille.e2e@example.test');
    await form.getByRole('button', { name: 'Réserver ma place' }).click();
    await expect.poll(() => posthogBodies.length).toBeGreaterThan(1);
    const all = posthogBodies.join('\n');
    expect(all).not.toContain('camille.e2e');
    expect(all).not.toContain('@example.test');
    expect(all).not.toContain('SECRET');
    expect(all).toContain('utm_source=e2e');
  });

  test('"Gérer mes cookies" reopens the banner', async ({ page }) => {
    await page.goto('/');
    await banner(page).getByRole('button', { name: 'Refuser' }).click();
    await page.getByRole('button', { name: 'Gérer mes cookies' }).click();
    await expect(banner(page)).toBeVisible();
    await expect(banner(page).getByRole('button', { name: 'Refuser' })).toBeFocused();
    await banner(page).getByRole('button', { name: 'Accepter' }).click();
    expect(JSON.parse((await storage(page))['dailyedge.consent']!).choice).toBe('granted');
  });
});

test('a choice older than 6 months is asked again', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'dailyedge.consent',
      JSON.stringify({ choice: 'granted', at: Date.now() - 200 * 24 * 60 * 60 * 1000 }),
    );
  });
  await page.goto('/');
  await expect(banner(page)).toBeVisible();
});
