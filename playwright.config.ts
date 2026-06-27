import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for the Cards component library demo.
 * Automatically starts the Vite dev server before running tests.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:9901',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: 'yarn dev',
    url: 'http://127.0.0.1:9901',
    reuseExistingServer: !process.env.CI,
  },
});
