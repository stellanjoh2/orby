import {
  createModifierEntryDefaults,
  normalizeModifiersState,
} from '../state/defaults/modifierDefaults.js';

/**
 * Persist the active modifier sliders for a shape-library mesh id.
 * @param {import('../StateStore.js').StateStore} stateStore
 * @param {string} shapeId
 */
export function saveShapeLibraryMeshModifiers(stateStore, shapeId) {
  if (!stateStore || !shapeId) return;
  const modifiers = normalizeModifiersState(stateStore.getState()?.modifiers);
  stateStore.set(`shapeLibrary.meshModifiers.${shapeId}`, modifiers);
}

/**
 * Restore modifier sliders for a shape-library mesh id (defaults when unseen).
 * @param {import('../StateStore.js').StateStore} stateStore
 * @param {string} shapeId
 */
export function loadShapeLibraryMeshModifiers(stateStore, shapeId) {
  if (!stateStore || !shapeId) return;
  const cached = stateStore.getState()?.shapeLibrary?.meshModifiers?.[shapeId];
  const modifiers = normalizeModifiersState(cached ?? createModifierEntryDefaults());
  stateStore.set('modifiers', modifiers);
}

/**
 * Clear cached modifiers for a shape-library mesh id (e.g. section reset).
 * @param {import('../StateStore.js').StateStore} stateStore
 * @param {string} shapeId
 */
export function clearShapeLibraryMeshModifiers(stateStore, shapeId) {
  if (!stateStore || !shapeId) return;
  stateStore.set(`shapeLibrary.meshModifiers.${shapeId}`, createModifierEntryDefaults());
}
