import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Contracts are consumed from source (no build step), same path as tsconfig.
  resolve: { alias: { '@shibutz/contracts': fileURLToPath(new URL('../../packages/contracts/src/index.ts', import.meta.url)) } },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.tsx'] },
  // The API has no CORS; the dev server proxies these paths to it.
  server: {
    proxy: Object.fromEntries(
      ['/technicians', '/jobs', '/routes', '/optimization', '/skills', '/days'].map((p) => [p, process.env.API_URL ?? 'http://localhost:3001']),
    ),
  },
});
