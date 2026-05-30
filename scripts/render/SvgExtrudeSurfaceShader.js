export const SVG_EXTRUDE_SURFACE_PRESETS = [
  { id: 'none', label: 'Default (smooth)' },
  { id: 'carPaint', label: 'Car paint (metallic flake)' },
  { id: 'brushed', label: 'Brushed metal' },
  { id: 'ceramic', label: 'Ceramic (micro-grain)' },
  { id: 'satin', label: 'Satin plastic' },
];

const PRESET_TO_INDEX = {
  none: 0,
  carPaint: 1,
  brushed: 2,
  ceramic: 3,
  satin: 4,
};

const clampScale = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1.0;
  return Math.max(0.12, Math.min(10, n));
};

export function getSvgExtrudeSurfacePresetIndex(presetId) {
  return PRESET_TO_INDEX[presetId] ?? 0;
}

/**
 * Hook that should run inside the SVG surface wrapper (Fresnel when both are active).
 * @param {THREE.Material} material
 */
export function resolveSvgSurfacePreviousHook(material) {
  const live = material.onBeforeCompile;

  if (typeof live === 'function' && live.__orbySvgSurfPatch) {
    const stored = material.userData?.svgExtrudeProceduralPrevious;
    if (typeof stored === 'function' && !stored.__orbySvgSurfPatch) {
      return stored;
    }
  }

  // Shadow tint / gobo must stay outside Fresnel in the compile chain — never skip them.
  if (
    material.userData?.shadowTintPatched &&
    typeof material.userData.shadowTintOnBeforeCompile === 'function'
  ) {
    return material.userData.shadowTintOnBeforeCompile;
  }
  if (
    material.userData?.goboPatched &&
    typeof material.userData.goboOnBeforeCompile === 'function'
  ) {
    return material.userData.goboOnBeforeCompile;
  }

  if (
    material.userData?.fresnelPatched &&
    typeof material.userData.fresnelOnBeforeCompile === 'function'
  ) {
    return material.userData.fresnelOnBeforeCompile;
  }
  if (typeof live === 'function' && !live.__orbySvgSurfPatch && !live.__orbyFresnelShaderPatch) {
    return live;
  }
  const stored = material.userData?.svgExtrudeProceduralPrevious;
  if (typeof stored === 'function' && !stored.__orbySvgSurfPatch) {
    return stored;
  }
  return () => {};
}

/**
 * Whether Fresnel's onBeforeCompile is reachable from the SVG surface wrapper.
 * @param {THREE.Material} material
 */
export function isFresnelLinkedInSvgSurfaceChain(material) {
  if (!material.userData?.fresnelPatched) return true;
  if (material.onBeforeCompile === material.userData.fresnelOnBeforeCompile) {
    return true;
  }
  if (!material.userData?.svgExtrudeProceduralPatched) {
    return false;
  }
  return material.userData.svgExtrudeProceduralPrevious === material.userData.fresnelOnBeforeCompile;
}

const FRAG_HELPERS = /* glsl */ `
varying vec3 vOrbyWorldPos;
uniform float uOrbySurfaceMode;
uniform float uOrbyScale;
float orbyQ(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.199))) * 43758.5453);
}
float orbyFbm3(vec3 p) {
  float t = 0.0; float a = 0.5;
  t += a * orbyQ(p); p = p * 2.1 + 1.0; a *= 0.5;
  t += a * orbyQ(p); p = p * 2.0 + 0.2; a *= 0.5;
  t += a * orbyQ(p); p = p * 1.8 + 0.1; a *= 0.5;
  t += a * orbyQ(p);
  return t;
}
`;

const METALNESS_INJECT = /* glsl */ `	#include <metalnessmap_fragment>
	// orby_svg_surf
	{
		float mode = uOrbySurfaceMode;
		if ( mode >= 0.5 ) {
			vec3 p = vOrbyWorldPos * uOrbyScale;
			if ( mode < 1.5 ) {
				// Car paint: metallic flake — gentler than hard binary cells; avoids paper-thin spec (harsh white/black)
				float baseF = 0.80 + 0.20 * orbyFbm3( p * 2.4 );
				float fineF = 0.90 + 0.10 * orbyFbm3( p * 15.0 );
				float hBig = orbyQ( floor( p * 36.0 ) + 0.1 * orbyFbm3( p * 0.45 ) );
				float hMic = orbyQ( floor( p * 92.0 ) + floor( p.z * 6.0 ) * 0.13 );
				float bigFlake = smoothstep( 0.35, 0.88, hBig ) * 0.72;
				float microFlake = smoothstep( 0.80, 0.97, hMic ) * 0.65;
				float rStd = roughnessFactor * baseF * fineF;
				float rBig = 0.10 + 0.12 * ( 1.0 - bigFlake * 0.55 ) * ( 0.5 + 0.5 * fineF );
				float rMic = 0.08 + 0.09 * ( 1.0 - microFlake * 0.65 );
				float w = max( bigFlake * 0.58, microFlake * 0.55 );
				roughnessFactor = mix( rStd, min( rStd, min( rBig, rMic ) ), w );
				roughnessFactor = clamp( roughnessFactor, 0.08, 1.0 );
				metalnessFactor = clamp( metalnessFactor + 0.22 * w * ( 0.4 + 0.6 * baseF ) + 0.08 * bigFlake, 0.0, 1.0 );
			} else if ( mode < 2.5 ) {
				vec3 ax = p * vec3( 0.2, 18.0, 18.0 );
				float streak = orbyFbm3( ax * vec3( 0.2, 1.0, 1.0 ) );
				float rdir = 0.5 + 0.5 * sin( p.x * 55.0 + streak * 3.0 );
				roughnessFactor = clamp( roughnessFactor * ( 0.78 + 0.32 * rdir ), 0.04, 1.0 );
			} else if ( mode < 3.5 ) {
				// Ceramic: visible micro-grain + slow blotches (matte / glazed, non-metallic)
				float coarse = 0.5 + 0.5 * orbyFbm3( p * 2.2 );
				float fine = 0.5 + 0.5 * orbyFbm3( p * 14.0 );
				float g = 0.5 * coarse + 0.5 * fine;
				roughnessFactor = clamp( roughnessFactor * ( 0.72 + 0.48 * g ), 0.04, 1.0 );
				roughnessFactor = clamp( roughnessFactor + 0.12 * ( orbyFbm3( p * 26.0 ) - 0.5 ), 0.04, 1.0 );
			} else {
				// Satin: soft broad + mid waves (velvety plastic)
				float broad = 0.5 + 0.5 * orbyFbm3( p * 0.7 );
				float wavy = 0.5 + 0.5 * orbyFbm3( p * 3.2 );
				float t = 0.55 * broad + 0.45 * wavy;
				roughnessFactor = clamp( roughnessFactor * ( 0.58 + 0.52 * t ), 0.04, 1.0 );
			}
		}
	}
`;

const ORBY_SVG_WORLD_POS_VS = /* glsl */ `
	vec4 orbySvgW = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		orbySvgW = batchingMatrix * orbySvgW;
	#endif
	#ifdef USE_INSTANCING
		orbySvgW = instanceMatrix * orbySvgW;
	#endif
	vOrbyWorldPos = ( modelMatrix * orbySvgW ).xyz;
`;

function injectOrbyWorldPositionVertex(vs) {
  if (vs.indexOf('vOrbyWorldPos') !== -1) return vs;

  vs = vs.replace(
    '#include <common>',
    '#include <common>\nvarying vec3 vOrbyWorldPos;\n',
  );

  const projectHook = '#include <project_vertex>';
  if (vs.indexOf(projectHook) !== -1) {
    return vs.replace(projectHook, `${projectHook}${ORBY_SVG_WORLD_POS_VS}`);
  }

  const worldPosHook = '#include <worldpos_vertex>';
  if (vs.indexOf(worldPosHook) !== -1) {
    return vs.replace(
      worldPosHook,
      `${worldPosHook}
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined( USE_SHADOWMAP ) || defined( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vOrbyWorldPos = worldPosition.xyz;
#else${ORBY_SVG_WORLD_POS_VS}
#endif`,
    );
  }

  const viewPosMatch = vs.match(/^[ \t]*vViewPosition\s*=\s*-\s*mvPosition\.xyz\s*;/m);
  if (viewPosMatch) {
    return vs.replace(viewPosMatch[0], `${ORBY_SVG_WORLD_POS_VS}${viewPosMatch[0]}`);
  }

  return vs;
}

function applyShaderPatches(shader, uniformRefs) {
  let vs = shader.vertexShader;
  vs = injectOrbyWorldPositionVertex(vs);
  shader.vertexShader = vs;

  let fs = shader.fragmentShader;
  if (fs.indexOf('uOrbySurfaceMode') === -1) {
    fs = fs.replace(
      '#include <common>',
      `#include <common>\n${FRAG_HELPERS}\n`,
    );
  }
  if (fs.indexOf('orby_svg_surf') === -1) {
    const mLine = '	#include <metalnessmap_fragment>';
    if (fs.indexOf(mLine) !== -1) {
      fs = fs.replace(mLine, METALNESS_INJECT);
    } else if (fs.indexOf('#include <metalnessmap_fragment>') !== -1) {
      fs = fs.replace('#include <metalnessmap_fragment>', METALNESS_INJECT);
    }
  }
  shader.fragmentShader = fs;

  shader.uniforms.uOrbySurfaceMode = uniformRefs.uOrbySurfaceMode;
  shader.uniforms.uOrbyScale = uniformRefs.uOrbyScale;
}

/**
 * @param {THREE.MeshStandardMaterial} material
 * @param {{ previous?: (s:object) => void, uniformRefs: { uOrbySurfaceMode: { value: number }, uOrbyScale: { value: number } } }} args
 * @returns {(s: { vertexShader: string, fragmentShader: string, uniforms: object }) => void}
 */
function createOnBefore(args) {
  const hook = (shader) => {
    if (typeof args.previous === 'function') {
      args.previous(shader);
    }
    applyShaderPatches(shader, args.uniformRefs);
  };
  hook.__orbySvgSurfPatch = true;
  return hook;
}

/**
 * @param {THREE.MeshStandardMaterial} material
 * @param {number} presetIndex
 * @param {number} scale
 */
function getOrUpdateUniformRefs(material, presetIndex, scale) {
  let uniformRefs = material.userData?.svgExtrudeProceduralUniforms;
  if (!uniformRefs) {
    uniformRefs = {
      uOrbySurfaceMode: { value: presetIndex },
      uOrbyScale: { value: scale },
    };
  } else {
    uniformRefs.uOrbySurfaceMode.value = presetIndex;
    uniformRefs.uOrbyScale.value = scale;
  }
  return uniformRefs;
}

/**
 * @param {THREE.MeshStandardMaterial} material
 * @param {{ presetIndex: number, scale: number }} opts
 * @returns {boolean}
 */
export function applySvgExtrudeProceduralToMaterial(material, opts) {
  if (!material || !material.isMeshStandardMaterial) return false;
  const presetIndex = Math.max(0, Math.min(4, Math.floor(Number(opts.presetIndex)) || 0));
  const scale = clampScale(opts.scale);
  if (presetIndex < 1) {
    removeSvgExtrudeProceduralFromMaterial(material);
    return true;
  }

  const uniformRefs = getOrUpdateUniformRefs(material, presetIndex, scale);
  const prevPreset = material.userData?.svgExtrudeProceduralPresetIndex;
  const prevScale = material.userData?.svgExtrudeProceduralScale;
  const presetChanged = prevPreset !== presetIndex || prevScale !== scale;
  material.userData.svgExtrudeProceduralPresetIndex = presetIndex;
  material.userData.svgExtrudeProceduralScale = scale;

  const hadPatch = !!material.userData?.svgExtrudeProceduralPatched;
  const storedHook = material.userData?.svgExtrudeProceduralOnBeforeCompile;
  const hookIsLive =
    hadPatch && typeof storedHook === 'function' && material.onBeforeCompile === storedHook;

  if (hadPatch && !hookIsLive) {
    removeSvgExtrudeProceduralFromMaterial(material);
  }

  if (!material.userData?.svgExtrudeProceduralPatched) {
    const previous = resolveSvgSurfacePreviousHook(material);
    material.userData.svgExtrudeProceduralPrevious = previous;
    const hook = createOnBefore({ previous, uniformRefs });
    material.onBeforeCompile = hook;
    material.userData.svgExtrudeProceduralUniforms = uniformRefs;
    material.userData.svgExtrudeProceduralPatched = true;
    material.userData.svgExtrudeProceduralOnBeforeCompile = hook;
    material.customProgramCacheKey = () =>
      `orbySvgSurf:${presetIndex}:${scale.toFixed(3)}`;
    material.needsUpdate = true;
    return true;
  }

  material.userData.svgExtrudeProceduralUniforms = uniformRefs;
  material.customProgramCacheKey = () =>
    `orbySvgSurf:${presetIndex}:${scale.toFixed(3)}`;
  if (presetChanged) {
    material.needsUpdate = true;
  }
  return true;
}

/**
 * @param {THREE.Material} material
 */
export function removeSvgExtrudeProceduralFromMaterial(material) {
  if (!material || !material.userData?.svgExtrudeProceduralPatched) return;
  const fresnelHook =
    material.userData.fresnelPatched && material.userData.fresnelOnBeforeCompile;
  const live = material.onBeforeCompile;
  if (typeof fresnelHook === 'function' && live?.__orbySvgSurfPatch) {
    // SVG was outer; keep Fresnel as the live hook instead of stale svgExtrudeProceduralPrevious.
    material.onBeforeCompile = fresnelHook;
  } else {
    const prev = material.userData.svgExtrudeProceduralPrevious;
    if (typeof prev === 'function') {
      material.onBeforeCompile = prev;
    } else {
      delete material.onBeforeCompile;
    }
  }
  delete material.userData.svgExtrudeProceduralPatched;
  delete material.userData.svgExtrudeProceduralPrevious;
  delete material.userData.svgExtrudeProceduralOnBeforeCompile;
  delete material.userData.svgExtrudeProceduralUniforms;
  delete material.userData.svgExtrudeProceduralPresetIndex;
  delete material.userData.svgExtrudeProceduralScale;
  delete material.customProgramCacheKey;
  material.needsUpdate = true;
}

/**
 * @param {THREE.Object3D} model
 * @param {{ getState: () => object } | { stateStore: { getState: () => object } }} storeLike
 * @param {string} [shadingOverride]
 */
export function reapplySvgExtrudeProceduralFromState(model, storeLike, shadingOverride) {
  if (!model || !storeLike) return;
  const st =
    typeof storeLike.getState === 'function'
      ? storeLike.getState()
      : storeLike.stateStore?.getState?.();
  if (!st) return;
  const shading = shadingOverride ?? st.shading;
  const idx = getSvgExtrudeSurfacePresetIndex(st.svgExtrude?.surfacePreset ?? 'none');
  const scale = clampScale(st.svgExtrude?.surfaceScale ?? 1);
  const stripProcedural =
    shading === 'textures' ||
    shading === 'wireframe' ||
    !st.svgExtrude?.enabled ||
    idx < 1;

  model.traverse((child) => {
    if (!child.isMesh || !child.userData?.orbySvgExtrude) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    if (stripProcedural) {
      mats.forEach((m) => removeSvgExtrudeProceduralFromMaterial(m));
    } else {
      mats.forEach((m) => {
        if (m?.isMeshStandardMaterial || m?.isMeshPhysicalMaterial) {
          applySvgExtrudeProceduralToMaterial(m, { presetIndex: idx, scale });
        }
      });
    }
  });
}
