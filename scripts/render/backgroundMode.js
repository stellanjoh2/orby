import { DEFAULT_BACKGROUND_GRADIENT } from './backgroundGradient/backgroundGradientDefaults.js';
import {
  DEFAULT_BACKGROUND_IMAGE,
  normalizeBackgroundImage,
} from './backgroundImage/backgroundImageDefaults.js';

/** @typedef {'solid' | 'gradient' | 'image'} BackgroundMode */

/**
 * @param {{ backgroundSolidEnabled?: boolean, backgroundGradient?: { enabled?: boolean }, backgroundImage?: { enabled?: boolean } } | null | undefined} state
 * @returns {BackgroundMode}
 */
export function getBackgroundMode(state) {
  if (state?.backgroundImage?.enabled) return 'image';
  if (state?.backgroundGradient?.enabled) return 'gradient';
  return 'solid';
}

/**
 * @param {BackgroundMode} mode
 * @returns {{ backgroundSolidEnabled: boolean, backgroundGradient: object, backgroundImage: object }}
 */
export function backgroundModePatch(mode, state) {
  const gradient = state?.backgroundGradient ?? DEFAULT_BACKGROUND_GRADIENT;
  const image = normalizeBackgroundImage(state?.backgroundImage ?? DEFAULT_BACKGROUND_IMAGE);

  return {
    backgroundSolidEnabled: mode === 'solid',
    backgroundGradient: { ...gradient, enabled: mode === 'gradient' },
    backgroundImage: normalizeBackgroundImage({
      ...image,
      enabled: mode === 'image',
    }),
  };
}

/**
 * Switch backdrop mode — color, gradient, or image (only one active).
 *
 * @param {import('../StateStore.js').StateStore} stateStore
 * @param {import('../EventBus.js').EventBus} eventBus
 * @param {BackgroundMode} mode
 */
export function applyBackgroundMode(stateStore, eventBus, mode) {
  const state = stateStore.getState();
  const patch = backgroundModePatch(mode, state);

  stateStore.batch(() => {
    stateStore.set('backgroundSolidEnabled', patch.backgroundSolidEnabled);
    stateStore.set('backgroundGradient', patch.backgroundGradient);
    stateStore.set('backgroundImage', patch.backgroundImage);
  });

  eventBus.emit('scene:background-solid-enabled', patch.backgroundSolidEnabled);
  eventBus.emit('scene:background-gradient', patch.backgroundGradient);
  eventBus.emit('scene:background-image', patch.backgroundImage);
}
