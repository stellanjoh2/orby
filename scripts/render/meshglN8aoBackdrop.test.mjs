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
  N8AO_GUARDED_SOURCE_FILES,
  N8AO_SKY_DEPTH_THRESHOLD,
  compositeAoWithBackdrop,
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

  it('shader threshold default matches shared constant', () => {
    const shader = readRepoFile('scripts/render/n8aoBackdropRestoreShader.js');
    assert.match(
      shader,
      new RegExp(`skyDepthThreshold:\\s*\\{\\s*value:\\s*${N8AO_SKY_DEPTH_THRESHOLD}\\s*\\}`),
    );
    assert.match(shader, /uniform highp sampler2D tSceneDepth;/);
    assert.match(shader, /mix\(backdrop, ao, geometry\)/);
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
  });

  it('MeshglN8AOPass keeps ping-pong + transparency contract', () => {
    const pass = readRepoFile('scripts/render/MeshglN8AOPass.js');
    assert.match(pass, /this\.needsSwap\s*=\s*false/);
    assert.match(pass, /this\.autoDetectTransparency\s*=\s*false/);
    assert.match(pass, /configuration\.autoRenderBeauty\s*=\s*false/);
    assert.match(pass, /configuration\.transparencyAware\s*=\s*false/);
    assert.match(pass, /_preserveBackdropPlate/);
    assert.match(pass, /beautyRenderTarget\?\.depthTexture/);
    assert.match(pass, /_enforceBeautyDepth/);
    assert.match(pass, /_restoreBackdropPass\.render\(renderer, readBuffer, writeBuffer\)/);
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
