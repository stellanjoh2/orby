/**
 * Dispose model-owned material map textures on teardown.
 * Three.js Material.dispose() does not free attached map textures.
 */

/** @typedef {import('three').Material} ThreeMaterial */
/** @typedef {import('three').Texture} ThreeTexture */

/**
 * Material texture slots owned by imported / assigned model maps.
 * Excludes envMap — studio shading often points at shared scene HDRI.
 */
export const MATERIAL_MAP_TEXTURE_PROPS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
  'displacementMap',
  'bumpMap',
  'lightMap',
  'specularMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'transmissionMap',
  'thicknessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'anisotropyMap',
];

/**
 * @param {ThreeTexture | null | undefined} texture
 * @param {Set<string>} seenUuids
 */
export function disposeOwnedTexture(texture, seenUuids) {
  if (!texture?.isTexture) return;
  if (seenUuids.has(texture.uuid)) return;
  seenUuids.add(texture.uuid);
  const blobUrl = texture.userData?.orbyFbxBlobUrl;
  texture.dispose();
  if (typeof blobUrl === 'string') URL.revokeObjectURL(blobUrl);
}

/**
 * @param {ThreeMaterial | ThreeMaterial[] | null | undefined} material
 * @param {Set<string>} seenUuids
 */
export function disposeMaterialMapTextures(material, seenUuids) {
  if (!material) return;
  const materials = Array.isArray(material) ? material : [material];
  for (const mat of materials) {
    if (!mat) continue;
    for (const prop of MATERIAL_MAP_TEXTURE_PROPS) {
      disposeOwnedTexture(mat[prop], seenUuids);
    }
  }
}
