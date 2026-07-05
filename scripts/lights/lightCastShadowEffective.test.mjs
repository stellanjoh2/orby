import assert from 'node:assert/strict';
import { test } from 'node:test';
import { castShadowLightIdsForGlobalToggle } from '../constants.js';
import {
  resolveLightCastShadowEffective,
  resolveLightCastShadowIntent,
  setPerLightCastShadows,
  toggleLightCastShadowFromViewport,
} from './lightCastShadowEffective.js';

/** @param {Partial<object>} overrides */
function baseState(overrides = {}) {
  return {
    lightsEnabled: true,
    lightsCastShadows: true,
    renderQuality: 'medium',
    gobo: { enabled: false },
    lights: {
      key: { enabled: true, castShadows: true },
      fill: { enabled: true, castShadows: false },
      rim: { enabled: false, castShadows: true },
    },
    ...overrides,
  };
}

test('resolveLightCastShadowIntent respects global, enabled, and per-light flags', () => {
  const state = baseState();
  assert.equal(resolveLightCastShadowIntent(state, 'key'), true);
  assert.equal(resolveLightCastShadowIntent(state, 'fill'), false);
  assert.equal(resolveLightCastShadowIntent(state, 'rim'), false);

  assert.equal(
    resolveLightCastShadowIntent(baseState({ lightsCastShadows: false }), 'key'),
    false,
  );
  assert.equal(
    resolveLightCastShadowIntent(
      baseState({ lights: { ...baseState().lights, key: { enabled: false, castShadows: true } } }),
      'key',
    ),
    false,
  );
});

test('resolveLightCastShadowIntent blocks fill and rim on Low render quality only', () => {
  const low = baseState({
    renderQuality: 'low',
    lights: {
      key: { enabled: true, castShadows: true },
      fill: { enabled: true, castShadows: true },
      rim: { enabled: true, castShadows: true },
    },
  });
  assert.equal(resolveLightCastShadowIntent(low, 'key'), true);
  assert.equal(resolveLightCastShadowIntent(low, 'fill'), false);
  assert.equal(resolveLightCastShadowIntent(low, 'rim'), false);

  const medium = baseState({
    renderQuality: 'medium',
    lights: {
      key: { enabled: true, castShadows: true },
      fill: { enabled: true, castShadows: true },
      rim: { enabled: true, castShadows: true },
    },
  });
  assert.equal(resolveLightCastShadowIntent(medium, 'key'), true);
  assert.equal(resolveLightCastShadowIntent(medium, 'fill'), true);
  assert.equal(resolveLightCastShadowIntent(medium, 'rim'), true);
});

test('castShadowLightIdsForGlobalToggle defaults key-only on Medium, all three on Ultra', () => {
  assert.deepEqual(castShadowLightIdsForGlobalToggle('low'), ['key']);
  assert.deepEqual(castShadowLightIdsForGlobalToggle('medium'), ['key']);
  assert.deepEqual(castShadowLightIdsForGlobalToggle('max'), ['key', 'fill', 'rim']);
});

test('resolveLightCastShadowEffective applies key-light gobo override', () => {
  const state = baseState({ gobo: { enabled: true } });
  assert.equal(resolveLightCastShadowIntent(state, 'key'), true);
  assert.equal(resolveLightCastShadowEffective(state, 'key'), false);
  assert.equal(resolveLightCastShadowEffective(state, 'fill'), false);
});

/** @param {Partial<object>} overrides */
function mockScene(overrides = {}) {
  const state = baseState(overrides.state);
  const calls = {
    castShadowUpdates: [],
    syncEffective: 0,
    syncShadowGobo: 0,
    updateIndicators: 0,
    requestRender: 0,
  };
  const lights = {
    key: { isDirectionalLight: true, shadow: {}, castShadow: false },
    fill: { isDirectionalLight: true, shadow: {}, castShadow: false },
    rim: { isDirectionalLight: true, shadow: {}, castShadow: false },
  };
  const scene = {
    lightsCastShadows: state.lightsCastShadows,
    stateStore: {
      getState: () => structuredClone(state),
      batch(fn) {
        fn();
      },
      set(path, value) {
        const segments = path.split('.');
        let target = state;
        for (let i = 0; i < segments.length - 1; i += 1) {
          target[segments[i]] = target[segments[i]] ?? {};
          target = target[segments[i]];
        }
        target[segments.at(-1)] = value;
      },
    },
    lightsController: {
      individualProperties: {
        key: {},
        fill: {},
        rim: {},
      },
      lights,
      updateLightProperty(lightId, property, value) {
        if (property === 'castShadows') {
          calls.castShadowUpdates.push([lightId, value]);
          lights[lightId].castShadow = value === true;
          this.individualProperties[lightId].castShadows = value === true;
        }
      },
    },
    _syncEffectiveCastShadows() {
      calls.syncEffective += 1;
      for (const lightId of ['key', 'fill', 'rim']) {
        const perLight = resolveLightCastShadowIntent(state, lightId);
        scene.lightsController.updateLightProperty(lightId, 'castShadows', perLight);
      }
    },
    _syncShadowAndGobo() {
      calls.syncShadowGobo += 1;
    },
    updateLightIndicators() {
      calls.updateIndicators += 1;
    },
    requestRender() {
      calls.requestRender += 1;
    },
    ui: { syncControls() {} },
    lightIndicatorHud: { update() {} },
  };
  return { scene, state, calls };
}

test('toggleLightCastShadowFromViewport enables global shadows when turning a light on', () => {
  const { scene, state, calls } = mockScene({
    state: {
      showLightIndicators: true,
      lightsCastShadows: false,
      lights: {
        key: { enabled: true, castShadows: false },
        fill: { enabled: true, castShadows: false },
        rim: { enabled: true, castShadows: false },
      },
    },
  });

  assert.equal(toggleLightCastShadowFromViewport(scene, 'key'), true);
  assert.equal(state.lightsCastShadows, true);
  assert.equal(state.lights.key.castShadows, true);
  assert.equal(scene.lightsController.lights.key.castShadow, true);
  assert.equal(calls.syncShadowGobo, 1);
  assert.equal(calls.updateIndicators, 1);
  assert.equal(calls.requestRender, 1);
});

test('setPerLightCastShadows enables global shadows for shelf per-light toggles', () => {
  const { scene, state, calls } = mockScene({
    state: {
      lightsCastShadows: false,
      lights: {
        key: { enabled: true, castShadows: false },
        fill: { enabled: true, castShadows: false },
        rim: { enabled: true, castShadows: false },
      },
    },
  });

  assert.equal(setPerLightCastShadows(scene, 'key', true), true);
  assert.equal(state.lightsCastShadows, true);
  assert.equal(state.lights.key.castShadows, true);
  assert.equal(scene.lightsController.lights.key.castShadow, true);
  assert.equal(calls.syncShadowGobo, 1);
});

test('toggleLightCastShadowFromViewport turns shadows back on after disabling the last caster', () => {
  const { scene, state } = mockScene({
    state: {
      showLightIndicators: true,
      lightsCastShadows: false,
      lights: {
        key: { enabled: true, castShadows: false },
        fill: { enabled: true, castShadows: false },
        rim: { enabled: true, castShadows: false },
      },
    },
  });

  assert.equal(toggleLightCastShadowFromViewport(scene, 'key'), true);
  assert.equal(toggleLightCastShadowFromViewport(scene, 'key'), true);
  assert.equal(state.lightsCastShadows, false);
  assert.equal(toggleLightCastShadowFromViewport(scene, 'key'), true);
  assert.equal(state.lightsCastShadows, true);
  assert.equal(scene.lightsController.lights.key.castShadow, true);
});
