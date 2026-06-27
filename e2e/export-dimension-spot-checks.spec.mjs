/**
 * Playwright spot check — loads dev studio, imports 404.glb, runs dimension probes.
 * Requires: npm run dev (port 8000)
 */
import { test, expect } from 'playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_GLB = path.resolve(__dirname, '../assets/3D-assets/404.glb');
const BASE_URL = process.env.ORBY_TEST_URL ?? 'http://127.0.0.1:8000';

test.describe('export dimension spot checks', () => {
  test('strict capture size across tier and resolution switches', async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(() => window.orby?.scene?.loadFile, null, {
      timeout: 60_000,
    });

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(FIXTURE_GLB);

    await page.waitForFunction(
      () => !!window.orby?.scene?.currentModel,
      null,
      { timeout: 90_000 },
    );

    await page.waitForFunction(
      () => !!window.orby?.dev?.runExportDimensionSpotChecks,
      null,
      { timeout: 30_000 },
    );

    const result = await page.evaluate(async () => {
      return window.orby.dev.runExportDimensionSpotChecks(window.orby.scene, {
        tiers: ['max', 'medium', 'low'],
        videoResolutions: ['1080p', '1440p'],
        pngScales: [1],
      });
    });

    if (!result.passed) {
      console.error('Failed probes:', result.failed, result.results);
    }
    expect(result.passed).toBe(true);
    expect(result.total).toBeGreaterThan(0);
  });
});
