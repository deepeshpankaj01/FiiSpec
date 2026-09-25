import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests for the judge demo flow. They run against the local stack:
 *   npm run emulators   (terminal 1)
 *   npm run seed        (once)
 *   npm run dev         (terminal 2)
 *   npm run test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 240_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
