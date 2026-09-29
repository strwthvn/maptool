import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: { host: '127.0.0.1', port: 5173 },
  worker: { format: 'es' },
  // MapLibre и milsymbol вместе весят около двух мегабайт, делить их на части незачем.
  build: { chunkSizeWarningLimit: 2500 },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
