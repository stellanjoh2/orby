import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { LightsController } from './LightsController.js';

test('light indicators match beam frustum length and angle', () => {
  const scene = new THREE.Scene();
  const controller = new LightsController(scene, { enabled: true });
  controller.individualProperties.key.enabled = true;
  controller.lightsEnabled = true;
  controller.setModelBounds({
    center: new THREE.Vector3(0, 0, 0),
    radius: 1,
  });
  controller.setIndicatorsVisible(true);

  assert.ok(controller.lightIndicators, 'indicator group should exist');
  const keyLight = controller.lights.key;
  const keyCone = controller.lightIndicators.getObjectByName('LightIndicator_key');
  assert.ok(keyCone, 'key cone should exist');

  const origin = keyLight.position;
  const target = keyLight.target.position;
  const beamLength = origin.distanceTo(target);
  const extent = controller._shadowFrustumExtent;
  const intensityScale = controller._getBeamConeIntensityScale(keyLight);
  const { coneLength, coneRadius } = controller._getBeamConeDimensions(
    beamLength,
    extent,
    intensityScale,
  );

  assert.ok(Math.abs(keyCone.scale.y - coneLength) < 1e-6, 'cone length should match beam');
  assert.ok(Math.abs(keyCone.scale.x - coneRadius) < 1e-6, 'cone radius should match beam extent');
  const coneRatio = keyCone.scale.x / keyCone.scale.y;
  const expectedRatio = coneRadius / coneLength;
  assert.ok(Math.abs(coneRatio - expectedRatio) < 1e-6, 'cone half-angle should match beam wireframe');

  controller.clearIndicators();
});

test('light indicators use a minimum cone size on tiny bounds', () => {
  const scene = new THREE.Scene();
  const controller = new LightsController(scene, { enabled: true });
  controller.setModelBounds({
    center: new THREE.Vector3(),
    radius: 1e-8,
  });
  controller.setIndicatorsVisible(true);

  assert.ok(controller.lightIndicators, 'indicator group should exist');
  let meshCount = 0;
  controller.lightIndicators.traverse((child) => {
    if (!child.isMesh) return;
    meshCount += 1;
    assert.ok(child.scale.x >= 0.02, 'cone radius scale should respect minimum size');
    assert.ok(child.scale.y >= 0.04, 'cone height scale should respect minimum size');
  });
  assert.equal(meshCount, 3, 'key, fill, and rim indicators');
  controller.clearIndicators();
});

test('light falloff wireframes are created for each directional light', () => {
  const scene = new THREE.Scene();
  const controller = new LightsController(scene, { enabled: true });
  controller.individualProperties.key.enabled = true;
  controller.individualProperties.fill.enabled = true;
  controller.individualProperties.rim.enabled = true;
  controller.lightsEnabled = true;
  controller.setModelBounds({
    center: new THREE.Vector3(0, 1, 0),
    radius: 1,
  });
  controller.setFalloffIndicatorsVisible(true);

  assert.ok(controller.lightFalloffIndicators, 'falloff group should exist');
  assert.equal(controller.lightFalloffIndicators.children.length, 3);
  controller.clearFalloffIndicators();
});
