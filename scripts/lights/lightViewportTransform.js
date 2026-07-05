import { isDirectionalLightId } from './lightCastShadowEffective.js';

export const LIGHT_ROTATE_MIN = 0;
export const LIGHT_ROTATE_MAX = 360;
export const LIGHT_HEIGHT_MIN = 0;
export const LIGHT_HEIGHT_MAX = 10;

/** @param {number} value */
export function wrapLightRotateDeg(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return ((n % 360) + 360) % 360;
}

/** @param {number} value */
export function clampLightHeight(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(LIGHT_HEIGHT_MAX, Math.max(LIGHT_HEIGHT_MIN, n));
}

/**
 * @param {number} currentDeg
 * @param {number} deltaDeg
 * @param {{ fine?: boolean }} [options]
 */
export function applyPerLightRotateDelta(currentDeg, deltaDeg, { fine = false } = {}) {
  const scale = fine ? 0.25 : 1;
  return wrapLightRotateDeg(currentDeg + deltaDeg * scale);
}

/**
 * @param {number} currentHeight
 * @param {number} deltaHeight
 * @param {{ fine?: boolean }} [options]
 */
export function applyPerLightHeightDelta(currentHeight, deltaHeight, { fine = false } = {}) {
  const scale = fine ? 0.25 : 1;
  return clampLightHeight(currentHeight + deltaHeight * scale);
}

/**
 * @param {object} state
 * @param {string} lightId
 */
export function canAdjustLightTransformFromViewport(state, lightId) {
  if (!isDirectionalLightId(lightId)) return false;
  if (!state?.showLightIndicators || state.lightsEnabled === false) return false;
  return true;
}

/**
 * @param {import('../SceneManager.js').SceneManager} scene
 * @param {string} lightId
 */
export function readPerLightTransform(scene, lightId) {
  const props = scene.lightsController?.individualProperties?.[lightId];
  const stateLight = scene.stateStore.getState().lights?.[lightId];
  return {
    rotate: wrapLightRotateDeg(props?.rotate ?? stateLight?.rotate ?? 0),
    height: clampLightHeight(props?.height ?? stateLight?.height ?? 5),
  };
}

/**
 * Live viewport drag — updates runtime + UI labels without StateStore churn.
 *
 * @param {import('../SceneManager.js').SceneManager} scene
 * @param {string} lightId
 * @param {{ rotate?: number, height?: number }} transform
 */
export function applyPerLightTransformLive(scene, lightId, { rotate, height }) {
  const lc = scene.lightsController;
  if (!lc) return;

  if (rotate !== undefined) {
    const nextRotate = wrapLightRotateDeg(rotate);
    lc.updateLightProperty(lightId, 'rotate', nextRotate);
    const rotateInput = scene.ui?.inputs?.[`${lightId}LightRotate`];
    if (rotateInput) rotateInput.value = String(nextRotate);
    scene.ui?.helpers?.updateValueLabel?.(`${lightId}LightRotate`, nextRotate, 'angle');
  }

  if (height !== undefined) {
    const nextHeight = clampLightHeight(height);
    lc.updateLightProperty(lightId, 'height', nextHeight);
    const heightInput = scene.ui?.inputs?.[`${lightId}LightHeight`];
    if (heightInput) heightInput.value = String(nextHeight);
    scene.ui?.helpers?.updateValueLabel?.(`${lightId}LightHeight`, nextHeight, 'decimal');
  }

  if (lightId === 'key' && scene.goboProjection?.enabled) {
    scene.goboProjection.syncUniformsOnScene(scene._getGoboSceneTargets?.());
  }

  scene.updateLightIndicators?.();
  scene.requestRender?.();
}

/**
 * Flush per-light transform to StateStore after a viewport drag ends.
 *
 * @param {import('../SceneManager.js').SceneManager} scene
 * @param {string} lightId
 * @param {{ rotate?: number, height?: number }} transform
 */
export function commitPerLightTransform(scene, lightId, { rotate, height }) {
  const state = scene.stateStore.getState();
  const hadKeyLensFlare =
    lightId === 'key'
    && !scene._applyingKeyLightFromLensFlare
    && state.lensFlare?.keyLightConnected;

  if (rotate !== undefined) {
    const nextRotate = wrapLightRotateDeg(rotate);
    scene.stateStore.set(`lights.${lightId}.rotate`, nextRotate);
    scene.eventBus.emit('lights:update', {
      lightId,
      property: 'rotate',
      value: nextRotate,
    });
  }

  if (height !== undefined) {
    const nextHeight = clampLightHeight(height);
    scene.stateStore.set(`lights.${lightId}.height`, nextHeight);
    scene.eventBus.emit('lights:update', {
      lightId,
      property: 'height',
      value: nextHeight,
    });
  }

  if (hadKeyLensFlare && (rotate !== undefined || height !== undefined)) {
    scene.setLensFlareKeyLightConnected?.(false);
  }

  if (lightId === 'key' && (rotate !== undefined || height !== undefined)) {
    scene._syncShadowCameraBounds?.();
  }
}
