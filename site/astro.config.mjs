// @ts-check
import { defineConfig, envField } from 'astro/config';

export default defineConfig({
  site: 'https://dailyedge.fr',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  // The diagnostic page imports the answer values shared with the Edge Functions
  vite: { server: { fs: { allow: ['..'] } } },
  env: {
    schema: {
      // Read at build time (static output); see src/config.ts
      SITE_MODE: envField.enum({
        context: 'server',
        access: 'public',
        values: ['waitlist', 'launch'],
        default: 'waitlist',
      }),
      MEETING_URL: envField.string({ context: 'server', access: 'public', default: '' }),
      // Store links (launch mode); the buttons are hidden while they are empty
      APP_STORE_URL: envField.string({ context: 'server', access: 'public', default: '' }),
      PLAY_STORE_URL: envField.string({ context: 'server', access: 'public', default: '' }),
      // PostHog project key (EU instance); empty = no audience measurement and no banner
      PUBLIC_POSTHOG_KEY: envField.string({ context: 'client', access: 'public', default: '' }),
      // Edge Functions base URL used by the browser (waitlist-*); local stack by default
      PUBLIC_FUNCTIONS_URL: envField.string({
        context: 'client',
        access: 'public',
        default: 'http://127.0.0.1:54321/functions/v1',
      }),
    },
  },
});
