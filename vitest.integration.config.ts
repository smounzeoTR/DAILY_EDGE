import { defineConfig } from 'vitest/config';

// Integration tests against the local Supabase stack (supabase start must be running)
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
