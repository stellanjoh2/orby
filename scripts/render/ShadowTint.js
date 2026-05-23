import * as THREE from 'three';

export const DEFAULT_SHADOW_OPACITY = 0.25;

const OPAQUE_FRAGMENT = '#include <opaque_fragment>';

/**
 * Shadow sampling matches Three.js r165 (cdn three@0.165.0):
 * getShadow(map, mapSize, bias, radius, coord) — no shadowIntensity uniform.
 */

/**
 * Samples directional shadow maps; leaves `orbyShadowAmt` in scope when USE_SHADOWMAP is set.
 * Pair with `mix( rgb, uOrbyShadowColor, clamp( orbyShadowAmt, 0.0, 1.0 ) )` on the target color.
 */
export const DIRECTIONAL_SHADOW_TINT_SAMPLE_GLSL = `
#ifdef USE_SHADOWMAP
	float orbyShadowLit = 1.0;
	#if NUM_DIR_LIGHT_SHADOWS > 0
		DirectionalLightShadow orbyDirShadow;
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			orbyDirShadow = directionalLightShadows[ i ];
			orbyShadowLit = min(
				orbyShadowLit,
				receiveShadow ? getShadow(
					directionalShadowMap[ i ],
					orbyDirShadow.shadowMapSize,
					orbyDirShadow.shadowBias,
					orbyDirShadow.shadowRadius,
					vDirectionalShadowCoord[ i ]
				) : 1.0
			);
		}
		#pragma unroll_loop_end
	#endif
	float orbyShadowAmt = ( 1.0 - orbyShadowLit ) * uOrbyShadowStrength * uOrbyShadowOpacity;
#endif
`;

const SHADOW_TINT_GLSL = `
${DIRECTIONAL_SHADOW_TINT_SAMPLE_GLSL}
#ifdef USE_SHADOWMAP
	outgoingLight.rgb = mix( outgoingLight.rgb, uOrbyShadowColor, clamp( orbyShadowAmt, 0.0, 1.0 ) );
#endif
`;

const COMMON_INCLUDE = '#include <common>';

function ensureShadowTintUniformDecl(fragmentShader) {
  let fs = fragmentShader;
  if (!fs.includes('uOrbyShadowColor')) {
    fs = fs.replace(
      COMMON_INCLUDE,
      `${COMMON_INCLUDE}\nuniform vec3 uOrbyShadowColor;`,
    );
  }
  if (!fs.includes('uOrbyShadowStrength')) {
    fs = fs.replace(
      COMMON_INCLUDE,
      `${COMMON_INCLUDE}\nuniform float uOrbyShadowStrength;`,
    );
  }
  if (!fs.includes('uOrbyShadowOpacity')) {
    fs = fs.replace(
      COMMON_INCLUDE,
      `${COMMON_INCLUDE}\nuniform float uOrbyShadowOpacity;`,
    );
  }
  return fs;
}

export function isShadowTintPatchableMaterial(material) {
  return !!(
    material?.isMeshStandardMaterial
    || material?.isMeshPhysicalMaterial
  );
}

function resolvePreviousOnBeforeCompile(material) {
  const live = material.onBeforeCompile;
  if (typeof live === 'function' && !live.__orbyShadowTintPatch) {
    if (live.__orbyGoboPatch) {
      const inner = material.userData?.orbyGobo?.previousOnBeforeCompile;
      if (typeof inner === 'function') return inner;
    }
    return live;
  }
  const stored = material.userData?.orbyShadowTint?.previousOnBeforeCompile;
  if (typeof stored === 'function' && !stored.__orbyShadowTintPatch) {
    return stored;
  }
  const original = material.userData?.originalOnBeforeCompile;
  if (typeof original === 'function' && !original.__orbyShadowTintPatch) {
    return original;
  }
  return () => {};
}

function normalizeStrength(strength) {
  const raw = Number(strength);
  if (!Number.isFinite(raw)) return 0;
  return Math.min(1, Math.max(0, raw));
}

function normalizeOpacity(opacity) {
  const raw = Number(opacity);
  if (!Number.isFinite(raw)) return DEFAULT_SHADOW_OPACITY;
  return Math.min(1, Math.max(0, raw));
}

/** @returns {{ color: THREE.Color, strength: number, opacity: number }} */
export function createShadowTintUniformValues(options = {}) {
  return {
    color: new THREE.Color(options.color ?? '#080808'),
    strength: normalizeStrength(options.strength ?? 0),
    opacity: normalizeOpacity(options.opacity ?? DEFAULT_SHADOW_OPACITY),
  };
}

/**
 * Tint shadowed fragments toward a color (black = fully black shadows).
 * Use strength 0 when the 3-point shadow rig is off so HDRI-only lighting is unaffected.
 */
export function applyShadowTintToMaterial(material, options = {}) {
  if (!isShadowTintPatchableMaterial(material)) return;
  if (material.userData?.orbyCreativeLook) return;

  const colorHex = options.color ?? '#080808';
  const strength = normalizeStrength(options.strength ?? 0);
  const opacity = normalizeOpacity(options.opacity ?? DEFAULT_SHADOW_OPACITY);

  if (!material.userData.orbyShadowTint) {
    material.userData.orbyShadowTint = {
      color: new THREE.Color(colorHex),
      strength,
      opacity,
    };
  } else {
    material.userData.orbyShadowTint.color.set(colorHex);
    material.userData.orbyShadowTint.strength = strength;
    material.userData.orbyShadowTint.opacity = opacity;
  }

  const stash = material.userData.orbyShadowTint;
  const goboWrapsShadow =
    material.userData.goboPatched
    && material.onBeforeCompile === material.userData.goboOnBeforeCompile
    && material.userData.orbyGobo?.previousOnBeforeCompile
      === material.userData.shadowTintOnBeforeCompile;
  const hookIntact =
    material.userData.shadowTintPatched
    && (material.onBeforeCompile === material.userData.shadowTintOnBeforeCompile || goboWrapsShadow);

  if (hookIntact && stash.uniforms?.color && stash.uniforms?.opacity) {
    stash.uniforms.color.value.set(colorHex);
    stash.uniforms.strength.value = strength;
    stash.uniforms.opacity.value = opacity;
    return;
  }

  const goboIsOuter =
    material.userData.goboPatched
    && material.onBeforeCompile === material.userData.goboOnBeforeCompile;

  if (material.userData.shadowTintPatched && !goboIsOuter) {
    delete material.userData.shadowTintPatched;
    delete material.userData.shadowTintOnBeforeCompile;
    delete stash.uniforms;
  }

  const previous = resolvePreviousOnBeforeCompile(material);
  stash.previousOnBeforeCompile = previous;

  const tintCompile = function orbyShadowTintCompile(shader) {
    previous.call(material, shader);

    const activeStrength = stash.strength;
    const activeOpacity = stash.opacity;

    if (!shader.fragmentShader.includes('orbyShadowLit')) {
      shader.uniforms.uOrbyShadowColor = { value: stash.color };
      shader.uniforms.uOrbyShadowStrength = { value: activeStrength };
      shader.uniforms.uOrbyShadowOpacity = { value: activeOpacity };
      shader.fragmentShader = ensureShadowTintUniformDecl(shader.fragmentShader);
      shader.fragmentShader = shader.fragmentShader.replace(
        OPAQUE_FRAGMENT,
        `${SHADOW_TINT_GLSL}\n\t${OPAQUE_FRAGMENT}`,
      );
    } else {
      if (shader.uniforms.uOrbyShadowColor) {
        shader.uniforms.uOrbyShadowColor.value.copy(stash.color);
      }
      if (shader.uniforms.uOrbyShadowStrength) {
        shader.uniforms.uOrbyShadowStrength.value = activeStrength;
      }
      if (shader.uniforms.uOrbyShadowOpacity) {
        shader.uniforms.uOrbyShadowOpacity.value = activeOpacity;
      }
    }

    stash.uniforms = {
      color: shader.uniforms.uOrbyShadowColor,
      strength: shader.uniforms.uOrbyShadowStrength,
      opacity: shader.uniforms.uOrbyShadowOpacity,
    };
  };
  tintCompile.__orbyShadowTintPatch = true;

  material.userData.shadowTintPatched = true;
  material.userData.shadowTintOnBeforeCompile = tintCompile;

  const prevCacheKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = function orbyShadowTintCacheKey() {
    const base = typeof prevCacheKey === 'function' ? prevCacheKey() : '';
    return `${base}|orbyShadowTint:${stash.color.getHexString()}:${stash.strength}:${stash.opacity}`;
  };

  if (goboIsOuter) {
    material.userData.orbyGobo.previousOnBeforeCompile = tintCompile;
    material.needsUpdate = true;
    return;
  }

  material.onBeforeCompile = tintCompile;
  material.needsUpdate = true;
}

export function applyShadowTintToObject(object, options = {}) {
  if (!object) return;
  const includeStudioBackdrop = options.includeStudioBackdrop === true;
  object.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    if (!includeStudioBackdrop && child.userData?.orbyStudioBackdrop) return;
    if (child.userData?.meshglBaseGlassReflector) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((mat) => applyShadowTintToMaterial(mat, options));
  });
}

export function clearShadowTintFromMaterial(material) {
  if (!material?.userData?.shadowTintPatched) return;
  const stash = material.userData.orbyShadowTint;
  const previous = stash?.previousOnBeforeCompile;
  if (typeof previous === 'function') {
    material.onBeforeCompile = previous;
  } else {
    delete material.onBeforeCompile;
  }
  delete material.userData.shadowTintPatched;
  delete material.userData.shadowTintOnBeforeCompile;
  if (stash) delete stash.uniforms;
  material.needsUpdate = true;
}

export function clearShadowTintFromObject(object) {
  if (!object) return;
  object.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((mat) => clearShadowTintFromMaterial(mat));
  });
}
