/**
 * HDRI Intensity must dim the mesh, not only the backdrop.
 * Three.js ignores scene.environmentIntensity when material.envMap is set — we assign
 * envMap for lit/glass scaling, so envMapIntensity sync is mandatory.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** @param {string} relPath */
function readRepoFile(relPath) {
  return readFileSync(join(repoRoot, relPath), 'utf-8');
}

describe('HDRI strength → mesh envMapIntensity sync', () => {
  it('setHdriStrength explicitly syncs materials after EnvironmentController.setStrength', () => {
    const src = readRepoFile('scripts/SceneManager.js');
    assert.match(
      src,
      /setHdriStrength\([\s\S]*?setStrength\(this\.hdriStrength\)[\s\S]*?updateMaterialsEnvironment\(/,
    );
  });

  it('queues env updates while the asset material lock is held and flushes on unlock', () => {
    const src = readRepoFile('scripts/render/MaterialController.js');
    assert.match(src, /_pendingEnvUpdate/);
    assert.match(
      src,
      /updateMaterialsEnvironment\([\s\S]*?_assetMaterialLock\s*>\s*0[\s\S]*?_pendingEnvUpdate\s*=/,
    );
    assert.match(
      src,
      /endAssetMaterialLock\([\s\S]*?_pendingEnvUpdate[\s\S]*?updateMaterialsEnvironment\(/,
    );
  });

  it('live-rotation env base reapplies intensity even when the PMREM texture is unchanged', () => {
    const src = readRepoFile('scripts/render/EnvironmentController.js');
    const fn = src.match(
      /_ensureLiveRotationEnvironmentBase\(\)\s*\{[\s\S]*?\n  \}/,
    )?.[0];
    assert.ok(fn, 'expected _ensureLiveRotationEnvironmentBase');
    // Texture rebind may stay gated; intensity + material notify must run unconditionally.
    assert.match(
      fn,
      /if\s*\(\s*this\.scene\.environment\s*!==\s*baseEnvTexture\s*\)\s*\{\s*this\.scene\.environment\s*=\s*baseEnvTexture;\s*\}/,
    );
    assert.match(
      fn,
      /\}\s*this\.scene\.environmentIntensity\s*=\s*envIntensity;\s*this\._notifyEnvironmentMapUpdated\(baseEnvTexture,\s*envIntensity\)/,
    );
  });
});
