import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end verification of the booking flow.
 *
 * Artifacts (video, trace, screenshots) are off: this machine is short on disk,
 * and a failing assertion message is enough to diagnose these flows.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    locale: 'en-GB',
    timezoneId: 'Asia/Karachi',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
