import * as THREE from 'three';

const EXTENSION = 'KHR_materials_pbrSpecularGlossiness';

/**
 * Three.js removed built-in support for KHR_materials_pbrSpecularGlossiness (spec/gloss workflow).
 * Many older Sketchfab / exporter assets still use diffuseTexture + extension instead of baseColorTexture.
 *
 * This registers a GLTFLoader plugin that maps diffuse → map and scalar glossiness → roughness.
 * Packed specularGlossinessTexture does not match metal/rough channel layout; we skip it to avoid wrong shading.
 */
export function registerKHRMaterialsPbrSpecularGlossiness(loader) {
  loader.register((parser) => new GLTFKHRMaterialsPbrSpecularGlossiness(parser));
}

class GLTFKHRMaterialsPbrSpecularGlossiness {
  constructor(parser) {
    this.parser = parser;
    this.name = EXTENSION;
  }

  extendMaterialParams(materialIndex, materialParams) {
    const parser = this.parser;
    const json = parser.json;
    const materials = json.materials;
    if (!materials || !materials[materialIndex]) return Promise.resolve();

    const ext = materials[materialIndex].extensions?.[EXTENSION];
    if (!ext) return Promise.resolve();

    const pending = [];

    if (Array.isArray(ext.diffuseFactor)) {
      const a = ext.diffuseFactor;
      materialParams.color.setRGB(a[0], a[1], a[2], THREE.LinearSRGBColorSpace);
      materialParams.opacity = a[3];
    }

    if (ext.diffuseTexture !== undefined) {
      pending.push(
        parser.assignTexture(materialParams, 'map', ext.diffuseTexture, THREE.SRGBColorSpace),
      );
    }

    const gloss = ext.glossinessFactor !== undefined ? ext.glossinessFactor : 1;
    materialParams.metalness = 0;
    materialParams.roughness = THREE.MathUtils.clamp(1 - gloss, 0.04, 1);

    return Promise.all(pending);
  }
}
