import * as THREE from 'three';
import { DEFAULT_GOBO_TEXTURE_ID, DEFAULT_GOBO_SOFTNESS, getGoboPreset } from '../config/gobos.js';
import { goboBlurModeForQuality, normalizeShadowQuality } from '../config/shadowQuality.js';

const OPAQUE_FRAGMENT = '#include <opaque_fragment>';
const WORLDpos_VERTEX = '#include <worldpos_vertex>';

const GOBO_VERTEX_PARS = `
varying vec3 vOrbyGoboWorldPos;
`;

const GOBO_VERTEX_ASSIGN = `
	vOrbyGoboWorldPos = worldPosition.xyz;
`;

const GOBO_UNIFORM_DECL = `
uniform mat4 uOrbyGoboMatrix;
uniform sampler2D uOrbyGoboMap;
uniform float uOrbyGoboStrength;
uniform float uOrbyGoboBlurRadius;
uniform float uOrbyGoboBlurMode;
uniform float uOrbyGoboScale;
uniform vec2 uOrbyGoboPivot;
uniform vec3 uOrbyGoboShadowColor;
`;

const GOBO_AXIS5_WEIGHT_SUM = 0.227027027 + 2 * 0.1945945946 + 2 * 0.1216216216;

const GOBO_FUNCTION_GLSL = `
float orbyGoboTapOcc( vec2 uv ) {
	if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) return 0.0;
	float raw = texture2D( uOrbyGoboMap, uv ).r;
	return 1.0 - smoothstep( 0.88, 0.97, raw );
}
float orbyGoboBlurAxis5( vec2 uv, vec2 delta ) {
	float c0 = orbyGoboTapOcc( uv );
	float c1 = orbyGoboTapOcc( uv + delta ) + orbyGoboTapOcc( uv - delta );
	float c2 = orbyGoboTapOcc( uv + delta * 2.0 ) + orbyGoboTapOcc( uv - delta * 2.0 );
	return ( c0 * 0.227027027 + c1 * 0.1945945946 + c2 * 0.1216216216 ) / ${GOBO_AXIS5_WEIGHT_SUM.toFixed(9) };
}
float orbyGoboBlurSeparable5( vec2 uv, float radius ) {
	vec2 h = vec2( radius, 0.0 );
	vec2 v = vec2( 0.0, radius );
	float row0 = orbyGoboBlurAxis5( uv, h );
	float row1 = orbyGoboBlurAxis5( uv + v, h ) + orbyGoboBlurAxis5( uv - v, h );
	float row2 = orbyGoboBlurAxis5( uv + v * 2.0, h ) + orbyGoboBlurAxis5( uv - v * 2.0, h );
	return row0 * 0.227027027 + row1 * 0.1945945946 + row2 * 0.1216216216;
}
float orbyGoboBlurSeparable7( vec2 uv, float radius ) {
	vec2 h = vec2( radius, 0.0 );
	vec2 v = vec2( 0.0, radius );
	float row0 = orbyGoboBlurAxis5( uv, h );
	float row1 = orbyGoboBlurAxis5( uv + v * 0.666667, h ) + orbyGoboBlurAxis5( uv - v * 0.666667, h );
	float row2 = orbyGoboBlurAxis5( uv + v * 1.333333, h ) + orbyGoboBlurAxis5( uv - v * 1.333333, h );
	float row3 = orbyGoboBlurAxis5( uv + v * 2.0, h ) + orbyGoboBlurAxis5( uv - v * 2.0, h );
	return row0 * 0.3077 + row1 * 0.2921 + row2 * 0.2339 + row3 * 0.1201;
}
float orbySampleGoboOcc( vec2 uv ) {
	if ( uOrbyGoboBlurRadius <= 0.00001 ) return orbyGoboTapOcc( uv );
	if ( uOrbyGoboBlurMode < 0.5 ) return orbyGoboTapOcc( uv );
	if ( uOrbyGoboBlurMode < 1.5 ) {
		vec2 br = vec2( uOrbyGoboBlurRadius );
		float c0 = orbyGoboTapOcc( uv );
		float occ = c0 * 0.25;
		occ += (
			orbyGoboTapOcc( uv + vec2( br.x, 0.0 ) ) + orbyGoboTapOcc( uv - vec2( br.x, 0.0 ) )
			+ orbyGoboTapOcc( uv + vec2( 0.0, br.y ) ) + orbyGoboTapOcc( uv - vec2( 0.0, br.y ) )
		) * 0.125;
		occ += (
			orbyGoboTapOcc( uv + br ) + orbyGoboTapOcc( uv - br )
			+ orbyGoboTapOcc( uv + vec2( br.x, -br.y ) ) + orbyGoboTapOcc( uv + vec2( -br.x, br.y ) )
		) * 0.0625;
		return occ;
	}
	if ( uOrbyGoboBlurMode < 2.5 ) {
		return orbyGoboBlurSeparable5( uv, uOrbyGoboBlurRadius );
	}
	return orbyGoboBlurSeparable7( uv, uOrbyGoboBlurRadius );
}
`;

/** Injected at #include <opaque_fragment> — statements only (inside main). */
const GOBO_APPLY_GLSL = `
	vec2 orbyGoboUv = ( uOrbyGoboMatrix * vec4( vOrbyGoboWorldPos, 1.0 ) ).xy;
	vec2 orbyGoboCentered = orbyGoboUv - uOrbyGoboPivot;
	orbyGoboUv = orbyGoboCentered / max( uOrbyGoboScale, 0.001 ) + uOrbyGoboPivot;
	float orbyGoboProjEdge = max( uOrbyGoboBlurRadius, 0.00025 );
	float orbyGoboInProj =
		smoothstep( 0.0, orbyGoboProjEdge, orbyGoboUv.x )
		* ( 1.0 - smoothstep( 1.0 - orbyGoboProjEdge, 1.0, orbyGoboUv.x ) )
		* smoothstep( 0.0, orbyGoboProjEdge, orbyGoboUv.y )
		* ( 1.0 - smoothstep( 1.0 - orbyGoboProjEdge, 1.0, orbyGoboUv.y ) );
	float orbyGoboOcc = orbySampleGoboOcc( orbyGoboUv );
	float orbyGoboAmt = orbyGoboOcc * uOrbyGoboStrength * orbyGoboInProj;
	outgoingLight.rgb = mix( outgoingLight.rgb, uOrbyGoboShadowColor, clamp( orbyGoboAmt, 0.0, 1.0 ) );
`;

function clampSoftness(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 0;
  return Math.min(4, Math.max(0, raw));
}

function normalizeStrength(strength) {
  const raw = Number(strength);
  if (!Number.isFinite(raw)) return 0;
  return Math.min(1, Math.max(0, raw));
}

function softnessToBlurRadius(softness) {
  const s = clampSoftness(softness);
  if (s <= 0) return 0;
  // Penumbra spread in UV space — kept modest (5-tap kernel reaches ~2× radius).
  return (s / 4) * 0.012;
}

/**
 * Scale blur radius so every quality tier shares the same ~2× max sample reach.
 * Medium 3×3 only spans 1× per axis; high/ultra separable kernels reach 2×.
 */
export function goboBlurRadiusForPresentation(softness, blurMode) {
  const base = softnessToBlurRadius(softness);
  if (base <= 0) return 0;
  const mode = Number(blurMode);
  if (mode < 0.5) return base;
  if (mode < 1.5) return base * 2;
  return base;
}

export const GOBO_UI_MIN = 0;
export const GOBO_UI_MAX = 10;
/** Effective projection scale at UI 0 / 10 (log-spaced — UI 5 = effective 0.5). */
export const GOBO_EFFECTIVE_MIN = 0.025;
export const GOBO_EFFECTIVE_MAX = 10;

const LOG_GOBO_EFF_MIN = Math.log(GOBO_EFFECTIVE_MIN);
const LOG_GOBO_EFF_MAX = Math.log(GOBO_EFFECTIVE_MAX);
const LOG_GOBO_EFF_RANGE = LOG_GOBO_EFF_MAX - LOG_GOBO_EFF_MIN;

/** Default UI scale — 5 on the 0–10 slider (effective 0.5 pattern size). */
export const GOBO_UI_DEFAULT = 5;

export function clampGoboUiScale(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return GOBO_UI_DEFAULT;
  return Math.min(GOBO_UI_MAX, Math.max(GOBO_UI_MIN, raw));
}

/** UI slider 0–10 → shader projection scale (higher effective = smaller pattern). */
export function goboUiScaleToEffective(ui) {
  const u = clampGoboUiScale(ui);
  if (u <= GOBO_UI_MIN) return GOBO_EFFECTIVE_MIN;
  if (u >= GOBO_UI_MAX) return GOBO_EFFECTIVE_MAX;
  const t = u / GOBO_UI_MAX;
  return Math.exp(LOG_GOBO_EFF_MIN + t * LOG_GOBO_EFF_RANGE);
}

/** Inverse — migrate legacy effective values stored in scene JSON. */
export function goboEffectiveScaleToUi(effective) {
  const e = Math.min(GOBO_EFFECTIVE_MAX, Math.max(GOBO_EFFECTIVE_MIN, Number(effective) || 1));
  if (LOG_GOBO_EFF_RANGE <= 0) return GOBO_UI_DEFAULT;
  const t = (Math.log(e) - LOG_GOBO_EFF_MIN) / LOG_GOBO_EFF_RANGE;
  return clampGoboUiScale(t * GOBO_UI_MAX);
}

/**
 * @param {number | undefined} scale
 * @param {'ui' | 'effective' | undefined} scaleSpace
 */
export function normalizeStoredGoboScale(scale, scaleSpace) {
  if (scaleSpace === 'ui') return clampGoboUiScale(scale);
  return goboEffectiveScaleToUi(scale);
}

/** @deprecated Use clampGoboUiScale — kept for imports that expected effective clamp. */
export const GOBO_SCALE_MIN = GOBO_EFFECTIVE_MIN;
/** @deprecated Use GOBO_UI_MAX + goboUiScaleToEffective. */
export const GOBO_SCALE_MAX = GOBO_EFFECTIVE_MAX;

function effectiveGoboScaleFromController(uiScale) {
  return goboUiScaleToEffective(uiScale);
}

function normalizeGoboRotationDeg(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 0;
  return ((raw % 360) + 360) % 360;
}

function fillBox3Corners(box, corners) {
  const { min, max } = box;
  let i = 0;
  for (let xi = 0; xi < 2; xi += 1) {
    const x = xi === 0 ? min.x : max.x;
    for (let yi = 0; yi < 2; yi += 1) {
      const y = yi === 0 ? min.y : max.y;
      for (let zi = 0; zi < 2; zi += 1) {
        corners[i].set(x, y, zi === 0 ? min.z : max.z);
        i += 1;
      }
    }
  }
  return corners;
}

function setStableCameraUp(camera, lightDir, outUp) {
  if (Math.abs(lightDir.y) > 0.99) {
    outUp.set(0, 0, 1);
  } else {
    outUp.set(0, 1, 0);
  }
  camera.up.copy(outUp);
}

export function isGoboPatchableMaterial(material) {
  return !!(
    material?.isMeshStandardMaterial
    || material?.isMeshPhysicalMaterial
  );
}

function resolvePreviousOnBeforeCompile(material) {
  const live = material.onBeforeCompile;
  if (typeof live === 'function' && !live.__orbyGoboPatch && !live.__orbyShadowTintPatch) {
    return live;
  }
  if (material.userData?.shadowTintPatched) {
    const shadowPrevious = material.userData?.orbyShadowTint?.previousOnBeforeCompile;
    if (typeof shadowPrevious === 'function' && !shadowPrevious.__orbyGoboPatch) {
      return shadowPrevious;
    }
  }
  const stored = material.userData?.orbyGobo?.previousOnBeforeCompile;
  if (typeof stored === 'function' && !stored.__orbyGoboPatch) {
    return stored;
  }
  const original = material.userData?.originalOnBeforeCompile;
  if (typeof original === 'function' && !original.__orbyGoboPatch) {
    return original;
  }
  return () => {};
}

function resolveGoboPreviousOnBeforeCompile(material) {
  if (material.userData?.shadowTintPatched) {
    return material.userData.shadowTintOnBeforeCompile ?? (() => {});
  }
  return resolvePreviousOnBeforeCompile(material);
}

/** Gobo sits outside shadow tint so both compile hooks stay in the call chain. */
function attachGoboCompileHook(material, goboCompile, stash) {
  stash.previousOnBeforeCompile = resolveGoboPreviousOnBeforeCompile(material);
  material.onBeforeCompile = goboCompile;
}

function detachGoboCompileHook(material, stash) {
  if (material.userData?.shadowTintPatched) {
    material.onBeforeCompile = material.userData.shadowTintOnBeforeCompile;
    return;
  }
  const previous = stash?.previousOnBeforeCompile;
  if (typeof previous === 'function') {
    material.onBeforeCompile = previous;
  } else {
    delete material.onBeforeCompile;
  }
}

function ensureGoboVertexPars(vertexShader) {
  if (vertexShader.includes('vOrbyGoboWorldPos')) return vertexShader;
  return vertexShader.replace('#include <common>', `#include <common>\n${GOBO_VERTEX_PARS}`);
}

function ensureGoboVertexAssign(vertexShader) {
  if (vertexShader.includes('vOrbyGoboWorldPos =')) return vertexShader;
  if (vertexShader.includes(WORLDpos_VERTEX)) {
    return vertexShader.replace(
      WORLDpos_VERTEX,
      `${WORLDpos_VERTEX}\n${GOBO_VERTEX_ASSIGN}`,
    );
  }
  return vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>\n\tvec4 worldPosition = modelMatrix * vec4( transformed, 1.0 );\n${GOBO_VERTEX_ASSIGN}`,
  );
}

function ensureGoboUniformDecl(fragmentShader) {
  if (fragmentShader.includes('uOrbyGoboMatrix')) return fragmentShader;
  return fragmentShader.replace('#include <common>', `#include <common>\n${GOBO_UNIFORM_DECL}`);
}

function ensureGoboFunctionDecl(fragmentShader) {
  if (fragmentShader.includes('orbySampleGoboOcc')) return fragmentShader;
  // Place helper at global scope — before void main() { ... }.
  if (fragmentShader.includes('void main()')) {
    return fragmentShader.replace('void main()', `${GOBO_FUNCTION_GLSL}\nvoid main()`);
  }
  return fragmentShader.replace('#include <common>', `#include <common>\n${GOBO_FUNCTION_GLSL}`);
}

function ensureGoboVaryingPars(fragmentShader) {
  if (fragmentShader.includes('vOrbyGoboWorldPos')) return fragmentShader;
  return fragmentShader.replace(
    '#include <common>',
    `#include <common>\n${GOBO_VERTEX_PARS}`,
  );
}

export function applyGoboToMaterial(material, controller) {
  if (!isGoboPatchableMaterial(material)) return;
  if (material.userData?.orbyCreativeLook) return;

  if (!material.userData.orbyGobo) {
    material.userData.orbyGobo = {};
  }
  const stash = material.userData.orbyGobo;

  const hookIntact =
    material.userData.goboPatched
    && material.userData.goboOnBeforeCompile
    && stash.shaderVersion === 12;

  if (hookIntact && stash.uniforms?.strength && stash.uniforms?.color
    && stash.uniforms?.scale && stash.uniforms?.pivot && stash.uniforms?.blurMode) {
    if (stash.textureId !== controller?.textureId || stash.textureRevision !== controller?._textureRevision) {
      if (stash.uniforms.map) stash.uniforms.map.value = controller?._goboTexture ?? null;
      stash.textureId = controller?.textureId;
      stash.textureRevision = controller?._textureRevision;
    }
    if (stash.shadowSettingsRevision !== controller?._shadowSettingsRevision) {
      stash.shadowSettingsRevision = controller?._shadowSettingsRevision;
    }
    controller?.syncMaterialUniforms(material);
    return;
  }

  if (material.userData.goboPatched) {
    detachGoboCompileHook(material, stash);
    delete material.userData.goboPatched;
    delete material.userData.goboOnBeforeCompile;
    delete stash.uniforms;
  }

  const goboCompile = function orbyGoboCompile(shader) {
    stash.previousOnBeforeCompile?.call(material, shader);

    if (!shader.vertexShader.includes('vOrbyGoboWorldPos')) {
      shader.vertexShader = ensureGoboVertexPars(shader.vertexShader);
      shader.vertexShader = ensureGoboVertexAssign(shader.vertexShader);
    }
    if (!shader.fragmentShader.includes('orbySampleGoboOcc')) {
      shader.fragmentShader = ensureGoboVaryingPars(shader.fragmentShader);
      shader.fragmentShader = ensureGoboUniformDecl(shader.fragmentShader);
      shader.fragmentShader = ensureGoboFunctionDecl(shader.fragmentShader);
      shader.fragmentShader = shader.fragmentShader.replace(
        OPAQUE_FRAGMENT,
        `${GOBO_APPLY_GLSL}\n\t${OPAQUE_FRAGMENT}`,
      );
    }

    controller?.bindShaderUniforms(shader, stash);
  };
  goboCompile.__orbyGoboPatch = true;

  attachGoboCompileHook(material, goboCompile, stash);
  material.userData.goboPatched = true;
  material.userData.goboOnBeforeCompile = goboCompile;
  stash.shaderVersion = 12;
  stash.textureId = controller?.textureId;
  stash.textureRevision = controller?._textureRevision;
  const prevCacheKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = function orbyGoboCacheKey() {
    const base = typeof prevCacheKey === 'function' ? prevCacheKey() : '';
    return `${base}|orbyGobo:v12:${controller?.enabled ? 1 : 0}:${controller?.textureId}:${controller?.goboSoftness}:${controller?.softnessQuality}:${controller?.shadowOpacity}:${controller?.goboScale}:${controller?.goboRotationDeg}:${controller?.goboBlurMode}:${controller?.shadowColor?.getHexString?.() ?? '080808'}`;
  };
  material.needsUpdate = true;
}

export function clearGoboFromMaterial(material) {
  if (!material?.userData?.goboPatched) return;
  const stash = material.userData.orbyGobo;
  detachGoboCompileHook(material, stash);
  delete material.userData.goboPatched;
  delete material.userData.goboOnBeforeCompile;
  if (stash) delete stash.uniforms;
  material.needsUpdate = true;
}

export function applyGoboToObject(object, controller) {
  if (!object || !controller?.enabled) return;
  object.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    if (child.userData?.meshglBaseGlassReflector) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((mat) => applyGoboToMaterial(mat, controller));
  });
}

export function clearGoboFromObject(object) {
  if (!object) return;
  object.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((mat) => clearGoboFromMaterial(mat));
  });
}

/**
 * Standalone gobo projection from the key directional light onto scene surfaces.
 */
export class GoboProjectionController {
  constructor({
    textureLoader,
    getKeyLight = () => null,
    getProjectionCenter = () => new THREE.Vector3(0, 1, 0),
    getProjectionBounds = null,
    getProjectionRadius = () => 3,
  } = {}) {
    this.textureLoader = textureLoader ?? new THREE.TextureLoader();
    this.getKeyLight = getKeyLight;
    this.getProjectionCenter = getProjectionCenter;
    this.getProjectionBounds = getProjectionBounds;
    this.getProjectionRadius = getProjectionRadius;

    this.enabled = false;
    this.textureId = DEFAULT_GOBO_TEXTURE_ID;
    this.goboSoftness = DEFAULT_GOBO_SOFTNESS;
    this.goboScale = GOBO_UI_DEFAULT;
    this.goboRotationDeg = 0;
    this.softnessQuality = 'medium';
    this.goboBlurMode = goboBlurModeForQuality('medium');
    this.shadowOpacity = 0.25;
    this.shadowColor = new THREE.Color('#080808');

    this._sourceTexture = null;
    this._goboTexture = null;
    this._loadToken = 0;
    this._textureRevision = 0;
    this._shadowSettingsRevision = 0;

    this._goboCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this._goboMatrix = new THREE.Matrix4();
    this._textureMatrix = new THREE.Matrix4();
    this._scratchTarget = new THREE.Vector3();
    this._projectionBox = new THREE.Box3();
    this._projectionPivot = new THREE.Vector3();
    this._projectionPivotUv = new THREE.Vector2(0.5, 0.5);
    this._projectionPivotScratch = new THREE.Vector4();
    this._projectionSize = new THREE.Vector3();
    this._lightDirection = new THREE.Vector3();
    this._cameraUp = new THREE.Vector3();
    this._boxCorners = Array.from({ length: 8 }, () => new THREE.Vector3());
  }

  bindShaderUniforms(shader, stash) {
    if (!shader.uniforms.uOrbyGoboMatrix) {
      shader.uniforms.uOrbyGoboMatrix = { value: this._goboMatrix.clone() };
    } else {
      shader.uniforms.uOrbyGoboMatrix.value.copy(this._goboMatrix);
    }
    if (!shader.uniforms.uOrbyGoboMap) {
      shader.uniforms.uOrbyGoboMap = { value: this._goboTexture };
    } else {
      shader.uniforms.uOrbyGoboMap.value = this._goboTexture;
    }
    const strength = this.enabled ? normalizeStrength(this.shadowOpacity) : 0;
    const blur = goboBlurRadiusForPresentation(this.goboSoftness, this.goboBlurMode);
    const scale = effectiveGoboScaleFromController(this.goboScale);
    if (!shader.uniforms.uOrbyGoboStrength) {
      shader.uniforms.uOrbyGoboStrength = { value: strength };
    } else {
      shader.uniforms.uOrbyGoboStrength.value = strength;
    }
    if (!shader.uniforms.uOrbyGoboBlurRadius) {
      shader.uniforms.uOrbyGoboBlurRadius = { value: blur };
    } else {
      shader.uniforms.uOrbyGoboBlurRadius.value = blur;
    }
    if (!shader.uniforms.uOrbyGoboBlurMode) {
      shader.uniforms.uOrbyGoboBlurMode = { value: this.goboBlurMode };
    } else {
      shader.uniforms.uOrbyGoboBlurMode.value = this.goboBlurMode;
    }
    if (!shader.uniforms.uOrbyGoboShadowColor) {
      shader.uniforms.uOrbyGoboShadowColor = { value: this.shadowColor.clone() };
    } else {
      shader.uniforms.uOrbyGoboShadowColor.value.copy(this.shadowColor);
    }
    if (!shader.uniforms.uOrbyGoboScale) {
      shader.uniforms.uOrbyGoboScale = { value: scale };
    } else {
      shader.uniforms.uOrbyGoboScale.value = scale;
    }
    if (!shader.uniforms.uOrbyGoboPivot) {
      shader.uniforms.uOrbyGoboPivot = { value: this._projectionPivotUv.clone() };
    } else {
      shader.uniforms.uOrbyGoboPivot.value.copy(this._projectionPivotUv);
    }
    stash.uniforms = {
      matrix: shader.uniforms.uOrbyGoboMatrix,
      map: shader.uniforms.uOrbyGoboMap,
      strength: shader.uniforms.uOrbyGoboStrength,
      blur: shader.uniforms.uOrbyGoboBlurRadius,
      blurMode: shader.uniforms.uOrbyGoboBlurMode,
      color: shader.uniforms.uOrbyGoboShadowColor,
      scale: shader.uniforms.uOrbyGoboScale,
      pivot: shader.uniforms.uOrbyGoboPivot,
    };
    stash.textureId = this.textureId;
    stash.textureRevision = this._textureRevision;
  }

  syncMaterialUniforms(material) {
    const uniforms = material.userData?.orbyGobo?.uniforms;
    if (!uniforms) return;
    uniforms.matrix?.value?.copy(this._goboMatrix);
    if (uniforms.map) uniforms.map.value = this._goboTexture;
    if (uniforms.strength) {
      uniforms.strength.value = this.enabled ? normalizeStrength(this.shadowOpacity) : 0;
    }
    if (uniforms.blur) {
      uniforms.blur.value = goboBlurRadiusForPresentation(this.goboSoftness, this.goboBlurMode);
    }
    if (uniforms.blurMode) uniforms.blurMode.value = this.goboBlurMode;
    if (uniforms.color) uniforms.color.value.copy(this.shadowColor);
    if (uniforms.scale) uniforms.scale.value = effectiveGoboScaleFromController(this.goboScale);
    if (uniforms.pivot) uniforms.pivot.value.copy(this._projectionPivotUv);
  }

  async setTextureId(textureId) {
    const preset = getGoboPreset(textureId);
    this.textureId = preset?.id ?? DEFAULT_GOBO_TEXTURE_ID;
    const token = ++this._loadToken;
    const path = getGoboPreset(this.textureId).path;

    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        path,
        (texture) => {
          if (token !== this._loadToken) {
            texture.dispose();
            resolve(false);
            return;
          }
          this._sourceTexture?.dispose?.();
          this._sourceTexture = texture;
          texture.colorSpace = THREE.NoColorSpace;
          texture.wrapS = THREE.ClampToEdgeWrapping;
          texture.wrapT = THREE.ClampToEdgeWrapping;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          this._goboTexture = texture;
          this._textureRevision += 1;
          resolve(true);
        },
        undefined,
        (err) => reject(err),
      );
    });
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
  }

  setShadowSettings({ opacity, color } = {}) {
    let changed = false;
    if (opacity !== undefined) {
      this.shadowOpacity = normalizeStrength(opacity);
      changed = true;
    }
    if (color !== undefined) {
      this.shadowColor.set(color);
      changed = true;
    }
    if (changed) this._shadowSettingsRevision += 1;
  }

  setGoboSettings({ softness, scale, rotation } = {}) {
    if (softness !== undefined) {
      this.goboSoftness = clampSoftness(softness);
    }
    if (scale !== undefined) {
      this.goboScale = clampGoboUiScale(scale);
    }
    if (rotation !== undefined) {
      this.goboRotationDeg = normalizeGoboRotationDeg(rotation);
    }
  }

  setSoftnessQuality(quality) {
    const normalized = normalizeShadowQuality(quality);
    const prevMode = this.goboBlurMode;
    this.softnessQuality = normalized;
    this.goboBlurMode = goboBlurModeForQuality(this.softnessQuality);
    return prevMode !== this.goboBlurMode;
  }

  /** @deprecated Gobo softness quality is independent from shadow-map quality. */
  setShadowQuality(quality) {
    return this.setSoftnessQuality(quality);
  }

  markProgramsDirty({ model, backdrop, infinityCove, podium } = {}) {
    const mark = (root) => {
      if (!root) return;
      root.traverse((child) => {
        if (!child.isMesh || !child.material || !child.userData?.goboPatched) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat) => {
          mat.needsUpdate = true;
        });
      });
    };
    mark(model);
    mark(podium);
    mark(backdrop);
    mark(infinityCove);
  }

  updateProjectionMatrix() {
    const key = this.getKeyLight?.();
    const pivot = this._projectionPivot;
    let hasBounds = false;

    if (typeof this.getProjectionBounds === 'function') {
      this.getProjectionBounds(this._projectionBox);
      hasBounds = !this._projectionBox.isEmpty();
    }
    this.getProjectionCenter?.(pivot) ?? pivot.set(0, 1, 0);

    const lightDir = this._lightDirection;
    if (key?.isDirectionalLight) {
      const target = key.target?.position ?? pivot;
      lightDir.copy(key.position).sub(target);
      if (lightDir.lengthSq() < 1e-8) {
        lightDir.set(0, -1, 0);
      } else {
        lightDir.normalize();
      }
      const standoff = hasBounds
        ? Math.max(20, this._projectionBox.getSize(this._projectionSize).length() * 1.5)
        : 20;
      this._goboCamera.position.copy(pivot).addScaledVector(lightDir, -standoff);
      this._goboCamera.lookAt(pivot);
      setStableCameraUp(this._goboCamera, lightDir, this._cameraUp);
      const roll = normalizeGoboRotationDeg(this.goboRotationDeg);
      if (roll !== 0) {
        this._goboCamera.rotateZ(THREE.MathUtils.degToRad(roll));
      }
    } else {
      this._goboCamera.position.set(pivot.x + 5, pivot.y + 8, pivot.z + 5);
      this._goboCamera.lookAt(pivot);
      this._goboCamera.up.set(0, 1, 0);
      const roll = normalizeGoboRotationDeg(this.goboRotationDeg);
      if (roll !== 0) {
        this._goboCamera.rotateZ(THREE.MathUtils.degToRad(roll));
      }
    }

    this._goboCamera.updateMatrixWorld(true);

    if (hasBounds) {
      fillBox3Corners(this._projectionBox, this._boxCorners);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let i = 0; i < 8; i += 1) {
        const corner = this._boxCorners[i].applyMatrix4(this._goboCamera.matrixWorldInverse);
        minX = Math.min(minX, corner.x);
        maxX = Math.max(maxX, corner.x);
        minY = Math.min(minY, corner.y);
        maxY = Math.max(maxY, corner.y);
        minZ = Math.min(minZ, corner.z);
        maxZ = Math.max(maxZ, corner.z);
      }
      const span = Math.max(maxX - minX, maxY - minY, 0.5);
      const pad = span * 0.1;
      this._goboCamera.left = minX - pad;
      this._goboCamera.right = maxX + pad;
      this._goboCamera.top = maxY + pad;
      this._goboCamera.bottom = minY - pad;
      this._goboCamera.near = Math.max(0.1, -maxZ + pad);
      this._goboCamera.far = Math.max(this._goboCamera.near + 1, -minZ + pad);
    } else {
      const radius = Math.max(0.5, Number(this.getProjectionRadius?.()) || 3);
      const extent = radius * 2.4;
      this._goboCamera.left = -extent;
      this._goboCamera.right = extent;
      this._goboCamera.top = extent;
      this._goboCamera.bottom = -extent;
      this._goboCamera.near = 0.1;
      this._goboCamera.far = Math.max(40, radius * 12);
    }

    this._goboCamera.updateProjectionMatrix();
    this._textureMatrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0,
    );
    this._goboMatrix.multiplyMatrices(
      this._textureMatrix,
      this._goboCamera.projectionMatrix,
    ).multiply(this._goboCamera.matrixWorldInverse);

    this._projectionPivotScratch.set(pivot.x, pivot.y, pivot.z, 1.0);
    this._projectionPivotScratch.applyMatrix4(this._goboMatrix);
    this._projectionPivotUv.set(
      this._projectionPivotScratch.x,
      this._projectionPivotScratch.y,
    );
  }

  applyToScene({ model, backdrop, infinityCove, podium } = {}) {
    if (!this.enabled || !this._goboTexture) return;
    this.updateProjectionMatrix();
    if (model) applyGoboToObject(model, this);
    if (podium) applyGoboToObject(podium, this);
    if (backdrop) applyGoboToObject(backdrop, this);
    if (infinityCove) applyGoboToObject(infinityCove, this);
    this.syncUniformsOnScene({ model, backdrop, infinityCove, podium });
  }

  removeFromScene({ model, backdrop, infinityCove, podium } = {}) {
    if (model) clearGoboFromObject(model);
    if (podium) clearGoboFromObject(podium);
    if (backdrop) clearGoboFromObject(backdrop);
    if (infinityCove) clearGoboFromObject(infinityCove);
  }

  syncUniformsOnScene({ model, backdrop, infinityCove, podium } = {}) {
    if (!this.enabled) return;
    this.updateProjectionMatrix();
    const sync = (root) => {
      if (!root) return;
      root.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat) => this.syncMaterialUniforms(mat));
      });
    };
    sync(model);
    sync(podium);
    sync(backdrop);
    sync(infinityCove);
  }

  dispose() {
    this._loadToken += 1;
    this._sourceTexture?.dispose?.();
    this._sourceTexture = null;
    this._goboTexture = null;
  }
}

export {
  softnessToBlurRadius,
  clampSoftness,
  normalizeGoboRotationDeg,
  normalizeStrength as normalizeGoboStrength,
};
