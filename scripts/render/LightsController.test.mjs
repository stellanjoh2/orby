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
  const keyRig = controller.lightIndicators.getObjectByName('LightIndicatorGroup_key');
  assert.ok(keyRig, 'key indicator rig should exist');

  const origin = keyLight.position;
  const target = keyLight.target.position;
  const beamLength = origin.distanceTo(target);
  const extent = controller._indicatorFrustumExtent;
  const intensityScale = controller._getBeamConeIntensityScale(keyLight);
  const { coneLength, coneRadius } = controller._getBeamConeDimensions(
    beamLength,
    extent,
    intensityScale,
  );

  assert.ok(Math.abs(keyRig.scale.y - coneLength) < 1e-6, 'cone length should match beam');
  assert.ok(Math.abs(keyRig.scale.x - coneRadius) < 1e-6, 'cone radius should match beam extent');
  const coneRatio = keyRig.scale.x / keyRig.scale.y;
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
  let rigCount = 0;
  controller.lightIndicators.children.forEach((child) => {
    if (!child.userData.lightId) return;
    rigCount += 1;
    assert.ok(child.scale.x >= 0.02, 'cone radius scale should respect minimum size');
    assert.ok(child.scale.y >= 0.04, 'cone height scale should respect minimum size');
  });
  assert.equal(rigCount, 3, 'key, fill, and rim indicators');
  controller.clearIndicators();
});

test('light indicators ignore receive-surface shadow expansion', () => {
  const scene = new THREE.Scene();
  const controller = new LightsController(scene, { enabled: true });
  controller.individualProperties.key.enabled = true;
  controller.lightsEnabled = true;
  controller.setModelBounds(
    {
      center: new THREE.Vector3(0, 0, 0),
      radius: 1,
    },
    { receiveSurfaceRadius: 40 },
  );
  controller.setIndicatorsVisible(true);

  assert.ok(
    controller._shadowFrustumExtent >= 40,
    'shadow frustum should expand for backdrop / catcher reach',
  );
  assert.ok(
    controller._indicatorFrustumExtent < 10,
    'indicator frustum should stay mesh-focused',
  );

  const keyRig = controller.lightIndicators.getObjectByName('LightIndicatorGroup_key');
  const keyLight = controller.lights.key;
  const beamLength = keyLight.position.distanceTo(keyLight.target.position);
  const intensityScale = controller._getBeamConeIntensityScale(keyLight);
  const { coneRadius } = controller._getBeamConeDimensions(
    beamLength,
    controller._indicatorFrustumExtent,
    intensityScale,
  );
  assert.ok(Math.abs(keyRig.scale.x - coneRadius) < 1e-6);

  controller.clearIndicators();
});

test('light indicators work without mesh bounds using focal fallback', () => {
  const scene = new THREE.Scene();
  const controller = new LightsController(scene, { enabled: true });
  controller.individualProperties.key.enabled = true;
  controller.individualProperties.fill.enabled = true;
  controller.individualProperties.rim.enabled = true;
  controller.lightsEnabled = true;
  controller.setIndicatorCenterFallback(new THREE.Vector3(0, 1, 0));
  controller.setIndicatorsVisible(true);

  assert.ok(controller.lightIndicators, 'indicator group should exist without model bounds');
  const layouts = controller.getShadowBadgeLayouts();
  assert.ok(layouts?.key?.visible, 'key HUD layout should be visible');
  assert.ok(
    layouts.key.world.lengthSq() > 1e-6,
    'HUD anchor should not sit at the origin',
  );

  controller.clearIndicators();
});

test('focal fallback aims directional lights when no mesh bounds exist', () => {
  const scene = new THREE.Scene();
  const controller = new LightsController(scene, { enabled: true });
  const focus = new THREE.Vector3(0, 1.25, 0);
  controller.setIndicatorCenterFallback(focus);

  ['key', 'fill', 'rim'].forEach((id) => {
    const light = controller.lights[id];
    assert.ok(light?.target, `${id} light should have a target`);
    assert.ok(
      light.target.position.distanceToSquared(focus) < 1e-8,
      `${id} light target should follow focal fallback`,
    );
  });
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

test('light cone keeps scaling with intensity slider when runtime intensity is clamped', () => {
  const scene = new THREE.Scene();
  const controller = new LightsController(scene, { enabled: true });
  controller.individualProperties.fill.enabled = true;
  controller.lightsEnabled = true;
  controller.setMaster(2);
  controller.setModelBounds({
    center: new THREE.Vector3(0, 0, 0),
    radius: 1,
  });
  controller.setIndicatorsVisible(true);

  const fillLight = controller.lights.fill;
  const fillRig = controller.lightIndicators.getObjectByName('LightIndicatorGroup_fill');
  assert.ok(fillRig, 'fill indicator rig should exist');

  controller.updateLightProperty('fill', 'intensity', 3);
  const scaleAtThree = fillRig.scale.y;
  assert.equal(fillLight.intensity, 10, 'runtime intensity should clamp at 5× multiplier');
  assert.ok(
    controller._getBeamConeIntensityScaleForLightId('fill') < 2.5,
    'slider below max should not hit peak cone scale',
  );

  controller.updateLightProperty('fill', 'intensity', 5);
  const scaleAtFive = fillRig.scale.y;
  assert.equal(fillLight.intensity, 10, 'runtime intensity stays clamped');
  assert.ok(scaleAtFive > scaleAtThree, 'cone should keep growing through slider max');
  assert.ok(
    Math.abs(
      controller._getBeamConeIntensityScaleForLightId('fill') - 2.5,
    ) < 1e-6,
    'slider max should preserve previous peak cone scale',
  );

  controller.clearIndicators();
});
