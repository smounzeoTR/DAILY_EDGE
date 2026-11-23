// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://dailyedge.fr',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
});
