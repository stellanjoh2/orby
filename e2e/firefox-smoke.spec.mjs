import { test, expect } from 'playwright/test';

test.describe('Unsupported browser gate', () => {
  test('Firefox sees the unsupported browser prompt', async ({ page, browserName }) => {
    test.skip(browserName !== 'firefox', 'Firefox-only gate test');

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page.locator('#orby-unsupported-browser-gate')).toBeVisible();
    await expect(page.locator('.orby-unsupported-browser-gate__title')).toContainText(
      'Browser not supported yet',
    );
    await expect(page.locator('.orby-unsupported-browser-gate__body')).toContainText('Firefox');
    await expect(page.locator('.dropzone')).toBeHidden();
  });
});
