import * as THREE from 'three';
import {
  resolveSpecGlossMaterialParams,
  tagSpecGlossMaterialsFromParser,
} from './gltfSpecGlossConversion.js';

const EXTENSION = 'KHR_materials_pbrSpecularGlossiness';

/**
 * Three.js removed built-in support for KHR_materials_pbrSpecularGlossiness (spec/gloss workflow).
 * Many older Sketchfab / exporter assets still use diffuseTexture + extension instead of baseColorTexture.
 *
 * Maps diffuse → map, glossiness → roughness, and specular → Physical specularColor/intensity.
 * Zero scalar specular (no spec/gloss texture) = diffuse-only — glossiness is ignored.
 * Packed specularGlossinessTexture RGB drives specularColorMap; per-texel glossiness (alpha) is
 * not remapped to roughnessMap without an offline metal/rough bake — Object → Material roughness
 * dulls via scalar roughness + specularIntensity instead.
 */
export function registerKHRMaterialsPbrSpecularGlossiness(loader) {
  loader.register((parser) => new GLTFKHRMaterialsPbrSpecularGlossiness(parser));
}

class GLTFKHRMaterialsPbrSpecularGlossiness {
  constructor(parser) {
    this.parser = parser;
    this.name = EXTENSION;
  }

  getMaterialType(materialIndex) {
    const materials = this.parser.json.materials;
    if (!materials?.[materialIndex]?.extensions?.[EXTENSION]) return null;
    return THREE.MeshPhysicalMaterial;
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

    const hasSpecGlossTexture = ext.specularGlossinessTexture !== undefined;
    const resolved = resolveSpecGlossMaterialParams(ext, { hasSpecGlossTexture });

    materialParams.metalness = resolved.metalness;
    materialParams.roughness = resolved.roughness;
    materialParams.specularIntensity = resolved.specularIntensity;
    materialParams.specularColor = resolved.specularColor;

    if (hasSpecGlossTexture) {
      pending.push(
        parser.assignTexture(
          materialParams,
          'specularColorMap',
          ext.specularGlossinessTexture,
          THREE.SRGBColorSpace,
        ),
      );
    }

    return Promise.all(pending);
  }

  afterRoot() {
    tagSpecGlossMaterialsFromParser(this.parser);
  }
}
