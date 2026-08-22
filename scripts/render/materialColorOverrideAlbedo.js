/**
 * Override colour must replace opaque import albedo, not only multiply it.
 * Three.js shades `material.color × material.map`, so leaving an opaque map
 * makes a swatch look like a weak tint on busy textures.
 *
 * Transparent / decal materials (Sketchfab ground shadows, BLEND, MASK) keep
 * their albedo so alpha stays in the texture. Moving that map to `alphaMap`
 * does not work — Three.js reads the green channel, not the alpha channel,
 * and the decal turns into a solid slab.
 *
 * @param {import('three').Material | null | undefined} importMat
 */
export function importMaterialUsesAlphaAlbedo(importMat) {
  if (!importMat) return false;
  const baseline = importMat.userData?.orbyGltfImportBaseline;
  if (baseline?.transparent) return true;
  if (Number.isFinite(baseline?.opacity) && baseline.opacity < 0.999) return true;
  if (baseline?.alphaMode === 'BLEND' || baseline?.alphaMode === 'MASK') return true;
  const mode = importMat.userData?.alphaMode;
  if (mode === 'BLEND' || mode === 'MASK') return true;
  if (importMat.transparent) return true;
  if (Number.isFinite(importMat.opacity) && importMat.opacity < 0.999) return true;
  if (importMat.alphaMap?.isTexture) return true;
  if (Number(importMat.alphaTest) > 0) return true;
  return false;
}

/**
 * @param {import('three').Material | null | undefined} importMat
 * @param {boolean} overrideOn
 * @returns {{ map: import('three').Texture | null, alphaMap: import('three').Texture | null, vertexColors: boolean }}
 */
export function resolveColorOverrideAlbedoSlots(importMat, overrideOn) {
  const map = importMat?.map?.isTexture ? importMat.map : null;
  const alphaMap = importMat?.alphaMap?.isTexture ? importMat.alphaMap : null;
  const vertexColors = !!importMat?.vertexColors;
  if (!overrideOn || importMaterialUsesAlphaAlbedo(importMat)) {
    return { map, alphaMap, vertexColors };
  }
  return {
    map: null,
    alphaMap,
    vertexColors: false,
  };
}
