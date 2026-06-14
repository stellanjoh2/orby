import * as THREE from 'three';
import { registerKHRMaterialsPbrSpecularGlossiness } from '../../../scripts/render/gltfKHRSpecularGlossinessPlugin.js';

const COLOR_TEXTURE_KEYS = ['map', 'emissiveMap'];
const DATA_TEXTURE_KEYS = [
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'alphaMap',
  'bumpMap',
  'displacementMap',
  'lightMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'specularColorMap',
  'specularIntensityMap',
  'transmissionMap',
  'thicknessMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'anisotropyMap',
];

/** @param {import('three/examples/jsm/loaders/GLTFLoader.js').GLTFLoader} loader */
export function configureMobileGltfLoader(loader) {
  registerKHRMaterialsPbrSpecularGlossiness(loader);
}

/** @param {THREE.Material} material */
function applyMaterialTextureColorSpaces(material) {
  for (const key of COLOR_TEXTURE_KEYS) {
    const tex = material[key];
    if (tex?.isTexture && 'colorSpace' in tex) {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
    }
  }
  for (const key of DATA_TEXTURE_KEYS) {
    const tex = material[key];
    if (tex?.isTexture && 'colorSpace' in tex && THREE.NoColorSpace) {
      tex.colorSpace = THREE.NoColorSpace;
      tex.needsUpdate = true;
    }
  }
}

/**
 * Match desktop import color management so GLB albedo/normal/ORM maps display correctly.
 * @param {THREE.Object3D} root
 * @param {{ envMapIntensity?: number }} [opts]
 */
export function prepareMobileImportModel(root, opts = {}) {
  const envMapIntensity = opts.envMapIntensity ?? 2;
  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((material) => {
      if (!material) return;
      applyMaterialTextureColorSpaces(material);
      if ('envMapIntensity' in material) {
        material.envMapIntensity = envMapIntensity;
      }
      material.needsUpdate = true;
    });
  });
}
