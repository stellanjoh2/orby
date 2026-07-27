/**
 * N8AO + HDRI backdrop regression guards — run via `npm test`.
 * Locks the contract that broke repeatedly: AO on geometry, untouched HDRI/solid sky.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  N8AO_DEPTH_IGNORED_USER_DATA_KEYS,
  N8AO_EXCLUDED_MESH_USER_DATA_KEYS,
  N8AO_GUARDED_SOURCE_FILES,
  N8AO_SKY_DEPTH_THRESHOLD,
  compositeAoWithBackdrop,
  isN8aoDepthIgnoredMesh,
} from './meshglN8aoBackdrop.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** @param {string} relPath */
function readRepoFile(relPath) {
  return readFileSync(join(repoRoot, relPath), 'utf-8');
}

describe('N8AO backdrop composite math', () => {
  it('keeps HDRI/solid backdrop on cleared far-plane depth', () => {
    const backdrop = [0.9, 0.7, 0.4];
    const ao = [0.05, 0.05, 0.05];
    assert.deepEqual(
      compositeAoWithBackdrop(backdrop, ao, 1.0),
      backdrop,
    );
    assert.deepEqual(
      compositeAoWithBackdrop(backdrop, ao, 0.9996),
      backdrop,
    );
  });

  it('applies AO on geometry depth', () => {
    const backdrop = [0.9, 0.7, 0.4];
    const ao = [0.2, 0.15, 0.1];
    assert.deepEqual(
      compositeAoWithBackdrop(backdrop, ao, 0.42),
      ao,
    );
    assert.deepEqual(
      compositeAoWithBackdrop(backdrop, ao, 0.9994),
      ao,
    );
  });

  it('applies AO on top of base glass reflections (luminance ratio)', () => {
    const backdrop = [0.8, 0.75, 0.7];
    const beauty = [0.8, 0.75, 0.7];
    const ao = [0.4, 0.375, 0.35];
    assert.deepEqual(
      compositeAoWithBackdrop(backdrop, ao, 0.42, N8AO_SKY_DEPTH_THRESHOLD, 1, beauty),
      [0.4, 0.375, 0.35],
    );
  });

  it('preserves screen-space overlay on glass (lens flare ghosts)', () => {
    const beauty = [0.8, 0.75, 0.7];
    const overlay = [0.12, 0.08, 0.06];
    const backdrop = beauty.map((v, i) => v + overlay[i]);
    const ao = [0.4, 0.375, 0.35];
    const result = compositeAoWithBackdrop(
      backdrop,
      ao,
      0.42,
      N8AO_SKY_DEPTH_THRESHOLD,
      1,
      beauty,
    );
    assert.ok(result.every((v, i) => Math.abs(v - [0.52, 0.455, 0.41][i]) < 1e-6));
  });

  it('glass AO uses luminance ratio — no per-channel blowup on near-zero beauty channel', () => {
    const backdrop = [0.8, 0.75, 0.7];
    const beauty = [0.001, 0.38, 0.36];
    const ao = [0.2, 0.19, 0.18];
    const result = compositeAoWithBackdrop(backdrop, ao, 0.42, N8AO_SKY_DEPTH_THRESHOLD, 1, beauty);
    const luma = (rgb) => rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
    const aoFactor = Math.min(1, Math.max(0.2, luma(ao) / Math.max(luma(beauty), 0.05)));
    const overlay = backdrop.map((v, i) => Math.max(0, v - beauty[i]));
    const expected = beauty.map((b, i) => b * aoFactor + overlay[i]);
    assert.ok(result.every((v, i) => Math.abs(v - expected[i]) < 0.001));
  });

  it('glass AO floor prevents literal black at full occlusion (low intensity)', () => {
    const backdrop = [0.8, 0.75, 0.7];
    const beauty = [0.8, 0.75, 0.7];
    const ao = [0, 0, 0];
    const floor = 0.35;
    assert.deepEqual(
      compositeAoWithBackdrop(backdrop, ao, 0.42, N8AO_SKY_DEPTH_THRESHOLD, 1, beauty, floor),
      backdrop.map((v) => v * floor),
    );
  });

  it('glass AO floor allows more darkening at high intensity', () => {
    const backdrop = [0.8, 0.75, 0.7];
    const beauty = [0.8, 0.75, 0.7];
    const ao = [0, 0, 0];
    const floor = 0.08;
    assert.deepEqual(
      compositeAoWithBackdrop(backdrop, ao, 0.42, N8AO_SKY_DEPTH_THRESHOLD, 1, beauty, floor),
      backdrop.map((v) => v * floor),
    );
  });

  it('sky pixels stay backdrop even when depth would be flare-corrupted (geometry path unused without glass)', () => {
    const backdrop = [0.9, 0.7, 0.4];
    const ao = [0.05, 0.05, 0.05];
    // Uncorrupted sky depth — flare fix keeps this at far plane, not near-camera junk.
    assert.deepEqual(compositeAoWithBackdrop(backdrop, ao, 1.0), backdrop);
  });

  it('shader threshold default matches shared constant', () => {
    const shader = readRepoFile('scripts/render/n8aoBackdropRestoreShader.js');
    assert.match(
      shader,
      new RegExp(`skyDepthThreshold:\\s*\\{\\s*value:\\s*${N8AO_SKY_DEPTH_THRESHOLD}\\s*\\}`),
    );
    assert.match(shader, /uniform highp sampler2D tSceneDepth;/);
    assert.match(shader, /uniform sampler2D tGlassMask;/);
    assert.match(shader, /uniform sampler2D tBeauty;/);
    assert.match(shader, /uniform float glassAoFloor;/);
    assert.match(shader, /beauty \* aoFactor \+ overlay/);
    assert.match(shader, /max\(backdrop - beauty/);
    assert.match(shader, /aoLum \/ beautyLum/);
  });
});

describe('N8AO depth-ignored overlays', () => {
  it('flags lens flare meshes for auxiliary pass exclusion', () => {
    assert.ok(N8AO_DEPTH_IGNORED_USER_DATA_KEYS.includes('lensflare'));
    assert.equal(isN8aoDepthIgnoredMesh({ userData: { lensflare: 'no-occlusion' } }), true);
    assert.equal(isN8aoDepthIgnoredMesh({ userData: {} }), false);
    assert.equal(isN8aoDepthIgnoredMesh({ userData: { orbyFontExtrude: true } }), false);
  });

  it('defers screen-space overlays until after AO composite', () => {
    const renderPass = readRepoFile('scripts/render/MeshglRenderPass.js');
    const n8aoPass = readRepoFile('scripts/render/MeshglN8AOPass.js');
    const pipeline = readRepoFile('scripts/render/PostProcessingPipeline.js');
    const lensFlare = readRepoFile('scripts/render/LensFlareController.js');
    assert.match(renderPass, /resolveAmbientOcclusionActive/);
    assert.match(renderPass, /getN8aoSceneLayerMaskWithoutOverlays/);
    assert.match(n8aoPass, /_restoreScreenSpaceOverlays/);
    assert.match(n8aoPass, /getN8aoScreenSpaceOverlayLayerMask/);
    assert.match(n8aoPass, /withCameraLayerMask/);
    assert.match(n8aoPass, /scene\.background = null[\s\S]*_restoreScreenSpaceOverlays|_restoreScreenSpaceOverlays[\s\S]*scene\.background = null/);
    assert.match(pipeline, /resolveAmbientOcclusionActive/);
    assert.match(lensFlare, /applyN8aoScreenSpaceOverlayLayer/);
  });
});

describe('N8AO + HDRI source invariants', () => {
  it('guards all contract files exist', () => {
    for (const rel of N8AO_GUARDED_SOURCE_FILES) {
      assert.ok(readRepoFile(rel).length > 0, `missing ${rel}`);
    }
  });

  it('never disables RenderPass when AO is active', () => {
    const pipeline = readRepoFile('scripts/render/PostProcessingPipeline.js');
    assert.doesNotMatch(pipeline, /renderPass\.enabled\s*=\s*!active/);
    assert.match(
      pipeline,
      /updateAmbientOcclusion[\s\S]*renderPass\.enabled\s*=\s*true/,
    );
    assert.match(pipeline, /setGlassAoFloor/);
    assert.match(pipeline, /THREE\.MathUtils\.lerp\(0\.35, 0\.08, intensityT\)/);
  });

  it('MeshglN8AOPass keeps ping-pong + transparency contract', () => {
    const pass = readRepoFile('scripts/render/MeshglN8AOPass.js');
    assert.match(pass, /this\.needsSwap\s*=\s*false/);
    assert.match(pass, /this\.autoDetectTransparency\s*=\s*false/);
    assert.match(pass, /configuration\.autoRenderBeauty\s*=\s*false/);
    assert.match(pass, /configuration\.transparencyAware\s*=\s*false/);
    assert.match(pass, /_preserveBackdropPlate/);
    assert.match(pass, /beauty\?\.depthTexture/);
    assert.match(pass, /_enforceBeautyDepth/);
    assert.match(pass, /withCameraLayerMask/);
    assert.match(pass, /_restoreScreenSpaceOverlays/);
    assert.match(pass, /setGlassAoFloor/);
    assert.match(pass, /_aoResultRT/);
    assert.match(pass, /invalidateViewCache/);
    assert.match(pass, /needsN8aoViewRecompute/);
    assert.doesNotMatch(pass, /withN8aoExcludedMeshesHidden/);
    assert.match(pass, /tBeauty\.value/);
    assert.match(pass, /_restoreBackdropPass\.render\(renderer, readBuffer, writeBuffer\)/);
  });

  it('invalidates N8AO view cache when AO settings change', () => {
    const pipeline = readRepoFile('scripts/render/PostProcessingPipeline.js');
    assert.match(pipeline, /invalidateN8aoViewCache/);
    assert.match(
      pipeline,
      /updateAmbientOcclusion[\s\S]*invalidateN8aoViewCache/,
    );
  });

  it('base glass reflector gets AO on top of RenderPass reflections', () => {
    assert.ok(N8AO_EXCLUDED_MESH_USER_DATA_KEYS.includes('meshglBaseGlassReflector'));
    const pass = readRepoFile('scripts/render/MeshglN8AOPass.js');
    assert.match(pass, /_renderGlassMask/);
    assert.match(pass, /withOnlyN8aoExcludedMeshesVisible/);
    assert.match(pass, /withN8aoExcludedMeshRenderHooksPaused/);
    assert.doesNotMatch(pass, /N8AO_GLASS_LAYER/);
    assert.doesNotMatch(pass, /withCameraLayerDisabled/);
    const ground = readRepoFile('scripts/render/GroundController.js');
    assert.doesNotMatch(ground, /layers\.set/);
    const backdrop = readRepoFile('scripts/render/meshglN8aoBackdrop.js');
    assert.match(backdrop, /meshglBaseGlassReflector/);
  });

  it('RenderPass records composer colour for backdrop restore', () => {
    const renderPass = readRepoFile('scripts/render/MeshglRenderPass.js');
    assert.match(renderPass, /lastComposerColorBuffer\s*=\s*readBuffer/);
  });

  it('beauty seed strips scene.background (geometry-only depth)', () => {
    const beauty = readRepoFile('scripts/render/renderSceneBeautyToTarget.js');
    assert.match(beauty, /scene\.background\s*=\s*null/);
    assert.match(beauty, /Geometry-only/);
  });

  it('forbids removed broken mask paths', () => {
    const pass = readRepoFile('scripts/render/MeshglN8AOPass.js');
    const shader = readRepoFile('scripts/render/n8aoBackdropRestoreShader.js');
    assert.doesNotMatch(pass, /_geometryMaskRT/);
    assert.doesNotMatch(pass, /createGeometryMaskOverrideMaterial/);
    assert.doesNotMatch(shader, /tGeometryMask/);
  });
});
