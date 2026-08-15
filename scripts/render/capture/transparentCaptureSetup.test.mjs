/**
 * Transparent capture setup/restore — RenderPass clearAlpha must survive export.
 * Run: npm test
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import {
  applyTransparentCaptureSetup,
  restoreTransparentCaptureSetup,
} from './TransparentCapture.js';

function mockDeps({ renderPassClearAlpha = 1 } = {}) {
  const renderPass = { clearAlpha: renderPassClearAlpha };
  const composer = { passes: [renderPass, { clearAlpha: 0 }] };
  const postPipeline = { renderPass };
  const clearColor = new THREE.Color('#b40707');
  const renderer = {
    getClearColor(target) {
      return target.copy(clearColor);
    },
    getClearAlpha: () => 1,
    setClearColor() {},
    setClearAlpha() {},
  };
  const grid = {
    visible: true,
    userData: { orbyStudioGroundGrid: true },
    children: [],
  };
  const scene = { background: null, children: [grid] };
  let refreshed = 0;
  const backgroundController = {
    getBackgroundSphere: () => null,
    refreshAppearance: () => {
      refreshed += 1;
    },
  };
  return {
    deps: { renderer, scene, composer, postPipeline, backgroundController },
    renderPass,
    grid,
    get refreshed() {
      return refreshed;
    },
  };
}

describe('transparent capture setup', () => {
  it('snapshots RenderPass clearAlpha before zeroing composer passes', () => {
    const ctx = mockDeps({ renderPassClearAlpha: 1 });
    const snap = applyTransparentCaptureSetup(ctx.deps);
    assert.equal(snap.renderPassClearAlpha, 1, 'must not snapshot post-mutation 0');
    assert.equal(snap.hasRenderPassClearAlpha, true);
    assert.equal(ctx.renderPass.clearAlpha, 0);
    restoreTransparentCaptureSetup(ctx.deps, snap);
    assert.equal(ctx.renderPass.clearAlpha, 1);
    assert.ok(ctx.refreshed >= 1, 'refreshAppearance after restore');
  });

  it('hides the studio ground grid for transparent capture and restores it', () => {
    const ctx = mockDeps();
    assert.equal(ctx.grid.visible, true);
    const snap = applyTransparentCaptureSetup(ctx.deps);
    assert.equal(ctx.grid.visible, false);
    restoreTransparentCaptureSetup(ctx.deps, snap);
    assert.equal(ctx.grid.visible, true);
  });

  it('hides an untagged live grid passed via getGroundGrid', () => {
    const ctx = mockDeps();
    const liveGrid = { visible: true, userData: {}, children: [] };
    ctx.deps.getGroundGrid = () => liveGrid;
    const snap = applyTransparentCaptureSetup(ctx.deps);
    assert.equal(liveGrid.visible, false);
    restoreTransparentCaptureSetup(ctx.deps, snap);
    assert.equal(liveGrid.visible, true);
  });

  it('restores null RenderPass clearAlpha when that was the original', () => {
    const ctx = mockDeps({ renderPassClearAlpha: null });
    const snap = applyTransparentCaptureSetup(ctx.deps);
    assert.equal(snap.renderPassClearAlpha, null);
    assert.equal(snap.hasRenderPassClearAlpha, true);
    restoreTransparentCaptureSetup(ctx.deps, snap);
    assert.equal(ctx.renderPass.clearAlpha, null);
  });
});
