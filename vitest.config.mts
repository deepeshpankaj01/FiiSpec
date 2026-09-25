import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['tests/web/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/web/setup.ts'],
    css: false,
  },
});