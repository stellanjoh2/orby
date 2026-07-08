import * as THREE from 'three';
import { isTextureImageReady } from '../utils/textureReady.js';

export const SVG_EXTRUDE_SURFACE_PRESETS = [
  { id: 'none', label: 'Default (smooth)', kind: 'none' },
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

/** Default when re-enabling Object → Material surface. */
export const DEFAULT_SURFACE_NORMAL_MAP_PRESET = 'galvanizedSteel';

const REMOVED_PROCEDURAL_SURFACE_PRESETS = new Set(['carPaint', 'brushed', 'ceramic']);

const PRESET_BY_ID = Object.fromEntries(
  SVG_EXTRUDE_SURFACE_PRESETS.map((p) => [p.id, p]),
);

const PRESET_TO_INDEX = {
  none: 0,
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

export function normalizeSurfacePresetId(presetId) {
  if (!presetId || presetId === 'none') return 'none';
  if (REMOVED_PROCEDURAL_SURFACE_PRESETS.has(presetId)) return 'none';
  return PRESET_BY_ID[presetId] ? presetId : 'none';
}

/** Maps legacy procedural ids and invalid values to a real normal-map preset. */
export function normalizeSurfaceLastPresetId(presetId) {
  const normalized = normalizeSurfacePresetId(presetId);
  if (normalized !== 'none') return normalized;
  if (!presetId || presetId === 'none') return DEFAULT_SURFACE_NORMAL_MAP_PRESET;
  if (REMOVED_PROCEDURAL_SURFACE_PRESETS.has(presetId)) {
    return DEFAULT_SURFACE_NORMAL_MAP_PRESET;
  }
  return PRESET_BY_ID[presetId] ? presetId : DEFAULT_SURFACE_NORMAL_MAP_PRESET;
}

export function getSvgExtrudeSurfacePresetConfig(presetId) {
  return PRESET_BY_ID[normalizeSurfacePresetId(presetId)] ?? PRESET_BY_ID.none;
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

/** Normal-map texture for a surface preset (shared cache with object surfaces). */
export function getSurfacePresetNormalMapTexture(presetId) {
  const config = getSvgExtrudeSurfacePresetConfig(presetId);
  if (config?.kind !== 'normalMap') return null;
  return getNormalMapTexture(config.normalMapUrl);
}

/**
 * Mesh bbox center for triplanar anchoring (local units, no inverse-size stretch).
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
function resolveShadowInnerForSurfaceInsert(material) {
  const inner = material.userData?.orbyShadowTint?.previousOnBeforeCompile;
  if (typeof inner === 'function' && !inner.__orbyShadowTintPatch && !inner.__orbySvgSurfPatch) {
    return inner;
  }
  return () => {};
}

function resolveGoboInnerForSurfaceInsert(material) {
  const inner = material.userData?.orbyGobo?.previousOnBeforeCompile;
  if (typeof inner === 'function' && !inner.__orbyGoboPatch && !inner.__orbySvgSurfPatch) {
    return inner;
  }
  return () => {};
}

export function resolveSvgSurfacePreviousHook(material) {
  const live = material.onBeforeCompile;

  if (typeof live === 'function' && live.__orbySvgSurfPatch) {
    const stored = material.userData?.svgExtrudeProceduralPrevious;
    if (typeof stored === 'function' && !stored.__orbySvgSurfPatch) {
      return stored;
    }
  }

  const shadowHook = material.userData?.shadowTintOnBeforeCompile;
  if (material.userData?.shadowTintPatched && typeof shadowHook === 'function') {
    // Shadow outer — insert surface under it, never surface -> shadow -> surface.
    if (live === shadowHook) {
      return resolveShadowInnerForSurfaceInsert(material);
    }
    return shadowHook;
  }

  const goboHook = material.userData?.goboOnBeforeCompile;
  if (material.userData?.goboPatched && typeof goboHook === 'function') {
    if (live === goboHook) {
      return resolveGoboInnerForSurfaceInsert(material);
    }
    return goboHook;
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
 * Keep surface inside shadow/gobo when those patches are the live outer hook.
 * @param {THREE.Material} material
 * @returns {boolean} whether the chain was repaired
 */
export function ensureOrbySurfaceHookLinked(material) {
  if (!material?.userData?.svgExtrudeProceduralPatched) return false;
  const surfaceHook = material.userData.svgExtrudeProceduralOnBeforeCompile;
  if (typeof surfaceHook !== 'function') return false;

  let repaired = false;
  const live = material.onBeforeCompile;
  const shadowHook = material.userData?.shadowTintOnBeforeCompile;
  const goboHook = material.userData?.goboOnBeforeCompile;

  if (material.userData?.shadowTintPatched && typeof shadowHook === 'function') {
    const stash = material.userData.orbyShadowTint;
    if (stash && stash.previousOnBeforeCompile !== surfaceHook) {
      stash.previousOnBeforeCompile = surfaceHook;
      repaired = true;
    }
    if (live === surfaceHook) {
      material.onBeforeCompile = shadowHook;
      repaired = true;
    }
  } else if (material.userData?.goboPatched && typeof goboHook === 'function') {
    const stash = material.userData.orbyGobo;
    if (stash && stash.previousOnBeforeCompile !== surfaceHook) {
      stash.previousOnBeforeCompile = surfaceHook;
      repaired = true;
    }
    if (live === surfaceHook) {
      material.onBeforeCompile = goboHook;
      repaired = true;
    }
  }

  if (repaired) {
    material.needsUpdate = true;
  }
  return repaired;
}

/**
 * Surface sync replaces `customProgramCacheKey`; shadow/gobo early-return paths skip re-wrap
 * and the renderer can keep a pre-surface program until shading rebuilds materials.
 * @param {THREE.Material} material
 * @returns {boolean}
 */
export function relinkOuterShaderPatchesAfterSurface(material) {
  if (!material?.userData?.svgExtrudeProceduralPatched) return false;
  ensureOrbySurfaceHookLinked(material);
  syncSvgExtrudeSurfaceProgramCacheKey(material);

  let dirty = false;
  const surfaceHook = material.userData.svgExtrudeProceduralOnBeforeCompile;

  if (material.userData?.shadowTintPatched && material.userData.orbyShadowTint) {
    const stash = material.userData.orbyShadowTint;
    const shadowHook = material.userData.shadowTintOnBeforeCompile;
    if (typeof surfaceHook === 'function' && stash.previousOnBeforeCompile !== surfaceHook) {
      stash.previousOnBeforeCompile = surfaceHook;
      dirty = true;
    }
    if (typeof shadowHook === 'function' && material.onBeforeCompile === surfaceHook) {
      material.onBeforeCompile = shadowHook;
      dirty = true;
    }
    const colorHex = stash.color?.getHexString?.() ?? '080808';
    const nextTintKey = `${colorHex}:${stash.strength}:${stash.opacity}`;
    if (stash.programCacheKey !== nextTintKey) {
      stash.programCacheKey = nextTintKey;
      const surfaceKeyFn = material.customProgramCacheKey.bind(material);
      material.customProgramCacheKey = function orbyShadowTintCacheKey() {
        return `${surfaceKeyFn()}|orbyShadowTint:${nextTintKey}`;
      };
      dirty = true;
    }
  }

  if (material.userData?.goboPatched && material.userData.orbyGobo) {
    const stash = material.userData.orbyGobo;
    const goboHook = material.userData.goboOnBeforeCompile;
    const shadowHook = material.userData.shadowTintOnBeforeCompile;
    const innerForGobo =
      material.userData?.shadowTintPatched && typeof shadowHook === 'function'
        ? shadowHook
        : surfaceHook;
    if (typeof innerForGobo === 'function' && stash.previousOnBeforeCompile !== innerForGobo) {
      stash.previousOnBeforeCompile = innerForGobo;
      dirty = true;
    }
    if (typeof goboHook === 'function' && material.onBeforeCompile === surfaceHook) {
      material.onBeforeCompile = goboHook;
      dirty = true;
    }
  }

  if (dirty) {
    material.needsUpdate = true;
  }
  return dirty;
}

function installSurfaceCompileHook(material, hook, uniformRefs, innerPrevious) {
  material.userData.svgExtrudeProceduralPrevious = innerPrevious;
  material.userData.svgExtrudeProceduralUniforms = uniformRefs;
  material.userData.svgExtrudeProceduralPatched = true;
  material.userData.svgExtrudeProceduralOnBeforeCompile = hook;

  const live = material.onBeforeCompile;
  const shadowHook = material.userData?.shadowTintOnBeforeCompile;
  const goboHook = material.userData?.goboOnBeforeCompile;

  if (material.userData?.shadowTintPatched && typeof shadowHook === 'function' && live === shadowHook) {
    material.userData.orbyShadowTint.previousOnBeforeCompile = hook;
  } else if (material.userData?.goboPatched && typeof goboHook === 'function' && live === goboHook) {
    material.userData.orbyGobo.previousOnBeforeCompile = hook;
  } else {
    material.onBeforeCompile = hook;
  }

  syncSvgExtrudeSurfaceProgramCacheKey(material);
  material.needsUpdate = true;
  ensureOrbySurfaceHookLinked(material);
  ensureSvgExtrudeFresnelChain(material);
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
vec3 orbyDecodeNormalMap( vec2 st ) {
  vec3 tn = texture2D( uOrbyNormalMap, st ).xyz * 2.0 - 1.0;
  tn.y = -tn.y;
  return tn;
}
vec3 orbySurfaceLocalNormal() {
  vec3 n = normalize( vOrbyLocalNormal );
  // Match Three.js faceDirection for DoubleSide / BackSide (geometry normal is unflipped in varyings).
  if ( ! gl_FrontFacing ) {
    n = -n;
  }
  return n;
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
  vec3 p = ( localPos - uOrbyNormalOrigin ) * uOrbyNormalInvSize * scale;
  vec3 blend = abs( n );
  blend = pow( max( blend, vec3( 0.00001 ) ), vec3( 4.0 ) );
  blend /= ( blend.x + blend.y + blend.z );
  vec3 tX = orbyDecodeNormalMap( p.zy );
  vec3 tY = orbyDecodeNormalMap( p.xz );
  vec3 tZ = orbyDecodeNormalMap( p.xy );
  vec3 nx = orbyTriplanarAxisNormal( n, tX, vec3( 0.0, 1.0, 0.0 ), vec3( 0.0, 0.0, 1.0 ) );
  vec3 ny = orbyTriplanarAxisNormal( n, tY, vec3( 0.0, 0.0, 1.0 ), vec3( 1.0, 0.0, 0.0 ) );
  vec3 nz = orbyTriplanarAxisNormal( n, tZ, vec3( 1.0, 0.0, 0.0 ), vec3( 0.0, 1.0, 0.0 ) );
  return normalize( nx * blend.x + ny * blend.y + nz * blend.z );
}
float orbyTriplanarNormalDetail( vec3 localPos, vec3 localNormal, float scale ) {
  vec3 n = normalize( localNormal );
  vec3 p = ( localPos - uOrbyNormalOrigin ) * uOrbyNormalInvSize * scale;
  vec3 blend = abs( n );
  blend = pow( max( blend, vec3( 0.00001 ) ), vec3( 4.0 ) );
  blend /= ( blend.x + blend.y + blend.z );
  vec2 sX = texture2D( uOrbyNormalMap, p.zy ).xy;
  vec2 sY = texture2D( uOrbyNormalMap, p.xz ).xy;
  vec2 sZ = texture2D( uOrbyNormalMap, p.xy ).xy;
  vec2 s = sX * blend.x + sY * blend.y + sZ * blend.z;
  return length( s - vec2( 0.5 ) ) * 2.828427;
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
vec3 orbyDecodeNormalMap( vec2 st ) {
  vec3 tn = texture2D( uOrbyNormalMap, st ).xyz * 2.0 - 1.0;
  tn.y = -tn.y;
  return tn;
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
  vec3 p = ( localPos - uOrbyNormalOrigin ) * uOrbyNormalInvSize * scale;
  vec3 blend = abs( n );
  blend = pow( max( blend, vec3( 0.00001 ) ), vec3( 4.0 ) );
  blend /= ( blend.x + blend.y + blend.z );
  vec3 tX = orbyDecodeNormalMap( p.zy );
  vec3 tY = orbyDecodeNormalMap( p.xz );
  vec3 tZ = orbyDecodeNormalMap( p.xy );
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
		if ( uOrbyNormalStrength > 0.0001 && mode < 0.5 ) {
			vec3 localN = orbySurfaceLocalNormal();
			vec3 tn = orbyTriplanarNormalObject( vOrbyLocalPos, localN, uOrbyScale );
			float bump = length( tn - localN );
			float texDetail = orbyTriplanarNormalDetail( vOrbyLocalPos, localN, uOrbyScale );
			float detail = max( bump, texDetail );
			#ifdef ORBY_GLASS_TRANSMISSION
				roughnessFactor = clamp( roughnessFactor + detail * uOrbyNormalStrength * 0.55, 0.04, 1.0 );
			#else
				roughnessFactor = clamp( roughnessFactor + detail * uOrbyNormalStrength * 0.42, 0.04, 1.0 );
			#endif
		}
	}
`;

/** Surface body without metalness chunk — used when that include is absent from the shader. */
const ORBY_SURFACE_BODY_INJECT = METALNESS_INJECT.replace('\t#include <metalnessmap_fragment>\n', '');

const NORMAL_INJECT_AFTER_MAPS = /* glsl */ `	#include <normal_fragment_maps>
	// orby_svg_norm
	if ( uOrbyNormalStrength > 0.0001 ) {
		vec3 orbyLocalN = orbySurfaceLocalNormal();
		vec3 orbyLocalTn = orbyTriplanarNormalObject(
			vOrbyLocalPos,
			orbyLocalN,
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
		vec3 orbyLocalN = orbySurfaceLocalNormal();
		vec3 orbyLocalTn = orbyTriplanarNormalObject(
			vOrbyLocalPos,
			orbyLocalN,
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

function applyShaderPatches(shader, uniformRefs, { transmissionSafe = false } = {}) {
  let vs = shader.vertexShader;
  vs = injectOrbyVertex(vs);
  shader.vertexShader = vs;

  let fs = shader.fragmentShader;
  if (fs.indexOf('uOrbySurfaceMode') === -1) {
    const glassDefine = transmissionSafe ? '#define ORBY_GLASS_TRANSMISSION\n' : '';
    fs = fs.replace(
      '#include <common>',
      `#include <common>\n${glassDefine}${FRAG_HELPERS}\n`,
    );
  } else if (transmissionSafe && fs.indexOf('ORBY_GLASS_TRANSMISSION') === -1) {
    fs = fs.replace('#include <common>', '#include <common>\n#define ORBY_GLASS_TRANSMISSION');
  }
  if (fs.indexOf('orby_svg_surf') === -1) {
    const mLine = '	#include <metalnessmap_fragment>';
    if (fs.indexOf(mLine) !== -1) {
      fs = fs.replace(mLine, METALNESS_INJECT);
    } else if (fs.indexOf('#include <metalnessmap_fragment>') !== -1) {
      fs = fs.replace('#include <metalnessmap_fragment>', METALNESS_INJECT);
    } else {
      const roughLine = '	#include <roughnessmap_fragment>';
      if (fs.indexOf(roughLine) !== -1) {
        fs = fs.replace(roughLine, `${roughLine}\n${ORBY_SURFACE_BODY_INJECT}`);
      } else if (fs.indexOf('#include <roughnessmap_fragment>') !== -1) {
        fs = fs.replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>\n${ORBY_SURFACE_BODY_INJECT}`,
        );
      }
    }
  }
  if (!transmissionSafe && fs.indexOf('orby_svg_norm') === -1) {
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
    applyShaderPatches(shader, args.uniformRefs, {
      transmissionSafe: !!args.transmissionSafe,
    });
  };
  hook.__orbySvgSurfPatch = true;
  return hook;
}

/**
 * @param {THREE.MeshStandardMaterial} material
 * @param {{ proceduralIndex: number, scale: number, normalStrength: number, normalMap: THREE.Texture | null, presetId: string }} opts
 */
/** Keep WebGL program cache in sync when Fresnel and SVG surface share a material. */
export function syncSvgExtrudeSurfaceProgramCacheKey(material) {
  if (!material?.userData?.svgExtrudeProceduralPatched) return;
  const presetId = material.userData.svgExtrudeSurfacePresetId ?? 'none';
  const scale = material.userData.svgExtrudeProceduralScale ?? 1;
  const normalStrength =
    material.userData?.svgExtrudeProceduralUniforms?.uOrbyNormalStrength?.value ?? 0;
  const fresnelSuffix = material.userData?.fresnelPatched ? ':f' : '';
  const glassSuffix = material.userData?.orbySurfaceTransmissionSafe ? ':tg' : '';
  const existingKey = material.customProgramCacheKey;
  if (
    !material.userData.orbySvgSurfBaseCacheKey
    && typeof existingKey === 'function'
    && !String(existingKey).includes('orbySvgSurf')
  ) {
    material.userData.orbySvgSurfBaseCacheKey = existingKey.bind(material);
  }
  const basePrefix =
    typeof material.userData.orbySvgSurfBaseCacheKey === 'function'
      ? `${material.userData.orbySvgSurfBaseCacheKey()}|`
      : '';
  material.customProgramCacheKey = () =>
    `${basePrefix}orbySvgSurf:v21:${presetId}:${Number(scale).toFixed(3)}:${Number(normalStrength).toFixed(3)}${fresnelSuffix}${glassSuffix}`;
}

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
  const transmissionSafe = !!opts.transmissionSafe;
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
  const prevTransmissionSafe = !!material.userData?.orbySurfaceTransmissionSafeWas;
  const presetOrScaleChanged = prevPreset !== presetId || prevScale !== scale;
  const strengthChanged = prevStrength !== surfaceStrength;
  const hadPatch = !!material.userData?.svgExtrudeProceduralPatched;

  if (hadPatch && prevPreset !== presetId) {
    removeSvgExtrudeProceduralFromMaterial(material);
  } else if (hadPatch && prevTransmissionSafe !== transmissionSafe) {
    removeSvgExtrudeProceduralFromMaterial(material);
  }

  if (!material.userData?.svgExtrudeProceduralPatched) {
    const previous = resolveSvgSurfacePreviousHook(material);
    const hook = createOnBefore({ previous, uniformRefs, transmissionSafe });
    installSurfaceCompileHook(material, hook, uniformRefs, previous);
  } else {
    material.userData.svgExtrudeProceduralUniforms = uniformRefs;
    if (presetOrScaleChanged) {
      material.needsUpdate = true;
    } else if (strengthChanged) {
      uniformRefs.uOrbyNormalStrength.value = normalStrength;
    }
    ensureOrbySurfaceHookLinked(material);
    ensureSvgExtrudeFresnelChain(material);
  }

  material.userData.svgExtrudeSurfacePresetId = presetId;
  material.userData.svgExtrudeProceduralPresetIndex = proceduralIndex;
  material.userData.svgExtrudeProceduralScale = scale;
  material.userData.svgExtrudeSurfaceStrength = surfaceStrength;
  if (opts.normalBounds) {
    material.userData.svgExtrudeNormalBounds = opts.normalBounds;
  }
  material.userData.orbySurfaceTransmissionSafe = transmissionSafe;
  material.userData.orbySurfaceTransmissionSafeWas = transmissionSafe;
  syncSvgExtrudeSurfaceProgramCacheKey(material);
  material.needsUpdate = true;
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
  const shadowHook = material.userData?.shadowTintOnBeforeCompile;
  const goboHook = material.userData?.goboOnBeforeCompile;
  const live = material.onBeforeCompile;
  const inner = material.userData.svgExtrudeProceduralPrevious;

  let nextLive = null;
  if (typeof fresnelHook === 'function' && live?.__orbySvgSurfPatch) {
    nextLive = fresnelHook;
  } else if (
    material.userData?.goboPatched
    && typeof goboHook === 'function'
    && (live === goboHook || live?.__orbySvgSurfPatch)
  ) {
    nextLive = goboHook;
    const goboInner =
      typeof inner === 'function' && !inner.__orbySvgSurfPatch
        ? inner
        : resolveGoboInnerForSurfaceInsert(material);
    if (material.userData.orbyGobo) {
      material.userData.orbyGobo.previousOnBeforeCompile = goboInner;
    }
  } else if (
    material.userData?.shadowTintPatched
    && typeof shadowHook === 'function'
    && (live === shadowHook || live?.__orbySvgSurfPatch)
  ) {
    nextLive = shadowHook;
    const shadowInner =
      typeof inner === 'function' && !inner.__orbySvgSurfPatch
        ? inner
        : resolveShadowInnerForSurfaceInsert(material);
    if (material.userData.orbyShadowTint) {
      material.userData.orbyShadowTint.previousOnBeforeCompile = shadowInner;
    }
  } else if (typeof inner === 'function') {
    nextLive = inner;
  } else if (typeof live === 'function' && !live.__orbySvgSurfPatch) {
    nextLive = live;
  }

  if (typeof nextLive === 'function') {
    material.onBeforeCompile = nextLive;
  } else {
    delete material.onBeforeCompile;
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
  delete material.userData.orbySurfaceTransmissionSafe;
  delete material.userData.orbySurfaceTransmissionSafeWas;

  if (material.userData?.shadowTintPatched && material.userData.orbyShadowTint) {
    const stash = material.userData.orbyShadowTint;
    material.customProgramCacheKey = function orbyShadowTintCacheKeyAfterSurfaceRemove() {
      return `orbyShadowTint:${stash.color.getHexString()}:${stash.strength}:${stash.opacity}`;
    };
  } else {
    delete material.customProgramCacheKey;
  }
  material.needsUpdate = true;
}

/**
 * @deprecated SVG/file extrude surfaces use Object → Material (`material.surface*`).
 * Delegates to {@link reapplyObjectSurfaceFromState}.
 */
export function reapplySvgExtrudeSurfaceFromState(model, storeLike, shadingOverride) {
  reapplyObjectSurfaceFromState(model, storeLike, shadingOverride);
}

/** @deprecated Use reapplyObjectSurfaceFromState */
export function reapplySvgExtrudeProceduralFromState(model, storeLike, shadingOverride) {
  return reapplySvgExtrudeSurfaceFromState(model, storeLike, shadingOverride);
}

/** True when the loaded model is SVG file extrude (not generated 3D text). */
export function modelIsSvgFileExtrude(model) {
  if (!model) return false;
  if (model.userData?.orbyFontGenerated) return false;
  let found = false;
  model.traverse((child) => {
    if (found) return;
    if (child.userData?.orbySvgExtrude && !child.userData?.orbyFontExtrude) found = true;
  });
  return found;
}

/** @deprecated Use {@link modelIsSvgFileExtrude} */
export function modelUsesExtrudeSurfaceState(model) {
  return modelIsSvgFileExtrude(model);
}

/**
 * Surface preset source — Object → Material (`material.surface*`).
 * @param {object} st
 * @param {THREE.Object3D | null | undefined} [_model]
 */
export function resolveAppearanceSurfaceState(st, _model = null) {
  return resolveMaterialAppearanceSurfaceState(st);
}

/** Whether Object → Material surface is actively applied. */
export function isMaterialObjectSurfaceEnabled(material) {
  if (!material) return false;
  if (material.surfaceEnabled === true) return true;
  if (material.surfaceEnabled === false) return false;
  return (normalizeSurfacePresetId(material.surfacePreset ?? 'none')) !== 'none';
}

function resolveMaterialAppearanceSurfaceState(st) {
  const material = st?.material;
  if (!isMaterialObjectSurfaceEnabled(material)) {
    return {
      presetId: 'none',
      scale: clampSurfaceUiScale(material?.surfaceScale ?? 1),
      strength: clampSurfaceStrength(material?.surfaceStrength ?? 1),
    };
  }
  return {
    presetId: normalizeSurfacePresetId(material?.surfacePreset ?? 'none'),
    scale: clampSurfaceUiScale(material?.surfaceScale ?? 1),
    strength: clampSurfaceStrength(material?.surfaceStrength ?? 1),
  };
}

/**
 * Apply Object → Material surface onto eligible meshes (imports, shape library, font, SVG file extrude).
 * @param {THREE.Object3D} model
 * @param {{ getState: () => object } | { stateStore: { getState: () => object } }} storeLike
 * @param {string} [shadingOverride]
 * @param {{ shouldApplyToMesh?: (child: THREE.Mesh) => boolean, onPresentationRefresh?: () => void, surfaceEligible?: boolean }} [options]
 */
export function reapplyObjectSurfaceFromState(model, storeLike, shadingOverride, options = {}) {
  if (!model || !storeLike) return;
  const st =
    typeof storeLike.peekState === 'function'
      ? storeLike.peekState()
      : typeof storeLike.getState === 'function'
        ? storeLike.getState()
        : storeLike.stateStore?.peekState?.() ?? storeLike.stateStore?.getState?.();
  if (!st) return;
  const surfaceEligible =
    options.surfaceEligible !== undefined
      ? options.surfaceEligible
      : st.material?.surfaceEligible;
  if (!surfaceEligible) {
    model.traverse((child) => {
      if (!child.isMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => removeSvgExtrudeProceduralFromMaterial(m));
    });
    return;
  }

  const shading = shadingOverride ?? st.shading;
  const { presetId, scale, strength } = resolveAppearanceSurfaceState(st, model);
  const config = getSvgExtrudeSurfacePresetConfig(presetId);
  const stripSurface =
    shading === 'textures' ||
    shading === 'wireframe' ||
    !isMaterialObjectSurfaceEnabled(st.material) ||
    config.kind === 'none';
  const shouldApply =
    typeof options.shouldApplyToMesh === 'function'
      ? options.shouldApplyToMesh
      : (child) => !!child?.isMesh;

  model.traverse((child) => {
    if (!shouldApply(child)) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    if (stripSurface) {
      mats.forEach((m) => removeSvgExtrudeProceduralFromMaterial(m));
    } else {
      const mappingBounds =
        config.kind === 'normalMap' ? computeExtrudeSurfaceMappingBounds(child) : null;
      mats.forEach((m) => {
        if (
          st.creativeLook?.enabled &&
          (m?.userData?.orbyCreativeLook === 'glass'
            || m?.userData?.orbyCreativeLook === 'holo-glass'
            || m?.userData?.orbyCreativeLook === 'crystal-gem')
        ) {
          return;
        }
        if (m?.userData?.orbyCreativeLook && st.creativeLook?.enabled) {
          return;
        }
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

  if (config.kind === 'normalMap' && typeof options.onPresentationRefresh === 'function') {
    const tex = getNormalMapTexture(config.normalMapUrl);
    scheduleObjectSurfaceRefreshWhenTextureReady(tex, options.onPresentationRefresh);
  }
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

const ORBY_SURFACE_UNIFORM_KEYS = [
  'uOrbySurfaceMode',
  'uOrbyScale',
  'uOrbyNormalStrength',
  'uOrbyNormalMap',
  'uOrbyNormalOrigin',
  'uOrbyNormalInvSize',
];

/**
 * Push surface uniform state onto a Shader Lab ShaderMaterial and refresh the GL program.
 * @param {THREE.ShaderMaterial} material
 * @param {ReturnType<typeof resolveOrbySurfaceUniformState>} state
 * @returns {boolean}
 */
export function applyOrbySurfaceUniformStateToMaterial(material, state) {
  if (!material?.isShaderMaterial) return false;
  const refs = material.userData?.orbyCreativeSurfaceUniformRefs;
  if (!refs) return false;
  applyOrbySurfaceUniformState(refs, state);
  const uniforms = material.uniforms;
  if (uniforms) {
    for (const key of ORBY_SURFACE_UNIFORM_KEYS) {
      if (refs[key]) {
        uniforms[key] = refs[key];
      }
    }
  }
  const tex = state?.normalMap;
  if (tex?.isTexture) {
    tex.needsUpdate = true;
  }
  material.needsUpdate = true;
  return true;
}

/** Shader Lab presets that read Object → Material / Surface (material.surfacePreset). */
export function creativeLookPresetSupportsSurfaceDetail(preset) {
  let p = typeof preset === 'string' ? preset.trim() : '';
  if (p === 'glass-holo') p = 'holographic';
  if (p === 'night-vision') p = 'thermal-acid';
  if (p === 'vertex-points') p = 'fractal-storm';
  return (
    p === 'holographic' ||
    p === 'holo-glass' ||
    p === 'crystal-gem' ||
    p === 'scanline-hologram' ||
    p === 'spectral-storm' ||
    p === 'fractal-storm' ||
    p === 'holo-topo' ||
    p === 'thermal-acid' ||
    p === 'chrome-plasma' ||
    p === 'plasma' ||
    p === 'chrome' ||
    p === 'glass'
  );
}

/**
 * GLSL helpers for Shader Lab materials — procedural + triplanar normal maps on world/view normals.
 * Requires WORLD_SURFACE_VERTEX or SCANLINE_HOLOGRAM surface varyings.
 */
export const ORBY_CREATIVE_SURFACE_FRAG_HELPERS = /* glsl */ `
varying vec3 vOrbyLocalPos;
varying vec3 vOrbyLocalNormal;
varying vec3 vOrbyNm0;
varying vec3 vOrbyNm1;
varying vec3 vOrbyNm2;
varying vec3 vOrbyWm0;
varying vec3 vOrbyWm1;
varying vec3 vOrbyWm2;
uniform float uOrbySurfaceMode;
uniform float uOrbyScale;
uniform float uOrbyNormalStrength;
uniform sampler2D uOrbyNormalMap;
uniform vec3 uOrbyNormalOrigin;
float orbyCreativeQ(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.199))) * 43758.5453);
}
float orbyCreativeFbm3(vec3 p) {
  float t = 0.0; float a = 0.5;
  t += a * orbyCreativeQ(p); p = p * 2.1 + 1.0; a *= 0.5;
  t += a * orbyCreativeQ(p); p = p * 2.0 + 0.2; a *= 0.5;
  t += a * orbyCreativeQ(p); p = p * 1.8 + 0.1; a *= 0.5;
  t += a * orbyCreativeQ(p);
  return t;
}
float orbyCreativeSurfaceHeight(vec3 worldPos) {
  if (uOrbySurfaceMode < 0.5) return 0.5;
  vec3 p = worldPos * uOrbyScale;
  if (uOrbySurfaceMode < 1.5) {
    return 0.55 * orbyCreativeFbm3(p * 2.4) + 0.45 * orbyCreativeFbm3(p * 15.0);
  }
  if (uOrbySurfaceMode < 2.5) {
    vec3 ax = p * vec3(0.2, 18.0, 18.0);
    float streak = orbyCreativeFbm3(ax * vec3(0.2, 1.0, 1.0));
    return 0.5 + 0.5 * sin(p.x * 55.0 + streak * 3.0);
  }
  if (uOrbySurfaceMode < 3.5) {
    float coarse = orbyCreativeFbm3(p * 2.2);
    float fine = orbyCreativeFbm3(p * 14.0);
    return 0.5 * coarse + 0.5 * fine;
  }
  return 0.5;
}
vec3 orbyCreativeDecodeNormalMap(vec2 st) {
  vec3 tn = texture2D(uOrbyNormalMap, st).xyz * 2.0 - 1.0;
  tn.y = -tn.y;
  return tn;
}
vec3 orbyCreativeTriplanarAxisNormal(vec3 n, vec3 tn, vec3 ref, vec3 refAlt) {
  vec3 t = cross(ref, n);
  if (dot(t, t) < 1e-8) t = cross(refAlt, n);
  if (dot(t, t) < 1e-8) return n;
  t = normalize(t);
  vec3 b = normalize(cross(n, t));
  return normalize(tn.x * t + tn.y * b + tn.z * n);
}
vec3 orbyCreativeTriplanarNormalObject(vec3 localPos, vec3 localNormal, float scale) {
  vec3 n = normalize(localNormal);
  vec3 p = (localPos - uOrbyNormalOrigin) * scale;
  vec3 blend = abs(n);
  blend = pow(max(blend, vec3(0.00001)), vec3(4.0));
  blend /= (blend.x + blend.y + blend.z);
  vec3 tX = orbyCreativeDecodeNormalMap(p.zy);
  vec3 tY = orbyCreativeDecodeNormalMap(p.xz);
  vec3 tZ = orbyCreativeDecodeNormalMap(p.xy);
  vec3 nx = orbyCreativeTriplanarAxisNormal(n, tX, vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, 1.0));
  vec3 ny = orbyCreativeTriplanarAxisNormal(n, tY, vec3(0.0, 0.0, 1.0), vec3(1.0, 0.0, 0.0));
  vec3 nz = orbyCreativeTriplanarAxisNormal(n, tZ, vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0));
  return normalize(nx * blend.x + ny * blend.y + nz * blend.z);
}
float orbyCreativeTriplanarNormalDetail(vec3 localPos, vec3 localNormal, float scale) {
  vec3 n = normalize(localNormal);
  vec3 p = (localPos - uOrbyNormalOrigin) * scale;
  vec3 blend = abs(n);
  blend = pow(max(blend, vec3(0.00001)), vec3(4.0));
  blend /= (blend.x + blend.y + blend.z);
  vec2 sX = texture2D(uOrbyNormalMap, p.zy).xy;
  vec2 sY = texture2D(uOrbyNormalMap, p.xz).xy;
  vec2 sZ = texture2D(uOrbyNormalMap, p.xy).xy;
  vec2 s = sX * blend.x + sY * blend.y + sZ * blend.z;
  return length(s - vec2(0.5)) * 2.828427;
}
vec3 orbyCreativeSurfaceNormal(
  vec3 worldN,
  vec3 worldPos,
  vec3 localPos,
  vec3 localN,
  mat3 worldNormalMatrix3
) {
  bool procActive = uOrbySurfaceMode >= 0.5;
  bool mapActive = uOrbyNormalStrength > 0.0001;
  if (!procActive && !mapActive) return worldN;
  vec3 N = worldN;
  if (procActive) {
    float amp = clamp(uOrbyNormalStrength, 0.0, 2.0);
    if (amp < 0.001) amp = 1.0;
    float eps = 0.045 / max(uOrbyScale, 0.12);
    float h = orbyCreativeSurfaceHeight(worldPos);
    float hx = orbyCreativeSurfaceHeight(worldPos + vec3(eps, 0.0, 0.0)) - h;
    float hy = orbyCreativeSurfaceHeight(worldPos + vec3(0.0, eps, 0.0)) - h;
    vec3 up = abs(worldN.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 T = normalize(cross(up, worldN));
    vec3 B = cross(worldN, T);
    N = normalize(worldN - (T * hx + B * hy) * (0.55 + 0.95 * amp));
  }
  if (mapActive) {
    vec3 tn = orbyCreativeTriplanarNormalObject(localPos, localN, uOrbyScale);
    vec3 worldTn = normalize(worldNormalMatrix3 * tn);
    float mixAmt = clamp(uOrbyNormalStrength * 1.35, 0.0, 1.0);
    N = normalize(mix(N, worldTn, mixAmt));
  }
  return N;
}
float orbyCreativeSurfaceFilmMod(vec3 worldPos, vec3 localPos, vec3 localN) {
  if (uOrbySurfaceMode >= 0.5) {
    float amp = clamp(uOrbyNormalStrength, 0.0, 2.0);
    if (amp < 0.001) amp = 1.0;
    float h = orbyCreativeSurfaceHeight(worldPos);
    return mix(0.78, 1.24, h) * (0.86 + 0.14 * amp);
  }
  if (uOrbyNormalStrength > 0.0001) {
    vec3 n = normalize(localN);
    vec3 tn = orbyCreativeTriplanarNormalObject(localPos, n, uOrbyScale);
    mat3 worldNm = mat3(vOrbyWm0, vOrbyWm1, vOrbyWm2);
    vec3 worldTn = normalize(worldNm * tn);
    vec3 L = normalize(vec3(0.35, 0.92, 0.42));
    float bump = length(tn - n);
    float detailLit = max(dot(worldTn, L), 0.0);
    float texDetail = orbyCreativeTriplanarNormalDetail(localPos, n, uOrbyScale);
    float detail = max(bump, texDetail);
    float str = clamp(uOrbyNormalStrength, 0.0, 2.0);
    return clamp(0.58 + detail * str * 1.05 + detailLit * str * 0.42, 0.48, 1.55);
  }
  return 1.0;
}
float orbyCreativeSurfaceMix(vec3 worldPos) {
  return orbyCreativeSurfaceFilmMod(worldPos, vOrbyLocalPos, vOrbyLocalNormal);
}
`;

function scheduleCreativeLookSurfaceResyncWhenTextureReady(model, storeLike, texture) {
  scheduleObjectSurfaceRefreshWhenTextureReady(texture, () => {
    syncCreativeLookSurfaceToModel(model, storeLike);
  });
}

/**
 * Re-apply + repaint once a triplanar normal map finishes loading.
 * @param {import('three').Texture | null | undefined} texture
 * @param {(() => void) | undefined} callback
 */
export function scheduleObjectSurfaceRefreshWhenTextureReady(texture, callback) {
  if (!texture?.isTexture || typeof callback !== 'function') return;
  if (isTextureImageReady(texture)) return;
  const hookKey = 'orbyObjectSurfaceRefreshHooked';
  if (texture.userData?.[hookKey]) return;
  texture.userData[hookKey] = true;
  const prev = texture.onUpdate;
  texture.onUpdate = () => {
    if (typeof prev === 'function') prev();
    if (isTextureImageReady(texture)) {
      texture.onUpdate = prev;
      delete texture.userData[hookKey];
      callback();
    }
  };
}

/**
 * Push svgExtrude surface state onto compatible Shader Lab materials (and chrome/glass PBR).
 * @param {THREE.Object3D} model
 * @param {{ getState: () => object } | { stateStore: { getState: () => object } }} storeLike
 */
export function syncCreativeLookSurfaceToModel(model, storeLike) {
  if (!model || !storeLike) return;
  const st =
    typeof storeLike.getState === 'function'
      ? storeLike.getState()
      : storeLike.stateStore?.getState?.();
  if (!st?.creativeLook?.enabled) return;
  if (!creativeLookPresetSupportsSurfaceDetail(st.creativeLook.preset)) return;

  const { presetId, scale, strength } = resolveAppearanceSurfaceState(st, model);
  const config = getSvgExtrudeSurfacePresetConfig(presetId);
  if (config.kind === 'none') {
    model.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => {
        if (!m?.userData?.orbyCreativeLook) return;
        const tag = m.userData.orbyCreativeLook;
        if ((tag === 'chrome' || tag === 'glass' || tag === 'holo-glass' || tag === 'crystal-gem') && m.isMeshPhysicalMaterial) {
          removeSvgExtrudeProceduralFromMaterial(m);
          return;
        }
        const refs = m.userData.orbyCreativeSurfaceUniformRefs;
        if (refs) applyOrbySurfaceUniformStateToMaterial(m, null);
      });
    });
    return;
  }

  model.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mappingBounds =
      config.kind === 'normalMap' ? computeExtrudeSurfaceMappingBounds(child) : null;
    const surfaceState = resolveOrbySurfaceUniformState(
      presetId,
      scale,
      strength,
      mappingBounds,
    );
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((m) => {
      if (!m?.userData?.orbyCreativeLook) return;
      const tag = m.userData.orbyCreativeLook;
      if (tag === 'glass' || tag === 'holo-glass' || tag === 'crystal-gem') {
        if (m.isMeshPhysicalMaterial) {
          // Roughness-only triplanar detail — normal inject breaks transmission refraction.
          applySvgExtrudeSurfaceToMaterial(m, {
            preset: presetId,
            scale,
            strength,
            normalBounds: mappingBounds,
            transmissionSafe: true,
          });
        }
        return;
      }
      if (tag === 'chrome') {
        if (m.isMeshPhysicalMaterial) {
          applySvgExtrudeSurfaceToMaterial(m, {
            preset: presetId,
            scale,
            strength,
            normalBounds: mappingBounds,
          });
        }
        return;
      }
      const refs = m.userData.orbyCreativeSurfaceUniformRefs;
      if (refs) {
        applyOrbySurfaceUniformStateToMaterial(m, surfaceState);
        scheduleCreativeLookSurfaceResyncWhenTextureReady(model, storeLike, surfaceState?.normalMap);
      }
    });
  });
}

/**
 * Microtask/rAF retries — Shader Lab materials may not exist yet when surface controls
 * fire during an async preset apply.
 * @param {THREE.Object3D} model
 * @param {{ getState: () => object } | { stateStore: { getState: () => object } }} storeLike
 */
export function deferCreativeLookSurfaceResync(model, storeLike, onAfterSync) {
  if (!model || !storeLike) return;
  const run = () => {
    syncCreativeLookSurfaceToModel(model, storeLike);
    onAfterSync?.();
  };
  queueMicrotask(run);
  requestAnimationFrame(run);
}
