// @ts-check
import { defineConfig, envField } from 'astro/config';

export default defineConfig({
  // Public origin of the environment (canonical, share image, sitemap)
  site: process.env.SITE_ORIGIN || 'https://dailyedge.fr',
  output: 'static',
  trailingSlash: 'never',
  // Stylesheets always as files (strict CSP: style-src 'self')
  build: { format: 'file', inlineStylesheets: 'never' },
  // The diagnostic page imports the answer values shared with the Edge Functions
  vite: { server: { fs: { allow: ['..'] } } },
  env: {
    schema: {
      // Read at build time (static output); see src/config.ts
      // Mode: SITE_MODE_OVERRIDE (waitlist | launch) wins, else launch from SITE_LAUNCH_AT
      SITE_MODE_OVERRIDE: envField.enum({
        context: 'server',
        access: 'public',
        values: ['waitlist', 'launch'],
        optional: true,
      }),
      SITE_LAUNCH_AT: envField.string({
        context: 'server',
        access: 'public',
        default: '2027-01-04T00:00:00+01:00',
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
