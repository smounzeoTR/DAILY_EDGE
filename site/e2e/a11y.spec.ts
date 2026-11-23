// WCAG 2.1 AA (axe) on every public page, light and dark themes, mobile viewport.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

const pages = ['/', '/equipes', '/gdiy', '/martingale', '/linkedin', '/diagnostic'];

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });
    for (const path of pages) {
      test(`${path} has no WCAG 2.1 AA violation`, async ({ page }) => {
        await page.goto(path);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      });

      test(`${path} does not scroll horizontally`, async ({ page }) => {
        await page.goto(path);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  });
}
