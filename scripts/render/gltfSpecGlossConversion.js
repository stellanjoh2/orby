import * as THREE from 'three';

/** glTF spec/gloss default when `specularFactor` is omitted. */
export const SPEC_GLOSS_DEFAULT_SPECULAR = [1, 1, 1];

/** Treat scalar specular this small as diffuse-only (common Sketchfab export). */
export const SPEC_GLOSS_DIFFUSE_ONLY_EPSILON = 1e-4;

/**
 * Convert KHR_materials_pbrSpecularGlossiness scalars to MeshPhysicalMaterial fields.
 * When specular is ~0 and no spec/gloss texture is present, glossiness is ignored — the
 * extension defines a diffuse-only surface (see Drogon / many legacy Sketchfab GLBs).
 *
 * @param {object} ext — material.extensions.KHR_materials_pbrSpecularGlossiness
 * @param {{ hasSpecularGlossinessTexture?: boolean }} [options]
 * @returns {{
 *   metalness: number,
 *   roughness: number,
 *   specularIntensity: number,
 *   specularColor: THREE.Color,
 *   diffuseOnly: boolean,
 * }}
 */
export function resolveSpecGlossMaterialParams(ext, options = {}) {
  const spec = Array.isArray(ext?.specularFactor)
    ? ext.specularFactor
    : SPEC_GLOSS_DEFAULT_SPECULAR;
  const specMax = Math.max(spec[0], spec[1], spec[2]);
  const hasSpecGlossTexture = options.hasSpecularGlossinessTexture === true;
  const gloss = ext?.glossinessFactor !== undefined ? ext.glossinessFactor : 1;

  const specularColor = new THREE.Color(1, 1, 1);
  const diffuseOnly = specMax < SPEC_GLOSS_DIFFUSE_ONLY_EPSILON && !hasSpecGlossTexture;

  if (diffuseOnly) {
    return {
      metalness: 0,
      roughness: 1,
      specularIntensity: 0,
      specularColor: specularColor.setRGB(0, 0, 0),
      diffuseOnly: true,
    };
  }

  specularColor.setRGB(
    THREE.MathUtils.clamp(spec[0], 0, 1),
    THREE.MathUtils.clamp(spec[1], 0, 1),
    THREE.MathUtils.clamp(spec[2], 0, 1),
    THREE.LinearSRGBColorSpace,
  );

  if (specMax < SPEC_GLOSS_DIFFUSE_ONLY_EPSILON && hasSpecGlossTexture) {
    // Texture RGB carries specular; scalar modulator stays white.
    specularColor.setRGB(1, 1, 1);
  }

  return {
    metalness: 0,
    roughness: THREE.MathUtils.clamp(1 - gloss, 0.04, 1),
    specularIntensity: 1,
    specularColor,
    diffuseOnly: false,
  };
}

/**
 * Read spec/gloss metadata stored on import materials (`userData.gltfExtensions`).
 * @param {object | undefined} gltfExtensions
 * @returns {{ orbySpecGlossDiffuseOnly: true, orbySpecGlossAuthoredGlossiness: number } | null}
 */
export function readSpecGlossImportMetadata(gltfExtensions) {
  const ext = gltfExtensions?.KHR_materials_pbrSpecularGlossiness;
  if (!ext) return null;
  const hasSpecGlossTexture = ext.specularGlossinessTexture !== undefined;
  const resolved = resolveSpecGlossMaterialParams(ext, { hasSpecGlossTexture });
  if (!resolved.diffuseOnly) return null;
  return {
    orbySpecGlossDiffuseOnly: true,
    orbySpecGlossAuthoredGlossiness:
      ext.glossinessFactor !== undefined ? ext.glossinessFactor : 1,
  };
}

/**
 * Tag a loaded glTF material with spec/gloss slider metadata (registered extensions are not
 * copied to `userData.gltfExtensions` by THREE.GLTFLoader).
 * @param {import('three').Material} material
 * @param {object} ext — KHR_materials_pbrSpecularGlossiness payload
 * @returns {boolean} true when tagged as diffuse-only spec/gloss
 */
export function applySpecGlossMaterialUserData(material, ext) {
  if (!material?.userData || !ext) return false;
  const hasSpecGlossTexture = ext.specularGlossinessTexture !== undefined;
  const resolved = resolveSpecGlossMaterialParams(ext, { hasSpecGlossTexture });
  if (!resolved.diffuseOnly) {
    delete material.userData.orbySpecGlossDiffuseOnly;
    delete material.userData.orbySpecGlossAuthoredGlossiness;
    return false;
  }
  material.userData.orbySpecGlossDiffuseOnly = true;
  material.userData.orbySpecGlossAuthoredGlossiness =
    ext.glossinessFactor !== undefined ? ext.glossinessFactor : 1;
  return true;
}

/**
 * Walk GLTFLoader associations and tag spec/gloss materials after parse.
 * @param {import('three/examples/jsm/loaders/GLTFLoader.js').GLTFParser} parser
 */
export function tagSpecGlossMaterialsFromParser(parser) {
  if (!parser?.associations || !parser.json?.materials) return;
  for (const [object, assoc] of parser.associations) {
    if (!object?.isMaterial) continue;
    const materialIndex = assoc?.materials;
    if (materialIndex === undefined) continue;
    const ext =
      parser.json.materials[materialIndex]?.extensions?.KHR_materials_pbrSpecularGlossiness;
    if (ext) applySpecGlossMaterialUserData(object, ext);
  }
}

/**
 * Diffuse-only spec/gloss imports: multiplier 1.0 = matte as-authored; lower values reintroduce
 * gloss up to the file's authored glossiness (slider 0 → full file gloss).
 *
 * @param {number} globalRoughnessMultiplier — Object → Material roughness slider (0–1)
 * @param {number} authoredGlossiness — glTF glossinessFactor from the file
 * @returns {{ roughness: number, specularIntensity: number, specularColor: THREE.Color }}
 */
export function applySpecGlossDiffuseOnlyRoughnessSlider(
  globalRoughnessMultiplier,
  authoredGlossiness,
) {
  const globalR = THREE.MathUtils.clamp(
    Number.isFinite(Number(globalRoughnessMultiplier))
      ? Number(globalRoughnessMultiplier)
      : 1,
    0,
    1,
  );
  const gloss = Number.isFinite(Number(authoredGlossiness)) ? Number(authoredGlossiness) : 0;
  const minRough = THREE.MathUtils.clamp(1 - gloss, 0.04, 1);
  const t = 1 - globalR;
  const roughness = THREE.MathUtils.lerp(1, minRough, t);
  const specularColor = new THREE.Color(0, 0, 0);
  if (t > SPEC_GLOSS_DIFFUSE_ONLY_EPSILON) {
    specularColor.setRGB(1, 1, 1);
  }
  return {
    roughness,
    specularIntensity: t,
    specularColor,
  };
}
