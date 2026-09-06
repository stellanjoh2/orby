import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStudioBackdropForBeauty } from './renderSceneBeautyToTarget.js';

function resolve(bgCtrl, bgGradCtrl) {
  return resolveStudioBackdropForBeauty({
    backgroundController: bgCtrl,
    backgroundGradientController: bgGradCtrl,
  });
}

test('resolveStudioBackdropForBeauty keeps scene background texture when image is active', () => {
  const backdrop = resolve(
    {
      usesFallbackBackdrop: () => true,
      solidEnabled: true,
      getColor: () => 0x505050,
      imageController: {
        isActive: () => true,
        getFallbackColor: () => 0x112233,
      },
    },
    {
      isActive: () => false,
      shouldGpuBlitGradient: () => false,
    },
  );
  assert.equal(backdrop.keepSceneBackgroundTexture, true);
  assert.equal(backdrop.useGpuGradientBlit, false);
  assert.equal(backdrop.clearColor, 0x112233);
});

test('resolveStudioBackdropForBeauty prefers image over gradient (matches BackgroundController)', () => {
  const backdrop = resolve(
    {
      usesFallbackBackdrop: () => true,
      solidEnabled: true,
      getColor: () => 0x505050,
      imageController: {
        isActive: () => true,
        getFallbackColor: () => 0xabcdef,
      },
    },
    {
      isActive: () => true,
      shouldGpuBlitGradient: () => true,
      getFallbackColor: () => 0x00ff00,
    },
  );
  assert.equal(backdrop.keepSceneBackgroundTexture, true);
  assert.equal(backdrop.useGpuGradientBlit, false);
  assert.equal(backdrop.clearColor, 0xabcdef);
});

test('resolveStudioBackdropForBeauty still blits gradient when image inactive', () => {
  const backdrop = resolve(
    {
      usesFallbackBackdrop: () => true,
      solidEnabled: true,
      getColor: () => 0x505050,
      imageController: {
        isActive: () => false,
        getFallbackColor: () => 0xabcdef,
      },
    },
    {
      isActive: () => true,
      shouldGpuBlitGradient: () => true,
      getFallbackColor: () => 0x00ff00,
    },
  );
  assert.equal(backdrop.keepSceneBackgroundTexture, false);
  assert.equal(backdrop.useGpuGradientBlit, true);
  assert.equal(backdrop.clearColor, 0x00ff00);
});

test('resolveStudioBackdropForBeauty does not keep texture when HDRI backdrop is on', () => {
  const backdrop = resolve(
    {
      usesFallbackBackdrop: () => false,
      imageController: {
        isActive: () => true,
        getFallbackColor: () => 0xabcdef,
      },
    },
  );
  assert.equal(backdrop.keepSceneBackgroundTexture, false);
  assert.equal(backdrop.useGpuGradientBlit, false);
  assert.equal(backdrop.clearColor, null);
});

test('resolveStudioBackdropForBeauty keeps pure black Studio Color (#000000)', () => {
  const backdrop = resolve(
    {
      usesFallbackBackdrop: () => true,
      solidEnabled: true,
      getColor: () => '#000000',
      imageController: {
        isActive: () => false,
      },
    },
    {
      isActive: () => false,
      shouldGpuBlitGradient: () => false,
    },
  );
  assert.equal(backdrop.usesFallbackBackdrop, true);
  assert.equal(backdrop.clearColor, '#000000');
  assert.notEqual(backdrop.clearColor, '#080808');
});
