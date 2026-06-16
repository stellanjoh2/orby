/**
 * Mobile-only fix for portrait viewports: Shader Lab pixel passes scale cell size
 * from uResolution against a fixed landscape reference (EGA 640×350, etc.), which
 * turns square macro blocks into tall rectangles on 9:16 phones.
 *
 * Pin the reference grid to the live drawing-buffer dimensions so uCellSize stays
 * square. Desktop Orby keeps the shared pass defaults — this runs only from
 * MobileCreativeLookPost.setSize().
 */

/** @type {WeakSet<object>} Passes pinned to the preview grid during JPEG export. */
const exportPreviewPinned = new WeakSet();

/**
 * @param {object | null | undefined} pass
 * @returns {boolean}
 */
export function isMobileExportPixelReferencePinned(pass) {
  return !!pass && exportPreviewPinned.has(pass);
}

/**
 * Keep preview cell density when export backing-store size differs from the live viewport.
 * @param {object | null | undefined} pass
 * @param {number} previewPhysW
 * @param {number} previewPhysH
 */
export function pinMobileExportPixelReference(pass, previewPhysW, previewPhysH) {
  if (!pass?.material?.uniforms?.uCellSize || !pass._referenceLogicalSize) return;
  exportPreviewPinned.add(pass);
  pass._referenceLogicalSize.set(Math.max(1, previewPhysW), Math.max(1, previewPhysH));
  pass._referencePinned = true;
  pass._applyCellSize?.();
}

/** @param {object | null | undefined} pass */
export function unpinMobileExportPixelReference(pass) {
  if (!pass) return;
  exportPreviewPinned.delete(pass);
  pass._referencePinned = false;
}

/**
 * @param {readonly object[]} passes
 * @param {number} previewPhysW
 * @param {number} previewPhysH
 */
export function pinMobileExportPixelReferences(passes, previewPhysW, previewPhysH) {
  for (const pass of passes) {
    pinMobileExportPixelReference(pass, previewPhysW, previewPhysH);
  }
}

/** @param {readonly object[]} passes */
export function unpinMobileExportPixelReferences(passes) {
  for (const pass of passes) {
    unpinMobileExportPixelReference(pass);
  }
}

/**
 * @param {object | null | undefined} pass
 * @param {number} physW
 * @param {number} physH
 */
export function pinMobileSquarePixelReference(pass, physW, physH) {
  if (!pass?.material?.uniforms?.uCellSize || !pass._referenceLogicalSize) return;
  if (exportPreviewPinned.has(pass)) return;
  pass._referenceLogicalSize.set(Math.max(1, physW), Math.max(1, physH));
  pass._referencePinned = true;
  pass._applyCellSize?.();
}

/**
 * @param {readonly object[]} passes
 * @param {number} physW
 * @param {number} physH
 */
export function pinMobileSquarePixelReferences(passes, physW, physH) {
  for (const pass of passes) {
    pinMobileSquarePixelReference(pass, physW, physH);
  }
}
