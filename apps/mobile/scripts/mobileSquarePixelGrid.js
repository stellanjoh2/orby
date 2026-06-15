/**
 * Mobile-only fix for portrait viewports: Shader Lab pixel passes scale cell size
 * from uResolution against a fixed landscape reference (EGA 640×350, etc.), which
 * turns square macro blocks into tall rectangles on 9:16 phones.
 *
 * Pin the reference grid to the live drawing-buffer dimensions so uCellSize stays
 * square. Desktop Orby keeps the shared pass defaults — this runs only from
 * MobileCreativeLookPost.setSize().
 */

/**
 * @param {object | null | undefined} pass
 * @param {number} physW
 * @param {number} physH
 */
export function pinMobileSquarePixelReference(pass, physW, physH) {
  if (!pass?.material?.uniforms?.uCellSize || !pass._referenceLogicalSize) return;
  pass._referenceLogicalSize.set(Math.max(1, physW), Math.max(1, physH));
  pass._referencePinned = true;
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
