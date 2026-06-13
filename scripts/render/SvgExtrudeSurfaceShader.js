import * as THREE from 'three';

export const SVG_EXTRUDE_SURFACE_PRESETS = [
  { id: 'none', label: 'Default (smooth)', kind: 'none' },
  { id: 'carPaint', label: 'Car paint (metallic flake)', kind: 'procedural', proceduralIndex: 1 },
  { id: 'brushed', label: 'Brushed metal', kind: 'procedural', proceduralIndex: 2 },
  { id: 'ceramic', label: 'Ceramic (micro-grain)', kind: 'procedural', proceduralIndex: 3 },
  {
    id: 'scratchedMetal',
    label: 'Scratched metal',
    kind: 'normalMap',
    normalMapUrl: 'assets/images/ScratchedPaintedMetal01_1K_Normal.png',
    strength: 0.58,
  },
  {
    id: 'brushedIron',
    label: 'Brushed iron',
    kind: 'normalMap',
    normalMapUrl: 'assets/images/BrushedIron02_1K_Normal.png',
    strength: 0.58,
  },
  {
    id: 'dirtyMetal',
    label: 'Dirty metal',
    kind: 'normalMap',
    normalMapUrl: 'assets/images/Bronze03_1K_Normal.png',
    strength: 0.58,
  },
  {
    id: 'galvanizedSteel',
    label: 'Galvanized steel',
    kind: 'normalMap',
    normalMapUrl: 'assets/images/GalvanizedSteel01_1K_Normal.png',
    strength: 0.58,
  },
];

const PRESET_BY_ID = Object.fromEntries(
  SVG_EXTRUDE_SURFACE_PRESETS.map((p) => [p.id, p]),
);

const PRESET_TO_INDEX = {
  none: 0,
  carPaint: 1,
  brushed: 2,
  ceramic: 3,
  scratchedMetal: 0,
  brushedIron: 0,
  dirtyMetal: 0,
  galvanizedSteel: 0,
};

const normalTextureCache = new Map();
let normalTextureLoader = null;

const clampScale = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1.0;
  return Math.max(0.12, Math.min(10, n));
};

/** UI slider range for surface detail (stored in state; lower = finer pattern). */
export const SURFACE_UI_SCALE_MIN = 0.2;
export const SURFACE_UI_SCALE_MAX = 10;

export function clampSurfaceUiScale(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1.0;
  return Math.max(SURFACE_UI_SCALE_MIN, Math.min(SURFACE_UI_SCALE_MAX, n));
}

/** Stored UI scale → shader frequency (higher = finer detail). */
export function surfaceUiScaleToShaderScale(uiScale) {
  const ui = clampSurfaceUiScale(uiScale);
  return clampScale(1 / ui);
}

export function clampSurfaceStrength(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1.0;
  return Math.max(0, Math.min(2, n));
}

/** User strength (0–2, default 1) × preset base strength for normal-map surfaces. */
export function resolveSvgExtrudeNormalStrength(config, surfaceStrength) {
  if (!config || config.kind !== 'normalMap') return 0;
  const base = config.strength ?? 0.55;
  return base * clampSurfaceStrength(surfaceStrength);
}

export function getSvgExtrudeSurfacePresetConfig(presetId) {
  return PRESET_BY_ID[presetId] ?? PRESET_BY_ID.none;
}

export function getSvgExtrudeSurfacePresetIndex(presetId) {
  return PRESET_TO_INDEX[presetId] ?? 0;
}

function resolveNormalMapUrl(url) {
  if (!url) return '';
  if (/^(?:https?:)?\/\//.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  const normalized = String(url).replace(/^\.?\//, '');
  return new URL(`../../${normalized}`, import.meta.url).href;
}

function getNormalMapTexture(url) {
  const resolvedUrl = resolveNormalMapUrl(url);
  if (!resolvedUrl) return null;
  if (normalTextureCache.has(resolvedUrl)) {
    return normalTextureCache.get(resolvedUrl);
  }
  if (!normalTextureLoader) {
    normalTextureLoader = new THREE.TextureLoader();
  }
  const tex = normalTextureLoader.load(resolvedUrl);
  tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if ('colorSpace' in tex && THREE.NoColorSpace) {
    tex.colorSpace = THREE.NoColorSpace;
  }
  normalTextureCache.set(resolvedUrl, tex);
  return tex;
}

/**
 * Object-space triplanar anchor + inverse bbox size (isotropic tiling on caps/sides/bevels).
 * Font extrude normalizes XY without Z — uncorrected triplanar stretches oblique faces.
 * @param {THREE.Mesh} mesh
 * @returns {{ origin: THREE.Vector3, invSize: THREE.Vector3 } | null}
 */
export function computeExtrudeSurfaceMappingBounds(mesh) {
  const geom = mesh?.geometry;
  if (!geom) return null;
  if (!geom.boundingBox) geom.computeBoundingBox();
  if (!geom.boundingBox || geom.boundingBox.isEmpty()) return null;
  const origin = geom.boundingBox.getCenter(new THREE.Vector3());
  const size = new THREE.Vector3();
  geom.boundingBox.getSize(size);
  const invSize = new THREE.Vector3(
    1 / Math.max(size.x, 1e-5),
    1 / Math.max(size.y, 1e-5),
    1 / Math.max(size.z, 1e-5),
  );
  return { origin, invSize };
}

/** @deprecated Use computeExtrudeSurfaceMappingBounds */
export function computeMeshLocalNormalOrigin(mesh) {
  const bounds = computeExtrudeSurfaceMappingBounds(mesh);
  return bounds ? { origin: bounds.origin } : null;
}

/**
 * @param {object} uniformRefs
 * @param {{ origin: THREE.Vector3, invSize?: THREE.Vector3 } | null} bounds
 */
function setNormalBoundsUniforms(uniformRefs, bounds) {
  if (!uniformRefs.uOrbyNormalOrigin) {
    uniformRefs.uOrbyNormalOrigin = { value: new THREE.Vector3() };
  }
  if (!uniformRefs.uOrbyNormalInvSize) {
    uniformRefs.uOrbyNormalInvSize = { value: new THREE.Vector3(1, 1, 1) };
  }
  const o = uniformRefs.uOrbyNormalOrigin.value;
  const inv = uniformRefs.uOrbyNormalInvSize.value;
  if (bounds) {
    o.copy(bounds.origin);
    if (bounds.invSize) {
      inv.copy(bounds.invSize);
    } else {
      inv.set(1, 1, 1);
    }
  } else {
    o.set(0, 0, 0);
    inv.set(1, 1, 1);
  }
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
  if (!material.userData?.svgExtrudeProceduralPatched) {
    return (
      material.onBeforeCompile === material.userData.fresnelOnBeforeCompile ||
      typeof material.onBeforeCompile !== 'function'
    );
  }
  return (
    material.onBeforeCompile === material.userData.svgExtrudeProceduralOnBeforeCompile &&
    material.userData.svgExtrudeProceduralPrevious === material.userData.fresnelOnBeforeCompile
  );
}

/**
 * SVG surface must wrap Fresnel. Repairs live hook order when Fresnel was patched as outer.
 * @param {THREE.Material} material
 * @returns {boolean} whether the chain was repaired (triggers needsUpdate)
 */
export function ensureSvgExtrudeFresnelChain(material) {
  if (!material?.userData?.fresnelPatched || !material.userData?.svgExtrudeProceduralPatched) {
    return false;
  }
  const fresnelHook = material.userData.fresnelOnBeforeCompile;
  const svgHook = material.userData.svgExtrudeProceduralOnBeforeCompile;
  if (typeof fresnelHook !== 'function' || typeof svgHook !== 'function') {
    return false;
  }

  let repaired = false;
  if (material.userData.svgExtrudeProceduralPrevious !== fresnelHook) {
    material.userData.svgExtrudeProceduralPrevious = fresnelHook;
    repaired = true;
  }
  if (material.onBeforeCompile !== svgHook) {
    material.onBeforeCompile = svgHook;
    repaired = true;
  }
  if (repaired) {
    material.needsUpdate = true;
  }
  return repaired;
}

const FRAG_HELPERS = /* glsl */ `
varying vec3 vOrbyWorldPos;
varying vec3 vOrbyLocalPos;
varying vec3 vOrbyLocalNormal;
varying vec3 vOrbyNm0;
varying vec3 vOrbyNm1;
varying vec3 vOrbyNm2;
uniform float uOrbySurfaceMode;
uniform float uOrbyScale;
uniform float uOrbyNormalStrength;
uniform sampler2D uOrbyNormalMap;
uniform vec3 uOrbyNormalOrigin;
uniform vec3 uOrbyNormalInvSize;
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
mat3 orbyNormalMatrix() {
  return mat3( vOrbyNm0, vOrbyNm1, vOrbyNm2 );
}
vec3 orbyTriplanarAxisNormal( vec3 n, vec3 tn, vec3 ref, vec3 refAlt ) {
  vec3 t = cross( ref, n );
  if ( dot( t, t ) < 1e-8 ) {
    t = cross( refAlt, n );
  }
  if ( dot( t, t ) < 1e-8 ) {
    return n;
  }
  t = normalize( t );
  vec3 b = normalize( cross( n, t ) );
  return normalize( tn.x * t + tn.y * b + tn.z * n );
}
vec3 orbyTriplanarNormalObject( vec3 localPos, vec3 localNormal, float scale ) {
  vec3 n = normalize( localNormal );
  vec3 p = ( localPos - uOrbyNormalOrigin ) * uOrbyNormalInvSize;
  vec3 blend = abs( n );
  blend = pow( max( blend, vec3( 0.00001 ) ), vec3( 4.0 ) );
  blend /= ( blend.x + blend.y + blend.z );
  vec3 tX = texture2D( uOrbyNormalMap, p.zy * scale ).xyz * 2.0 - 1.0;
  vec3 tY = texture2D( uOrbyNormalMap, p.xz * scale ).xyz * 2.0 - 1.0;
  vec3 tZ = texture2D( uOrbyNormalMap, p.xy * scale ).xyz * 2.0 - 1.0;
  vec3 nx = orbyTriplanarAxisNormal( n, tX, vec3( 0.0, 1.0, 0.0 ), vec3( 0.0, 0.0, 1.0 ) );
  vec3 ny = orbyTriplanarAxisNormal( n, tY, vec3( 0.0, 0.0, 1.0 ), vec3( 1.0, 0.0, 0.0 ) );
  vec3 nz = orbyTriplanarAxisNormal( n, tZ, vec3( 1.0, 0.0, 0.0 ), vec3( 0.0, 1.0, 0.0 ) );
  return normalize( nx * blend.x + ny * blend.y + nz * blend.z );
}
`;

/** Glass reflector subset — no vOrbyNm* (vertex shader does not supply them). */
const GLASS_FRAG_HELPERS = /* glsl */ `
varying vec3 vOrbyWorldPos;
varying vec3 vOrbyLocalPos;
varying vec3 vOrbyLocalNormal;
uniform float uOrbySurfaceMode;
uniform float uOrbyScale;
uniform float uOrbyNormalStrength;
uniform sampler2D uOrbyNormalMap;
uniform vec3 uOrbyNormalOrigin;
uniform vec3 uOrbyNormalInvSize;
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
vec3 orbyTriplanarAxisNormal( vec3 n, vec3 tn, vec3 ref, vec3 refAlt ) {
  vec3 t = cross( ref, n );
  if ( dot( t, t ) < 1e-8 ) {
    t = cross( refAlt, n );
  }
  if ( dot( t, t ) < 1e-8 ) {
    return n;
  }
  t = normalize( t );
  vec3 b = normalize( cross( n, t ) );
  return normalize( tn.x * t + tn.y * b + tn.z * n );
}
vec3 orbyTriplanarNormalObject( vec3 localPos, vec3 localNormal, float scale ) {
  vec3 n = normalize( localNormal );
  vec3 p = ( localPos - uOrbyNormalOrigin ) * uOrbyNormalInvSize;
  vec3 blend = abs( n );
  blend = pow( max( blend, vec3( 0.00001 ) ), vec3( 4.0 ) );
  blend /= ( blend.x + blend.y + blend.z );
  vec3 tX = texture2D( uOrbyNormalMap, p.zy * scale ).xyz * 2.0 - 1.0;
  vec3 tY = texture2D( uOrbyNormalMap, p.xz * scale ).xyz * 2.0 - 1.0;
  vec3 tZ = texture2D( uOrbyNormalMap, p.xy * scale ).xyz * 2.0 - 1.0;
  vec3 nx = orbyTriplanarAxisNormal( n, tX, vec3( 0.0, 1.0, 0.0 ), vec3( 0.0, 0.0, 1.0 ) );
  vec3 ny = orbyTriplanarAxisNormal( n, tY, vec3( 0.0, 0.0, 1.0 ), vec3( 1.0, 0.0, 0.0 ) );
  vec3 nz = orbyTriplanarAxisNormal( n, tZ, vec3( 1.0, 0.0, 0.0 ), vec3( 0.0, 1.0, 0.0 ) );
  return normalize( nx * blend.x + ny * blend.y + nz * blend.z );
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
			}
		}
	}
`;

const NORMAL_INJECT_AFTER_MAPS = /* glsl */ `	#include <normal_fragment_maps>
	// orby_svg_norm
	if ( uOrbyNormalStrength > 0.0001 ) {
		vec3 orbyLocalTn = orbyTriplanarNormalObject(
			vOrbyLocalPos,
			normalize( vOrbyLocalNormal ),
			uOrbyScale
		);
		vec3 orbyViewTn = normalize( orbyNormalMatrix() * orbyLocalTn );
		normal = normalize( mix( normal, orbyViewTn, uOrbyNormalStrength ) );
	}
`;

/** @deprecated chunk — kept for older three builds */
const NORMAL_INJECT_LEGACY = /* glsl */ `	#include <normal_fragment>
	// orby_svg_norm
	if ( uOrbyNormalStrength > 0.0001 ) {
		vec3 orbyLocalTn = orbyTriplanarNormalObject(
			vOrbyLocalPos,
			normalize( vOrbyLocalNormal ),
			uOrbyScale
		);
		vec3 orbyViewTn = normalize( orbyNormalMatrix() * orbyLocalTn );
		normal = normalize( mix( normal, orbyViewTn, uOrbyNormalStrength ) );
	}
`;

const ORBY_SVG_LOCAL_VS = /* glsl */ `
	vOrbyLocalPos = transformed;
	vOrbyLocalNormal = normalize( objectNormal );
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
	vOrbyNm0 = normalMatrix[0];
	vOrbyNm1 = normalMatrix[1];
	vOrbyNm2 = normalMatrix[2];
`;

function injectOrbyVertex(vs) {
  if (vs.indexOf('vOrbyWorldPos') !== -1) return vs;

  vs = vs.replace(
    '#include <common>',
    `#include <common>
varying vec3 vOrbyWorldPos;
varying vec3 vOrbyLocalPos;
varying vec3 vOrbyLocalNormal;
varying vec3 vOrbyNm0;
varying vec3 vOrbyNm1;
varying vec3 vOrbyNm2;
`,
  );

  const skinHook = '#include <skinning_vertex>';
  if (vs.indexOf(skinHook) !== -1) {
    vs = vs.replace(skinHook, `${skinHook}\n${ORBY_SVG_LOCAL_VS}`);
  } else {
    const morphHook = '#include <morphtarget_vertex>';
    if (vs.indexOf(morphHook) !== -1) {
      vs = vs.replace(morphHook, `${morphHook}\n${ORBY_SVG_LOCAL_VS}`);
    } else if (vs.indexOf('#include <begin_vertex>') !== -1) {
      vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>\n${ORBY_SVG_LOCAL_VS}`);
    }
  }

  const projectHook = '#include <project_vertex>';
  if (vs.indexOf(projectHook) !== -1) {
    vs = vs.replace(projectHook, `${projectHook}\n${ORBY_SVG_WORLD_POS_VS}`);
  } else {
    const worldPosHook = '#include <worldpos_vertex>';
    if (vs.indexOf(worldPosHook) !== -1) {
      vs = vs.replace(
        worldPosHook,
        `${worldPosHook}\n	vOrbyWorldPos = worldPosition.xyz;`,
      );
    }
  }

  return vs;
}

function applyShaderPatches(shader, uniformRefs) {
  let vs = shader.vertexShader;
  vs = injectOrbyVertex(vs);
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
  if (fs.indexOf('orby_svg_norm') === -1) {
    const mapsLine = '	#include <normal_fragment_maps>';
    if (fs.indexOf(mapsLine) !== -1) {
      fs = fs.replace(mapsLine, NORMAL_INJECT_AFTER_MAPS);
    } else if (fs.indexOf('#include <normal_fragment_maps>') !== -1) {
      fs = fs.replace('#include <normal_fragment_maps>', NORMAL_INJECT_AFTER_MAPS);
    } else {
      const legacyLine = '	#include <normal_fragment>';
      if (fs.indexOf(legacyLine) !== -1) {
        fs = fs.replace(legacyLine, NORMAL_INJECT_LEGACY);
      } else if (fs.indexOf('#include <normal_fragment>') !== -1) {
        fs = fs.replace('#include <normal_fragment>', NORMAL_INJECT_LEGACY);
      }
    }
  }
  shader.fragmentShader = fs;

  shader.uniforms.uOrbySurfaceMode = uniformRefs.uOrbySurfaceMode;
  shader.uniforms.uOrbyScale = uniformRefs.uOrbyScale;
  shader.uniforms.uOrbyNormalStrength = uniformRefs.uOrbyNormalStrength;
  shader.uniforms.uOrbyNormalMap = uniformRefs.uOrbyNormalMap;
  shader.uniforms.uOrbyNormalOrigin = uniformRefs.uOrbyNormalOrigin;
  shader.uniforms.uOrbyNormalInvSize = uniformRefs.uOrbyNormalInvSize;
}

/**
 * @param {THREE.MeshStandardMaterial} material
 * @param {{ previous?: (s:object) => void, uniformRefs: object }} args
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
 * @param {{ proceduralIndex: number, scale: number, normalStrength: number, normalMap: THREE.Texture | null, presetId: string }} opts
 */
function getOrUpdateUniformRefs(material, opts) {
  let uniformRefs = material.userData?.svgExtrudeProceduralUniforms;
  if (!uniformRefs) {
    uniformRefs = {
      uOrbySurfaceMode: { value: opts.proceduralIndex },
      uOrbyScale: { value: opts.scale },
      uOrbyNormalStrength: { value: opts.normalStrength },
      uOrbyNormalMap: { value: opts.normalMap },
    };
    setNormalBoundsUniforms(uniformRefs, opts.normalBounds ?? null);
  } else {
    uniformRefs.uOrbySurfaceMode.value = opts.proceduralIndex;
    uniformRefs.uOrbyScale.value = opts.scale;
    uniformRefs.uOrbyNormalStrength.value = opts.normalStrength;
    uniformRefs.uOrbyNormalMap.value = opts.normalMap;
    setNormalBoundsUniforms(uniformRefs, opts.normalBounds ?? null);
  }
  return uniformRefs;
}

/**
 * @param {THREE.MeshStandardMaterial} material
 * @param {{ preset?: string, scale?: number, strength?: number }} opts
 * @returns {boolean}
 */
export function applySvgExtrudeSurfaceToMaterial(material, opts) {
  if (
    !material ||
    (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial)
  ) {
    return false;
  }
  const presetId = opts.preset ?? 'none';
  const config = getSvgExtrudeSurfacePresetConfig(presetId);
  const scale = surfaceUiScaleToShaderScale(opts.scale);
  if (!config || config.kind === 'none') {
    removeSvgExtrudeProceduralFromMaterial(material);
    return true;
  }

  const proceduralIndex =
    config.kind === 'procedural' ? Math.max(1, Math.min(3, config.proceduralIndex)) : 0;
  const surfaceStrength = clampSurfaceStrength(
    opts.strength !== undefined ? opts.strength : 1,
  );
  const normalStrength = resolveSvgExtrudeNormalStrength(config, surfaceStrength);
  const normalMap =
    config.kind === 'normalMap' ? getNormalMapTexture(config.normalMapUrl) : null;

  const uniformRefs = getOrUpdateUniformRefs(material, {
    proceduralIndex,
    scale,
    normalStrength,
    normalMap,
    presetId,
    normalBounds: opts.normalBounds ?? null,
  });
  const prevPreset = material.userData?.svgExtrudeSurfacePresetId;
  const prevScale = material.userData?.svgExtrudeProceduralScale;
  const prevStrength = material.userData?.svgExtrudeSurfaceStrength;
  const presetOrScaleChanged = prevPreset !== presetId || prevScale !== scale;
  const strengthChanged = prevStrength !== surfaceStrength;
  material.userData.svgExtrudeSurfacePresetId = presetId;
  material.userData.svgExtrudeProceduralPresetIndex = proceduralIndex;
  material.userData.svgExtrudeProceduralScale = scale;
  material.userData.svgExtrudeSurfaceStrength = surfaceStrength;
  if (opts.normalBounds) {
    material.userData.svgExtrudeNormalBounds = opts.normalBounds;
  }

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
      `orbySvgSurf:v10:${presetId}:${scale.toFixed(3)}:${normalStrength.toFixed(3)}`;
    material.needsUpdate = true;
    ensureSvgExtrudeFresnelChain(material);
    return true;
  }

  material.userData.svgExtrudeProceduralUniforms = uniformRefs;
  material.customProgramCacheKey = () =>
    `orbySvgSurf:v10:${presetId}:${scale.toFixed(3)}:${normalStrength.toFixed(3)}`;
  if (presetOrScaleChanged) {
    material.needsUpdate = true;
  } else if (strengthChanged) {
    uniformRefs.uOrbyNormalStrength.value = normalStrength;
  }
  ensureSvgExtrudeFresnelChain(material);
  return true;
}

/**
 * @param {THREE.MeshStandardMaterial} material
 * @param {{ presetIndex: number, scale: number }} opts
 * @returns {boolean}
 */
export function applySvgExtrudeProceduralToMaterial(material, opts) {
  const presetIndex = Math.max(0, Math.min(3, Math.floor(Number(opts.presetIndex)) || 0));
  if (presetIndex < 1) {
    const presetId = material.userData?.svgExtrudeSurfacePresetId;
    if (presetId && getSvgExtrudeSurfacePresetConfig(presetId).kind === 'normalMap') {
      return applySvgExtrudeSurfaceToMaterial(material, {
        preset: presetId,
        scale: opts.scale,
        strength: material.userData?.svgExtrudeSurfaceStrength,
        normalBounds: material.userData?.svgExtrudeNormalBounds ?? null,
      });
    }
    removeSvgExtrudeProceduralFromMaterial(material);
    return true;
  }
  const id =
    Object.entries(PRESET_TO_INDEX).find(([, idx]) => idx === presetIndex)?.[0] ?? 'none';
  return applySvgExtrudeSurfaceToMaterial(material, { preset: id, scale: opts.scale });
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
  delete material.userData.svgExtrudeSurfacePresetId;
  delete material.userData.svgExtrudeSurfaceStrength;
  delete material.userData.svgExtrudeNormalBounds;
  delete material.customProgramCacheKey;
  material.needsUpdate = true;
}

/**
 * @param {THREE.Object3D} model
 * @param {{ getState: () => object } | { stateStore: { getState: () => object } }} storeLike
 * @param {string} [shadingOverride]
 */
export function reapplySvgExtrudeSurfaceFromState(model, storeLike, shadingOverride) {
  if (!model || !storeLike) return;
  const st =
    typeof storeLike.getState === 'function'
      ? storeLike.getState()
      : storeLike.stateStore?.getState?.();
  if (!st) return;
  const shading = shadingOverride ?? st.shading;
  const presetId = st.svgExtrude?.surfacePreset ?? 'none';
  const config = getSvgExtrudeSurfacePresetConfig(presetId);
  const scale = clampSurfaceUiScale(st.svgExtrude?.surfaceScale ?? 1);
  const strength = clampSurfaceStrength(st.svgExtrude?.surfaceStrength ?? 1);
  const stripSurface =
    shading === 'textures' ||
    shading === 'wireframe' ||
    !st.svgExtrude?.enabled ||
    config.kind === 'none';

  model.traverse((child) => {
    if (!child.isMesh || !child.userData?.orbySvgExtrude) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    if (stripSurface) {
      mats.forEach((m) => removeSvgExtrudeProceduralFromMaterial(m));
    } else {
      const mappingBounds =
        config.kind === 'normalMap' ? computeExtrudeSurfaceMappingBounds(child) : null;
      mats.forEach((m) => {
        if (m?.isMeshStandardMaterial || m?.isMeshPhysicalMaterial) {
          applySvgExtrudeSurfaceToMaterial(m, {
            preset: presetId,
            scale,
            strength,
            normalBounds: mappingBounds,
          });
        }
      });
    }
  });
}

/** @deprecated Use reapplySvgExtrudeSurfaceFromState */
export function reapplySvgExtrudeProceduralFromState(model, storeLike, shadingOverride) {
  return reapplySvgExtrudeSurfaceFromState(model, storeLike, shadingOverride);
}

/** Shared GLSL helpers for procedural + triplanar surface detail. */
export const ORBY_SURFACE_FRAG_HELPERS = FRAG_HELPERS;

/** Subset for base-glass ReflectorShader (matches its vertex varyings). */
export const ORBY_SURFACE_GLASS_FRAG_HELPERS = GLASS_FRAG_HELPERS;

/**
 * Resolve a surface preset into uniform values for custom shaders (e.g. base glass reflector).
 * @param {string} presetId
 * @param {number} scale
 * @param {number} strength
 * @param {{ origin: THREE.Vector3, invSize?: THREE.Vector3 } | null} [normalBounds]
 */
export function resolveOrbySurfaceUniformState(presetId, scale, strength, normalBounds = null) {
  const config = getSvgExtrudeSurfacePresetConfig(presetId ?? 'none');
  if (!config || config.kind === 'none') return null;
  const clampedScale = surfaceUiScaleToShaderScale(scale);
  const surfaceStrength = clampSurfaceStrength(strength ?? 1);
  const proceduralIndex =
    config.kind === 'procedural' ? Math.max(1, Math.min(3, config.proceduralIndex)) : 0;
  const normalStrength =
    config.kind === 'normalMap'
      ? resolveSvgExtrudeNormalStrength(config, surfaceStrength)
      : surfaceStrength;
  const normalMap =
    config.kind === 'normalMap' ? getNormalMapTexture(config.normalMapUrl) : null;
  return {
    proceduralIndex,
    scale: clampedScale,
    normalStrength,
    normalMap,
    normalBounds,
  };
}

/** @returns {Record<string, { value: unknown }>} */
export function createOrbySurfaceUniformRefs(initialState = null) {
  const refs = {
    uOrbySurfaceMode: { value: initialState?.proceduralIndex ?? 0 },
    uOrbyScale: { value: initialState?.scale ?? 1 },
    uOrbyNormalStrength: { value: initialState?.normalStrength ?? 0 },
    uOrbyNormalMap: { value: initialState?.normalMap ?? null },
  };
  setNormalBoundsUniforms(refs, initialState?.normalBounds ?? null);
  return refs;
}

/** @param {Record<string, { value: unknown }> | null} refs */
export function applyOrbySurfaceUniformState(refs, state) {
  if (!refs) return;
  if (!state) {
    refs.uOrbySurfaceMode.value = 0;
    refs.uOrbyNormalStrength.value = 0;
    refs.uOrbyNormalMap.value = null;
    setNormalBoundsUniforms(refs, null);
    return;
  }
  refs.uOrbySurfaceMode.value = state.proceduralIndex;
  refs.uOrbyScale.value = state.scale;
  refs.uOrbyNormalStrength.value = state.normalStrength;
  refs.uOrbyNormalMap.value = state.normalMap;
  setNormalBoundsUniforms(refs, state.normalBounds ?? null);
}
