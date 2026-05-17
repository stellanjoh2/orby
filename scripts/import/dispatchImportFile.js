/**
 * Detect Orby scene archives picked via the shared file input or drag-and-drop.
 */

/**
 * @param {File | null | undefined} file
 * @returns {boolean}
 */
export function isOrbySceneFile(file) {
  if (!file?.name) return false;
  return file.name.toLowerCase().endsWith('.orby');
}
