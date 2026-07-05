import { isKeyLightOnlyShadowCastingRenderQuality } from '../constants.js';

/** @typedef {'key' | 'fill' | 'rim'} DirectionalLightId */

export const DIRECTIONAL_LIGHT_IDS = ['key', 'fill', 'rim'];

/** @param {string} lightId @returns {lightId is DirectionalLightId} */
export function isDirectionalLightId(lightId) {
  return DIRECTIONAL_LIGHT_IDS.includes(lightId);
}

/**
 * Per-light cast-shadow intent from state (before runtime gobo override).
 * Used by {@link syncEffectiveCastShadows} and shelf/viewport toggles.
 *
 * @param {object} state
 * @param {DirectionalLightId} lightId
 */
export function resolveLightCastShadowIntent(state, lightId) {
  if (!state?.lightsEnabled || !state?.lightsCastShadows) return false;
  if (
    isKeyLightOnlyShadowCastingRenderQuality(state.renderQuality)
    && lightId !== 'key'
  ) {
    return false;
  }
  const lightsState = state.lights ?? {};
  return lightsState[lightId]?.enabled === true
    && lightsState[lightId]?.castShadows === true;
}

/**
 * Whether a light effectively casts shadow maps in the viewport (intent + gobo override).
 *
 * @param {object} state
 * @param {DirectionalLightId} lightId
 */
export function resolveLightCastShadowEffective(state, lightId) {
  if (!resolveLightCastShadowIntent(state, lightId)) return false;
  if (lightId === 'key' && state.gobo?.enabled) return false;
  return true;
}

/**
 * @param {object} state
 * @param {DirectionalLightId} lightId
 */
export function canToggleLightCastShadowFromViewport(state, lightId) {
  if (!isDirectionalLightId(lightId)) return false;
  if (!state?.showLightIndicators) return false;
  if (
    isKeyLightOnlyShadowCastingRenderQuality(state.renderQuality)
    && lightId !== 'key'
  ) {
    return false;
  }
  return true;
}

/**
 * Apply runtime + UI sync after viewport or shelf cast-shadow state changes.
 *
 * @param {import('../SceneManager.js').SceneManager} scene
 */
export function finishLightCastShadowToggle(scene) {
  scene.lightsCastShadows = !!scene.stateStore.getState().lightsCastShadows;
  scene._syncEffectiveCastShadows();
  scene._syncShadowAndGobo();
  scene._syncHdriShadowReceiverFromState?.();
  scene._syncShadowCameraBounds?.();
  scene.ui?.syncControls?.(scene.stateStore.getState());
  scene.updateLightIndicators?.();
  scene.requestRender?.();
}

/**
 * Set per-light cast shadows from shelf or viewport — also coordinates the global master.
 *
 * @param {import('../SceneManager.js').SceneManager} scene
 * @param {DirectionalLightId} lightId
 * @param {boolean} next
 * @returns {boolean}
 */
export function setPerLightCastShadows(scene, lightId, next) {
  if (!isDirectionalLightId(lightId)) return false;

  const state = scene.stateStore.getState();
  if (
    next
    && isKeyLightOnlyShadowCastingRenderQuality(state.renderQuality)
    && lightId !== 'key'
  ) {
    return false;
  }

  if (state.lightsEnabled === false) {
    if (!next) return false;
    scene.stateStore.set('lightsEnabled', true);
    scene.eventBus.emit('lights:enabled', true);
    scene.lightsController?.setEnabled(true, scene.stateStore.getState().lights);
    if (scene.ui?.inputs?.lightsEnabled) {
      scene.ui.inputs.lightsEnabled.checked = true;
    }
  }

  scene.stateStore.batch(() => {
    scene.stateStore.set(`lights.${lightId}.castShadows`, next);
    if (next && state.lights?.[lightId]?.enabled !== true) {
      scene.stateStore.set(`lights.${lightId}.enabled`, true);
    }
    if (next && !state.lightsCastShadows) {
      scene.stateStore.set('lightsCastShadows', true);
    }
    if (!next) {
      const lights = scene.stateStore.getState().lights ?? {};
      const anyOther = DIRECTIONAL_LIGHT_IDS.some(
        (id) => id !== lightId && lights[id]?.castShadows === true,
      );
      if (!anyOther) {
        scene.stateStore.set('lightsCastShadows', false);
      }
    }
  });

  const after = scene.stateStore.getState();
  if (next && after.lights?.[lightId]?.enabled && !state.lights?.[lightId]?.enabled) {
    scene.lightsController?.updateLightProperty(lightId, 'enabled', true);
    const enabledInput = scene.ui?.inputs?.[`${lightId}LightEnabled`];
    if (enabledInput) enabledInput.checked = true;
  }

  finishLightCastShadowToggle(scene);
  scene.lightIndicatorHud?.update();
  return true;
}

/**
 * Flip per-light cast shadows from the viewport HUD (handles global master too).
 *
 * @param {import('../SceneManager.js').SceneManager} scene
 * @param {DirectionalLightId} lightId
 * @returns {boolean}
 */
export function toggleLightCastShadowFromViewport(scene, lightId) {
  if (!isDirectionalLightId(lightId)) return false;

  const state = scene.stateStore.getState();
  if (!canToggleLightCastShadowFromViewport(state, lightId)) return false;

  const next = !resolveLightCastShadowEffective(state, lightId);
  return setPerLightCastShadows(scene, lightId, next);
}

/**
 * Apply per-light cast-shadow runtime flags from state (call before gobo override).
 *
 * @param {import('../SceneManager.js').SceneManager} scene
 */
export function syncEffectiveCastShadowsFromState(scene) {
  const state = scene.stateStore.getState();
  scene.lightsCastShadows = !!state.lightsCastShadows;
  for (const lightId of DIRECTIONAL_LIGHT_IDS) {
    const perLight = resolveLightCastShadowIntent(state, lightId);
    scene.lightsController?.updateLightProperty(lightId, 'castShadows', perLight);
  }
}
