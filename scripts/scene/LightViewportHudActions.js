import {
  isDirectionalLightId,
  toggleLightCastShadowFromViewport,
} from '../lights/lightCastShadowEffective.js';

/**
 * Viewport spotlight HUD actions — shadow, power, color, and intensity shortcuts.
 * Keeps SceneManager slim; writes through the same sync paths as the shelf.
 */
export class LightViewportHudActions {
  /** @param {import('../SceneManager.js').SceneManager} scene */
  constructor(scene) {
    this.scene = scene;
  }

  /** @param {string} lightId @returns {boolean} */
  toggleCastShadows(lightId) {
    return toggleLightCastShadowFromViewport(this.scene, lightId);
  }

  /** @param {string} lightId @returns {boolean} */
  toggleLightEnabled(lightId) {
    if (!isDirectionalLightId(lightId)) return false;

    const scene = this.scene;
    const state = scene.stateStore.getState();
    if (!state.showLightIndicators || state.lightsEnabled === false) return false;

    const current = state.lights?.[lightId]?.enabled === true;
    const next = !current;

    scene.stateStore.set(`lights.${lightId}.enabled`, next);
    scene.eventBus.emit('lights:update', {
      lightId,
      property: 'enabled',
      value: next,
    });

    const enabledInput = scene.ui?.inputs?.[`${lightId}LightEnabled`];
    if (enabledInput) enabledInput.checked = next;

    scene.ui?.syncControls?.(scene.stateStore.getState());
    scene.updateLightIndicators();
    scene.lightIndicatorHud?.update();
    scene.requestRender();
    return true;
  }

  /**
   * @param {string} lightId
   * @param {number} value
   */
  setLightIntensity(lightId, value) {
    if (!isDirectionalLightId(lightId)) return;

    const scene = this.scene;
    const raw = Number(value);
    if (!Number.isFinite(raw)) return;

    const next = Math.min(5, Math.max(0, raw));
    scene.stateStore.set(`lights.${lightId}.intensity`, next);
    scene.eventBus.emit('lights:update', {
      lightId,
      property: 'intensity',
      value: next,
    });

    const strengthInput = scene.ui?.inputs?.[`${lightId}LightStrength`];
    if (strengthInput) strengthInput.value = String(next);
    scene.ui?.helpers?.updateValueLabel?.(`${lightId}LightStrength`, next, 'decimal');

    scene.updateLightIndicators();
    scene.lightIndicatorHud?.update();
    scene.requestRender();
  }

  /**
   * @param {string} lightId
   * @param {number} clientX
   * @param {number} clientY
   * @param {HTMLElement} [clickTarget]
   * @returns {boolean}
   */
  openColorPicker(lightId, clientX, clientY, clickTarget) {
    if (!isDirectionalLightId(lightId)) return false;

    const scene = this.scene;
    const state = scene.stateStore.getState();
    if (!state.showLightIndicators || state.lightsEnabled === false) return false;

    const input =
      scene.ui?.inputs?.[`${lightId}LightColor`]
      ?? document.getElementById(`${lightId}LightColor`);
    if (!(input instanceof HTMLInputElement)) return false;

    scene.ui?.colorPickerController?.openForInput?.(input, {
      clientX,
      clientY,
      placement: 'viewport-hud',
      clickTarget,
    });
    return true;
  }
}
