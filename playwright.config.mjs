/** @type {import('playwright/test').PlaywrightTestConfig} */
export default {
  testDir: 'e2e',
  timeout: 180_000,
  use: {
    baseURL: process.env.ORBY_TEST_URL ?? 'http://127.0.0.1:8000',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
      testIgnore: '**/firefox-smoke.spec.mjs',
    },
    {
      name: 'firefox',
      use: { browserName: 'firefox' },
      testMatch: '**/firefox-smoke.spec.mjs',
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:8000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
};
