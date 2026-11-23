// Waitlist journey on the local stack (supabase start): sign-up, link received in Mailpit,
// confirmation, rank shown, referral confirmed, sponsor's rank improved by 10 places.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, prepareContext, test } from './fixtures';

import { confirmPath, latestMailText } from './mailpit';

const run = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;

async function signUp(page: Page, email: string) {
  const form = page.locator('#hero-email').locator('xpath=ancestor::form');
  await form.getByLabel('Ton e-mail').fill(email);
  await form.getByLabel(/J'accepte de recevoir les e-mails/).check();
  await form.getByRole('button', { name: 'Réserver ma place' }).click();
  await expect(page.getByText('C’est presque fini.')).toBeVisible();
}

async function confirmFromMail(page: Page, email: string): Promise<number> {
  await page.goto(confirmPath(await latestMailText(email)));
  await expect(page.getByRole('heading', { name: 'Ta place est réservée' })).toBeVisible();
  // The token is removed from the address bar
  expect(page.url()).not.toContain('#t=');
  return Number(await page.locator('[data-place-rank]').textContent());
}

test('sign-up, confirmation, rank, referral', async ({ browser }) => {
  const sponsorContext = await browser.newContext();
  await prepareContext(sponsorContext);
  const sponsorPage = await sponsorContext.newPage();
  const sponsorEmail = `e2e-sponsor-${run}@example.test`;

  // Validation: e-mail and consent are required
  await sponsorPage.goto('/');
  await sponsorPage
    .locator('#hero-email')
    .locator('xpath=ancestor::form')
    .getByRole('button', { name: 'Réserver ma place' })
    .click();
  await expect(sponsorPage.getByText('Indique une adresse e-mail valide').first()).toBeVisible();

  await signUp(sponsorPage, sponsorEmail);
  const rank = await confirmFromMail(sponsorPage, sponsorEmail);
  expect(rank).toBeGreaterThanOrEqual(1);
  const link = await sponsorPage.locator('[data-place-link]').inputValue();
  expect(link).toMatch(/\/\?ref=[A-Z2-9]{6}$/);

  const axe = await new AxeBuilder({ page: sponsorPage })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  // A friend signs up with the sponsor's link and confirms
  const friendContext = await browser.newContext();
  await prepareContext(friendContext);
  const friendPage = await friendContext.newPage();
  const friendEmail = `e2e-friend-${run}@example.test`;
  await friendPage.goto(new URL(link).pathname + new URL(link).search);
  await signUp(friendPage, friendEmail);
  await confirmFromMail(friendPage, friendEmail);

  // The sponsor's place, revisited: 10 places gained (floor 1)
  await sponsorPage.goto('/ma-place');
  await expect(sponsorPage.locator('[data-place-rank]')).toHaveText(String(Math.max(1, rank - 10)));
  await expect(sponsorPage.getByText('Déjà 1 ami confirmé.')).toBeVisible();

  // The used link no longer works
  await friendPage.goto(confirmPath(await latestMailText(friendEmail)));
  await expect(
    friendPage.getByRole('heading', { name: 'Ce lien ne fonctionne plus' }),
  ).toBeVisible();
});
