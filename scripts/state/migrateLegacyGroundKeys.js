/**
 * Older .orby / scene JSON used `podium*` keys. Canonical keys are `base*`.
 * Mutates `obj` in place when a legacy key is present and the new key is missing.
 * @param {Record<string, unknown> | null | undefined} obj
 */
export function migrateLegacyGroundKeys(obj) {
  if (!obj || typeof obj !== 'object') return;
  const pairs = [
    ['podiumScale', 'baseScale'],
    ['podiumMetalness', 'baseMetalness'],
    ['podiumRoughness', 'baseRoughness'],
    ['podiumReflection', 'baseReflection'],
    ['podiumClearcoat', 'baseClearcoat'],
    ['podiumGlassSurface', 'baseGlassSurface'],
    ['podiumGlassBlur', 'baseGlassBlur'],
    ['podiumGlassAmount', 'baseGlassAmount'],
    ['podiumGlassBrightness', 'baseGlassBrightness'],
  ];
  for (const [legacy, next] of pairs) {
    if (obj[next] === undefined && obj[legacy] !== undefined) {
      obj[next] = obj[legacy];
    }
  }
  if (obj.baseGlassSurface === undefined && obj.podiumReflectMesh !== undefined) {
    obj.baseGlassSurface = obj.podiumReflectMesh;
  }
  if (obj.baseColor === undefined && obj.podiumColor !== undefined) {
    obj.baseColor = obj.podiumColor;
  }
}
