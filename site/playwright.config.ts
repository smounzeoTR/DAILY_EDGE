import { defineConfig, devices } from '@playwright/test';

const port = 4329;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: `http://localhost:${port}`, ...devices['Pixel 7'] },
  webServer: {
    command: `npm run build && npx astro preview --ignore-lock --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
  },
});
