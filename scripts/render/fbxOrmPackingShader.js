import { FBX_ORM_CHANNEL_LAYOUT } from '../import/fbxMapSlotsSettings.js';

const CHUNK = {
  ao: '#include <aomap_fragment>',
  roughness: '#include <roughnessmap_fragment>',
  metalness: '#include <metalnessmap_fragment>',
};

/**
 * Remap packed ORM RGB channels when layout differs from Three.js glTF default.
 * @param {import('three').Material} material
 * @param {'gltf' | 'unity-hdrp'} packing
 */
export function applyFbxOrmPackingShader(material, packing) {
  if (!material || packing === 'gltf') {
    material?.userData && delete material.userData.orbyFbxOrmPackingShader;
    return;
  }

  const layout = FBX_ORM_CHANNEL_LAYOUT[packing];
  if (!layout) return;

  material.userData.orbyFbxOrmPackingShader = packing;

  const prior = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (typeof prior === 'function') prior(shader, renderer);

    const { fragmentShader } = shader;
    if (!fragmentShader || material.userData?.orbyFbxOrmPackingShader !== packing) return;

    const swizzle = (channel) => {
      if (channel === 'r') return '.r';
      if (channel === 'g') return '.g';
      return '.b';
    };

    let next = fragmentShader;

    const aoSw = swizzle(layout.ao);
    if (aoSw !== '.r' && next.includes(CHUNK.ao)) {
      next = next.replace(
        /vec4 texelAmbientOcclusion\s*=\s*texture2D\(\s*aoMap,\s*vAoMapUv\s*\)\s*;/g,
        `vec4 texelAmbientOcclusion = texture2D( aoMap, vAoMapUv ); texelAmbientOcclusion.r = texelAmbientOcclusion${aoSw};`,
      );
    }

    const roughSw = swizzle(layout.roughness);
    if (roughSw !== '.g' && next.includes(CHUNK.roughness)) {
      next = next.replace(
        /vec4 texelRoughness\s*=\s*texture2D\(\s*roughnessMap,\s*vRoughnessMapUv\s*\)\s*;/g,
        `vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv ); texelRoughness.g = texelRoughness${roughSw};`,
      );
    }

    const metalSw = swizzle(layout.metallic);
    if (metalSw !== '.b' && next.includes(CHUNK.metalness)) {
      next = next.replace(
        /vec4 texelMetalness\s*=\s*texture2D\(\s*metalnessMap,\s*vMetalnessMapUv\s*\)\s*;/g,
        `vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv ); texelMetalness.b = texelMetalness${metalSw};`,
      );
    }

    if (next !== fragmentShader) {
      shader.fragmentShader = next;
    }
  };

  const priorKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = function customProgramCacheKey() {
    const base = typeof priorKey === 'function' ? priorKey() : '';
    return `${base}|orbyOrm:${packing}`;
  };

  material.needsUpdate = true;
}

/**
 * @param {import('three').Material | null | undefined} material
 * @param {'gltf' | 'unity-hdrp'} packing
 */
export function syncFbxOrmPackingOnMaterial(material, packing) {
  if (!material?.isMeshStandardMaterial && !material?.isMeshPhysicalMaterial) return;
  const ao = material.aoMap;
  const usesPackedOrm =
    ao?.isTexture &&
    material.roughnessMap === ao &&
    material.metalnessMap === ao;
  if (!usesPackedOrm) {
    applyFbxOrmPackingShader(material, 'gltf');
    return;
  }
  applyFbxOrmPackingShader(material, packing);
}
