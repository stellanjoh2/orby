import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  applyCreativeLookPhysicalTransmissionTuning,
  applyImportPhysicalTransmissionMeshPatch,
  creativeLookTransmissionControlsVisible,
  creativeLookTransmissionTuningFromState,
  isPhysicalTransmissionCreativeLookPreset,
  normalizeCreativeLookTransmissionDispersion,
  normalizeCreativeLookTransmissionSamples,
  patchCreativeLookTransmissionViewBlurFragment,
  resolveCreativeLookTransmissionDispersion,
  resolveCreativeLookTransmissionRoughnessFloor,
  resolveCreativeLookTransmissionViewBlur,
} from './creativeLookPhysicalTransmission.js';

test('isPhysicalTransmissionCreativeLookPreset matches glass family only', () => {
  assert.equal(isPhysicalTransmissionCreativeLookPreset('glass'), true);
  assert.equal(isPhysicalTransmissionCreativeLookPreset('holo-glass'), true);
  assert.equal(isPhysicalTransmissionCreativeLookPreset('crystal-gem'), true);
  assert.equal(isPhysicalTransmissionCreativeLookPreset('holographic'), false);
});

test('creativeLookTransmissionControlsVisible requires enabled glass preset', () => {
  assert.equal(
    creativeLookTransmissionControlsVisible({
      creativeLook: { enabled: true, preset: 'holo-glass' },
    }),
    true,
  );
  assert.equal(
    creativeLookTransmissionControlsVisible({
      creativeLook: { enabled: true, preset: 'plasma' },
    }),
    false,
  );
  assert.equal(
    creativeLookTransmissionControlsVisible({
      creativeLook: { enabled: false, preset: 'glass' },
    }),
    false,
  );
});

test('normalizeCreativeLookTransmissionDispersion clamps 0–1', () => {
  assert.equal(normalizeCreativeLookTransmissionDispersion(-1), 0);
  assert.equal(normalizeCreativeLookTransmissionDispersion(0.333), 0.333);
  assert.equal(normalizeCreativeLookTransmissionDispersion(9), 1);
});

test('resolveCreativeLookTransmissionDispersion is zero when slider is zero', () => {
  assert.equal(resolveCreativeLookTransmissionDispersion(0), 0);
  assert.equal(resolveCreativeLookTransmissionDispersion(1), 4.8);
});

test('resolveCreativeLookTransmissionViewBlur softens head-on surfaces at low samples', () => {
  assert.ok(
    resolveCreativeLookTransmissionViewBlur(1)
      > resolveCreativeLookTransmissionViewBlur(10),
  );
});

test('solid mesh glass boosts blur and roughness floor', () => {
  assert.ok(
    resolveCreativeLookTransmissionViewBlur(4, { solidMeshGlass: true })
      > resolveCreativeLookTransmissionViewBlur(4),
  );
  assert.ok(
    resolveCreativeLookTransmissionRoughnessFloor(4, { solidMeshGlass: true })
      > resolveCreativeLookTransmissionRoughnessFloor(4),
  );
});

test('patchCreativeLookTransmissionViewBlurFragment injects view-dependent roughness', () => {
  const src = `#include <common>
#include <normal_fragment_maps>
vec3 n; vec3 v;
vec4 transmitted = getIBLVolumeRefraction(
\tn, v, material.roughness, material.diffuseColor, x );`;
  const patched = patchCreativeLookTransmissionViewBlurFragment(src);
  assert.match(patched, /orbyTransmissionRoughness/);
  assert.match(patched, /uOrbyTransmissionViewBlur/);
  assert.match(patched, /uOrbySolidMeshMinTransRoughness/);
  assert.match(patched, /orbyShellFacing/);
});

test('applyImportPhysicalTransmissionMeshPatch enables solid-mesh transmission blur', () => {
  const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.08, transmission: 1 });
  applyImportPhysicalTransmissionMeshPatch(mat, { refractionBlur: 0.4, solidMesh: true });
  assert.equal(mat.userData.orbyTransmissionPatch?.solidMeshGlass, true);
  assert.ok(mat.userData.orbyTransmissionPatch?.viewBlur > 0.08);
  assert.ok(mat.userData.orbyTransmissionPatch?.solidMinRoughness > 0.14);
});

test('applyCreativeLookPhysicalTransmissionTuning uses roughness + forceSinglePass on r167', () => {
  const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.05, transmission: 1 });
  applyCreativeLookPhysicalTransmissionTuning(mat, {
    samples: 2,
    doubleSide: true,
    baseRoughness: 0.05,
    dispersion: 0.4,
  });
  assert.equal(mat.side, THREE.DoubleSide);
  assert.equal(mat.forceSinglePass, false);
  assert.ok(mat.roughness > 0.05);
  assert.ok(mat.dispersion > 0);
  assert.equal(mat.userData.orbyTransmissionPatchPatched, true);
});

test('solid mesh glass forces front side and disables double-sided draw', () => {
  const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.05, transmission: 1 });
  applyCreativeLookPhysicalTransmissionTuning(mat, {
    samples: 4,
    doubleSide: true,
    solidMeshGlass: true,
    baseRoughness: 0.05,
  });
  assert.equal(mat.side, THREE.FrontSide);
  assert.equal(mat.forceSinglePass, true);
  assert.equal(mat.userData.orbyTransmissionPatch?.solidMeshGlass, true);
  assert.ok(mat.userData.orbyTransmissionPatch?.solidMinRoughness > 0);

  const roughnessOn = mat.roughness;
  applyCreativeLookPhysicalTransmissionTuning(mat, {
    samples: 4,
    doubleSide: true,
    solidMeshGlass: false,
    baseRoughness: 0.05,
  });
  assert.equal(mat.userData.orbyTransmissionPatch?.solidMeshGlass, false);
  assert.ok(mat.roughness <= roughnessOn);
});

test('creativeLookTransmissionTuningFromState reads store fields', () => {
  const tuning = creativeLookTransmissionTuningFromState({
    transmissionSamples: 8,
    transmissionDoubleSide: true,
    transmissionSolidMeshGlass: true,
    transmissionDispersion: 0.55,
  });
  assert.equal(tuning.samples, 8);
  assert.equal(tuning.doubleSide, true);
  assert.equal(tuning.solidMeshGlass, true);
  assert.equal(tuning.dispersion, 0.55);
});
