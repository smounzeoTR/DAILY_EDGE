import { defineConfig, devices } from '@playwright/test';

const port = 4329;

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  // The local stack shares one IP for every request: no parallel runs against the rate limits
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://localhost:${port}`, ...devices['Pixel 7'] },
  webServer: {
    // A PostHog key makes the consent banner and the measurement active (requests intercepted)
    command: `PUBLIC_POSTHOG_KEY=phc_e2e_test npm run build && npx astro preview --ignore-lock --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
  },
});
