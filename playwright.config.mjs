/** @type {import('playwright/test').PlaywrightTestConfig} */
export default {
  testDir: 'e2e',
  timeout: 180_000,
  use: {
    baseURL: process.env.ORBY_TEST_URL ?? 'http://127.0.0.1:8000',
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:8000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
};
