// Web diagnostic on the local stack (supabase start): 7 questions, back and skip, draft kept on
// reload, result shown, result e-mail in Mailpit, marketing consent confirmed by its link.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { latestMailText } from './mailpit';

const run = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;

async function choose(page: Page, label: string) {
  await page.getByLabel(label, { exact: true }).check();
  await page
    .locator('section[data-step]:not([hidden])')
    .getByRole('button', { name: 'Suivant' })
    .click();
}

const visibleStep = (page: Page) => page.locator('section[data-step]:not([hidden])');

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

test('diagnostic: questions, result, e-mail and marketing confirmation', async ({ page }) => {
  const email = `e2e-diagnostic-${run}@example.test`;
  await page.goto('/diagnostic?utm_source=e2e');
  await expect(page.getByText('Question 1 sur 7')).toBeVisible();
  await axe(page);

  // "Suivant" waits for an answer
  await expect(visibleStep(page).getByRole('button', { name: 'Suivant' })).toBeDisabled();
  await choose(page, 'Argent & patrimoine');
  await expect(page.getByText('Question 2 sur 7')).toBeVisible();

  // Back keeps the answer
  await visibleStep(page).getByRole('button', { name: 'Retour' }).click();
  await expect(page.getByLabel('Argent & patrimoine', { exact: true })).toBeChecked();
  await visibleStep(page).getByRole('button', { name: 'Suivant' }).click();

  await choose(page, 'Salarié');
  await choose(page, 'Peur de passer à l’action');

  // The draft survives a reload (answers only)
  await page.reload();
  await expect(page.getByText('Question 4 sur 7')).toBeVisible();

  await choose(page, '15 min');
  await choose(page, 'Soir');

  // Optional question: skipped
  await expect(page.getByText('Question 6 sur 7')).toBeVisible();
  await visibleStep(page).getByRole('button', { name: 'Passer' }).click();

  await expect(page.getByText('Question 7 sur 7')).toBeVisible();
  await page.getByRole('button', { name: 'Recevoir mon plan' }).click();
  await expect(page.getByText('Indique une adresse e-mail valide')).toBeVisible();
  await page.getByLabel('Ton e-mail').fill(email);
  await page.getByLabel(/J'accepte de recevoir les e-mails/).check();
  await page.getByRole('button', { name: 'Recevoir mon plan' }).click();

  // Same rule as the onboarding: money first → PR4; blocker "fear" → "Le stratège prudent"
  await expect(page.getByRole('heading', { name: 'Le stratège prudent' })).toBeVisible();
  await expect(page.locator('[data-result-program]')).toHaveText('Intelligence financière');
  await expect(page.getByText('Ton plan part par e-mail')).toBeVisible();
  await axe(page);

  // The marketing consent is confirmed by the link of the result e-mail
  const text = await latestMailText(email);
  expect(text).toContain('Intelligence financière');
  const link = text.match(/\/diagnostic\/confirmer#t=[A-Za-z0-9_-]{43}/)?.[0];
  expect(link).toBeDefined();
  await page.goto(link!);
  await expect(page.getByRole('heading', { name: 'C’est confirmé' })).toBeVisible();
  expect(page.url()).not.toContain('#t=');

  // Used once
  await page.goto('/');
  await page.goto(link!);
  await expect(page.getByRole('heading', { name: 'Ce lien ne fonctionne plus' })).toBeVisible();
});

test('authors: "Aucun" excludes the authors', async ({ page }) => {
  await page.goto('/diagnostic');
  await choose(page, 'Clarté & objectifs');
  await choose(page, 'Étudiant');
  await choose(page, 'Constance');
  await choose(page, '5 min');
  await choose(page, 'Matin');
  await page.getByLabel('James Clear').check();
  await page.getByLabel('Aucun').check();
  await expect(page.getByLabel('James Clear')).not.toBeChecked();
  await page.getByLabel('Stephen Covey').check();
  await expect(page.getByLabel('Aucun')).not.toBeChecked();
});
