import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Same alias as the app (shared pure modules of the Edge Functions)
    alias: {
      '@shared': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)),
    },
  },
  test: {
    include: ['supabase/functions/**/*.test.ts', 'app/src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
});
