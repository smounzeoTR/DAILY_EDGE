// Shared fixtures: PostHog requests intercepted and recorded (never sent), consent preset.
import { test as base, expect, type BrowserContext } from '@playwright/test';

type Consent = 'pending' | 'denied' | 'granted';

export const test = base.extend<{ consent: Consent; posthogBodies: string[] }>({
  consent: ['denied', { option: true }],
  // Automatic: every test gets PostHog intercepted and the consent preset
  posthogBodies: [
    async ({ context, consent }, use) => {
      await use(await prepareContext(context, consent));
    },
    { auto: true },
  ],
});

/** Same preparation for a context created by a test (several visitors in one test). */
export async function prepareContext(context: BrowserContext, consent: Consent = 'denied') {
  const bodies: string[] = [];
  // PostHog drops events of automated browsers (navigator.webdriver, "HeadlessChrome" brand):
  // hide them in tests only,
  // the published site keeps PostHog's bot filter
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'userAgentData', { get: () => undefined });
  });
  await context.route('https://eu.i.posthog.com/**', async (route) => {
    bodies.push(route.request().postData() ?? '');
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' });
  });
  if (consent !== 'pending') {
    await context.addInitScript((choice) => {
      window.localStorage.setItem('dailyedge.consent', JSON.stringify({ choice, at: Date.now() }));
    }, consent);
  }
  return bodies;
}

export { expect };
