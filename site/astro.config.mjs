// @ts-check
import { defineConfig, envField } from 'astro/config';

export default defineConfig({
  site: 'https://dailyedge.fr',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
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
    },
  },
});
