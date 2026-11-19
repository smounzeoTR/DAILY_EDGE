import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['supabase/functions/**/*.test.ts', 'app/src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
});
