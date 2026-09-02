import { defineConfig, devices } from '@playwright/test';

/**
 * Watch2Gether E2E Playwright Configuration
 *
 * Tests run against the local dev server (web on 3000, backend on 3001).
 * For CI, set BASE_URL env to the staging server.
 */
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: {
    /** Max time for assertions like waitForSelector */
    timeout: 5_000,
  },
  fullyParallel: false, // Sync tests require sequential execution
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to ensure isolated room creation
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['line'],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      cwd: '../backend',
      url: BACKEND_URL + '/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'npm run dev',
      cwd: '../web',
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});

export { BASE_URL, BACKEND_URL };
