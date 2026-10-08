/**
 * Object → Material saturation — per-mesh albedo chroma (not Camera & FX saturation).
 * Injects after `color_fragment` so map × tint is adjusted together.
 */

import {
  DEFAULT_MATERIAL_SATURATION,
  MATERIAL_SATURATION_UI_MAX,
} from '../constants.js';

export { DEFAULT_MATERIAL_SATURATION, MATERIAL_SATURATION_UI_MAX };

export const MATERIAL_SATURATION_MIN = 0;

const UNIFORM = 'uOrbyMaterialSaturation';
const MARKER = '/* orbyMaterialSaturation */';

const INJECT = /* glsl */ `${MARKER}
	{
		float orbyMatSatLuma = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
		diffuseColor.rgb = mix( vec3( orbyMatSatLuma ), diffuseColor.rgb, ${UNIFORM} );
	}
`;

/** Prefer inject after color_fragment; fall back to map_fragment. */
function injectSaturationGlsl(fragmentShader) {
  if (!fragmentShader || fragmentShader.includes(MARKER)) return fragmentShader;
  if (fragmentShader.includes('#include <color_fragment>')) {
    return fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>\n${INJECT}`,
    );
  }
  if (fragmentShader.includes('#include <map_fragment>')) {
    return fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>\n${INJECT}`,
    );
  }
  return fragmentShader;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function clampMaterialSaturation(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_MATERIAL_SATURATION;
  return Math.min(MATERIAL_SATURATION_UI_MAX, Math.max(MATERIAL_SATURATION_MIN, n));
}

/**
 * @param {import('three').Material | null | undefined} material
 */
function materialSupportsSaturationPatch(material) {
  return !!(
    material
    && (material.isMeshStandardMaterial
      || material.isMeshPhysicalMaterial
      || material.isMeshBasicMaterial
      || material.isMeshPhongMaterial
      || material.isMeshLambertMaterial)
    && !material.userData?.orbyCreativeLook
  );
}

/**
 * Live-update or install Object → Material saturation on a display material.
 * @param {import('three').Material | null | undefined} material
 * @param {number} saturation
 */
export function syncMaterialSaturation(material, saturation) {
  if (!materialSupportsSaturationPatch(material)) return;

  const amount = clampMaterialSaturation(saturation);
  material.userData.orbyMaterialSaturation = amount;

  const uniform = material.userData.orbyMaterialSaturationUniform;
  if (uniform) {
    uniform.value = amount;
  }

  // Already installed (outer wrap, or nested under Fresnel / surface) — value only.
  if (material.userData.orbyMaterialSaturationPatched) {
    return;
  }

  // Identity default: skip custom program until the user moves the slider.
  if (Math.abs(amount - DEFAULT_MATERIAL_SATURATION) < 1e-4) {
    return;
  }

  const prior = material.onBeforeCompile;
  const compile = (shader, renderer) => {
    if (typeof prior === 'function') prior(shader, renderer);

    const sat = clampMaterialSaturation(material.userData.orbyMaterialSaturation);
    if (!shader.uniforms[UNIFORM]) {
      shader.uniforms[UNIFORM] = { value: sat };
    } else {
      shader.uniforms[UNIFORM].value = sat;
    }
    material.userData.orbyMaterialSaturationUniform = shader.uniforms[UNIFORM];

    if (!shader.fragmentShader.includes(`uniform float ${UNIFORM};`)) {
      shader.fragmentShader = `uniform float ${UNIFORM};\n${shader.fragmentShader}`;
    }
    shader.fragmentShader = injectSaturationGlsl(shader.fragmentShader);
  };
  compile.__orbyMaterialSaturationPatch = true;

  material.onBeforeCompile = compile;
  material.userData.orbyMaterialSaturationOnBeforeCompile = compile;
  material.userData.orbyMaterialSaturationPatched = true;

  const priorKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = function customProgramCacheKey() {
    const base = typeof priorKey === 'function' ? priorKey() : '';
    return `${base}|orbyMatSat`;
  };

  material.needsUpdate = true;
}

/**
 * @param {import('three').Object3D | null | undefined} root
 * @param {number} saturation
 * @param {(material: import('three').Material, child: import('three').Mesh) => boolean} [skip]
 */
export function syncMaterialSaturationOnObject(root, saturation, skip = null) {
  if (!root) return;
  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (typeof skip === 'function' && skip(mat, child)) continue;
      syncMaterialSaturation(mat, saturation);
    }
  });
}

/** @visibleForTesting */
export function injectMaterialSaturationFragmentForTest(fragmentShader) {
  return injectSaturationGlsl(fragmentShader);
}
