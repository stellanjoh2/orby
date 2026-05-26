import * as THREE from 'three';
import {
  GOD_RAYS_MAX_SAMPLES,
  normalizeGodRaysQualityId,
  resolveGodRaysQualityTier,
  resolveGodRaysSampleCount,
} from './constants.js';

const yAxis = new THREE.Vector3(0, 1, 0);
const SUN_DISTANCE = 40;
const MAX_SAMPLES = GOD_RAYS_MAX_SAMPLES;
/** Screen-space streak reach vs stock radial-blur tuning (+25% max length). */
const GOD_RAYS_LENGTH_SCALE = 1.25;
const GOD_RAYS_STEP_MIN = 0.0011 * GOD_RAYS_LENGTH_SCALE;
const GOD_RAYS_STEP_MAX = 0.0052 * GOD_RAYS_LENGTH_SCALE;
const GOD_RAYS_MASK_FADE_OUTER = 1.08 * GOD_RAYS_LENGTH_SCALE;

const OCCLUSION_STEPS_BY_QUALITY = {
  low: 8,
  medium: 12,
  high: 16,
  ultra: 16,
};

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
#define MAX_SAMPLES ${MAX_SAMPLES}

#include <common>
#include <packing>

varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 uLightPosition;
uniform vec3 uRayColor;
uniform vec3 uSunWorldPosition;
uniform float uStrength;
uniform float uLength;
uniform float uSoftness;
uniform float uThreshold;
uniform float uInView;
uniform float uSunOccluded;
uniform float uStepScale;
uniform vec2 uResolution;
uniform int uSampleCount;
uniform int uOcclusionSteps;
uniform float uNearClip;
uniform float uFarClip;
uniform float uDepthBias;
uniform mat4 uProjectionMatrix;
uniform mat4 uInverseProjectionMatrix;
uniform mat4 uViewMatrix;

float godRaysIgn(vec2 p) {
  return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y));
}

float godRaysLum(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

float godRaysSampleDepth(vec2 uv) {
  #if DEPTH_PACKING == 1
  return unpackRGBAToDepth(texture2D(tDepth, uv));
  #else
  return texture2D(tDepth, uv).x;
  #endif
}

float godRaysViewZ(vec2 uv) {
  float depth = godRaysSampleDepth(uv);
  if (depth >= 1.0) {
    return uFarClip;
  }
  return perspectiveDepthToViewZ(depth, uNearClip, uFarClip);
}

vec3 godRaysViewPos(vec2 uv, float viewZ) {
  float clipW = uProjectionMatrix[2][3] * viewZ + uProjectionMatrix[3][3];
  vec4 clipPos = vec4((uv - 0.5) * 2.0, 0.0, 1.0);
  clipPos.xy *= clipW;
  clipPos.z = viewZ * clipW;
  clipPos.w = clipW;
  return (uInverseProjectionMatrix * clipPos).xyz;
}

bool godRaysPixelSeesSun(vec3 originView, vec3 sunView) {
  vec3 delta = sunView - originView;
  float totalDist = length(delta);
  if (totalDist < 0.001) {
    return true;
  }

  vec3 dir = delta / totalDist;
  float bias = max(uDepthBias, totalDist * 0.0035);
  int steps = max(uOcclusionSteps, 1);

  for (int i = 1; i < 16; i++) {
    if (i >= steps) break;
    float t = float(i) / float(steps);
    vec3 marchView = originView + dir * totalDist * t;
    vec4 proj = uProjectionMatrix * vec4(marchView, 1.0);
    if (abs(proj.w) < 1e-5) continue;
    vec2 suv = proj.xy / proj.w * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) {
      continue;
    }

    float sceneViewZ = godRaysViewZ(suv);
    if (sceneViewZ < marchView.z - bias) {
      return false;
    }
  }

  return true;
}

void main() {
  vec4 base = texture2D(tDiffuse, vUv);

  if (uInView < 0.001 || uStrength <= 0.0001) {
    gl_FragColor = base;
    return;
  }

  float pixelViewZ = godRaysViewZ(vUv);
  if (pixelViewZ >= uFarClip * 0.999) {
    gl_FragColor = base;
    return;
  }

  vec3 pixelViewPos = godRaysViewPos(vUv, pixelViewZ);
  vec3 sunViewPos = (uViewMatrix * vec4(uSunWorldPosition, 1.0)).xyz;
  if (!godRaysPixelSeesSun(pixelViewPos, sunViewPos)) {
    gl_FragColor = base;
    return;
  }

  vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  vec2 delta = (uLightPosition - vUv) * aspect;
  float distToLight = length(delta);
  vec2 rayDir = distToLight > 1e-5 ? normalize(delta) : vec2(0.0);
  vec2 marchDir = rayDir / aspect;

  float sunCore = mix(0.035, 0.11, uSoftness);
  float lumThreshold = mix(0.32, 0.94, uThreshold);
  float lumSoft = mix(0.07, 0.26, 1.0 - uSoftness);

  float shaftMask = smoothstep(sunCore * 0.45, sunCore * 2.0, distToLight);
  shaftMask *= 1.0 - smoothstep(0.28, ${GOD_RAYS_MASK_FADE_OUTER}, distToLight);

  float scatterScale = mix(0.28, 1.0, uSunOccluded);
  float coronaRadius = sunCore * mix(2.4, 4.0, uSoftness);
  float corona =
    (1.0 - uSunOccluded) *
    exp(-distToLight / max(coronaRadius, 0.01)) *
    smoothstep(sunCore * 0.25, sunCore * 1.1, distToLight);

  vec2 perpDir = vec2(-marchDir.y, marchDir.x);
  float stepSize =
    mix(${GOD_RAYS_STEP_MIN}, ${GOD_RAYS_STEP_MAX}, uLength) * uStepScale * (1.0 + uSoftness * 0.35);
  float sampleSpan = stepSize * float(uSampleCount);
  float invSamples = 1.0 / max(float(uSampleCount), 1.0);
  float decayRate = mix(0.88, 0.965, uSoftness);
  float scatterDepthBias = max(uDepthBias * 0.65, abs(pixelViewZ) * 0.0025);
  vec3 exposure = vec3(0.0);

  for (int i = 0; i < MAX_SAMPLES; i++) {
    if (i >= uSampleCount) break;

    float fi = float(i);
    vec2 noiseSeed = vUv * uResolution + fi * 1.753;
    float tapNoise = godRaysIgn(noiseSeed);
    float tapNoise2 = godRaysIgn(noiseSeed + 19.19);

    float t = (fi + tapNoise) * invSamples;
    vec2 sampleUv = vUv + marchDir * (t * sampleSpan);
    sampleUv += perpDir * (tapNoise2 - 0.5) * stepSize * 0.72;

    if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) {
      continue;
    }

    float sampleViewZ = godRaysViewZ(sampleUv);
    if (sampleViewZ < pixelViewZ - scatterDepthBias) {
      continue;
    }

    vec3 sampleColor = texture2D(tDiffuse, sampleUv).rgb;
    float lum = godRaysLum(sampleColor);

    float sampleDist = length((sampleUv - uLightPosition) * aspect);
    float nearSunSample = 1.0 - smoothstep(sunCore * 1.0, sunCore * 3.5, sampleDist);
    float minMarchT = mix(0.28, 0.1, uSunOccluded);
    float alongRayWeight = smoothstep(minMarchT * 0.45, minMarchT, t);
    float maxChan = max(sampleColor.r, max(sampleColor.g, sampleColor.b));
    float minChan = min(sampleColor.r, min(sampleColor.g, sampleColor.b));
    float sat = (maxChan - minChan) / max(maxChan, 0.001);
    float emissiveLike =
      smoothstep(0.4, 0.82, sat) * smoothstep(lumThreshold + 0.05, lumThreshold + 0.45, lum);
    float sunSourceWeight = max(nearSunSample, alongRayWeight);
    float emissiveGuard = mix(0.12, 0.45, uSunOccluded);
    sunSourceWeight *= mix(1.0, emissiveGuard, emissiveLike);

    float adaptiveThreshold = mix(lumThreshold, lumThreshold + 0.22, 1.0 - nearSunSample);
    float highlight = smoothstep(adaptiveThreshold, adaptiveThreshold + lumSoft, lum);
    highlight *= sunSourceWeight;

    float coreMask = smoothstep(sunCore * 0.3, sunCore * 1.35, sampleDist);
    float decay = pow(decayRate, t * float(uSampleCount));

    exposure += sampleColor * highlight * coreMask * decay;
  }

  float shaftMix = mix(0.25, 0.85, uLength);
  vec3 scatter =
    exposure * uRayColor * uStrength * shaftMask * shaftMix * scatterScale * uInView;
  vec3 coronaColor =
    uRayColor * corona * uStrength * mix(0.06, 0.14, uSoftness) * uInView;

  vec3 rays = scatter + coronaColor;
  rays = rays / (1.0 + rays * 1.75);
  rays = min(rays, vec3(0.22 * uStrength + 0.04));

  gl_FragColor = vec4(base.rgb + rays, base.a);
}
`;

export const GodRaysShader = {
  defines: {
    DEPTH_PACKING: 1,
    PERSPECTIVE_CAMERA: 1,
  },
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uLightPosition: { value: new THREE.Vector2(0.5, 0.5) },
    uRayColor: { value: new THREE.Vector3(1, 0.93, 0.78) },
    uSunWorldPosition: { value: new THREE.Vector3() },
    uStrength: { value: 0.25 },
    uLength: { value: 0.45 },
    uSoftness: { value: 0.55 },
    uThreshold: { value: 0.52 },
    uInView: { value: 0 },
    uSunOccluded: { value: 1 },
    uStepScale: { value: 0.86 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uSampleCount: { value: 32 },
    uOcclusionSteps: { value: 12 },
    uNearClip: { value: 0.1 },
    uFarClip: { value: 5000 },
    uDepthBias: { value: 0.025 },
    uProjectionMatrix: { value: new THREE.Matrix4() },
    uInverseProjectionMatrix: { value: new THREE.Matrix4() },
    uViewMatrix: { value: new THREE.Matrix4() },
  },
  vertexShader,
  fragmentShader,
};

/**
 * World-space anchor for the virtual sun — matches LensFlareEffect rotation/height.
 * @param {number} rotationDeg
 * @param {number} heightDeg
 * @param {number} [distance]
 * @param {THREE.Vector3} [target]
 */
export function computeSunAnchorWorld(
  rotationDeg,
  heightDeg,
  distance = SUN_DISTANCE,
  target = new THREE.Vector3(),
) {
  const azimuthRad = THREE.MathUtils.degToRad(rotationDeg ?? 0);
  const elevationRad = THREE.MathUtils.degToRad(
    THREE.MathUtils.clamp(heightDeg ?? 0, 0, 90),
  );
  const horizontalRadius = Math.max(0.001, Math.cos(elevationRad)) * distance;
  const y = Math.sin(elevationRad) * distance;

  target.set(0, y, -horizontalRadius);
  target.applyAxisAngle(yAxis, azimuthRad);
  return target;
}

/**
 * Project the sun anchor to screen UV and update god-rays uniforms.
 * @param {object} uniforms
 * @param {THREE.Camera} camera
 * @param {number} rotationDeg
 * @param {number} heightDeg
 * @param {THREE.Vector3} [scratch]
 */
export function updateGodRaysSunUniforms(
  uniforms,
  camera,
  rotationDeg,
  heightDeg,
  scratch = new THREE.Vector3(),
) {
  computeSunAnchorWorld(rotationDeg, heightDeg, SUN_DISTANCE, scratch);
  uniforms.uSunWorldPosition.value.copy(scratch);

  scratch.project(camera);

  if (
    scratch.z >= 1 ||
    Math.abs(scratch.x) > 1.5 ||
    Math.abs(scratch.y) > 1.5
  ) {
    uniforms.uInView.value = 0;
    return;
  }

  uniforms.uInView.value = 1;
  uniforms.uLightPosition.value.set(
    scratch.x * 0.5 + 0.5,
    scratch.y * 0.5 + 0.5,
  );
}

/**
 * Apply god-rays settings to shader uniforms.
 * @param {object} uniforms
 * @param {object} settings
 * @param {object} [defaults]
 */
export function applyGodRaysSettings(uniforms, settings = {}, defaults = {}) {
  const enabled = settings.enabled ?? defaults.enabled ?? false;
  const strengthRaw =
    typeof settings.strength === 'number' && !Number.isNaN(settings.strength)
      ? settings.strength
      : (defaults.strength ?? 0.25);
  const lengthRaw =
    typeof settings.length === 'number' && !Number.isNaN(settings.length)
      ? settings.length
      : (defaults.length ?? 0.45);
  const softnessRaw =
    typeof settings.softness === 'number' && !Number.isNaN(settings.softness)
      ? settings.softness
      : (defaults.softness ?? 0.55);
  const thresholdRaw =
    typeof settings.threshold === 'number' && !Number.isNaN(settings.threshold)
      ? settings.threshold
      : (defaults.threshold ?? 0.52);
  const quality = settings.quality ?? defaults.quality ?? 'medium';
  const qualityId = normalizeGodRaysQualityId(quality);

  const strength = enabled
    ? THREE.MathUtils.clamp(strengthRaw, 0, 2) * 0.55
    : 0;
  const length = THREE.MathUtils.clamp(lengthRaw, 0, 1);
  const softness = THREE.MathUtils.clamp(softnessRaw, 0, 1);
  const threshold = THREE.MathUtils.clamp(thresholdRaw, 0, 1);

  uniforms.uStrength.value = strength;
  uniforms.uLength.value = length;
  uniforms.uSoftness.value = softness;
  uniforms.uThreshold.value = threshold;
  uniforms.uSampleCount.value = Math.min(
    MAX_SAMPLES,
    resolveGodRaysSampleCount(length, quality),
  );
  uniforms.uStepScale.value =
    resolveGodRaysQualityTier(quality).stepScale ?? 0.86;
  uniforms.uOcclusionSteps.value =
    OCCLUSION_STEPS_BY_QUALITY[qualityId] ??
    OCCLUSION_STEPS_BY_QUALITY.medium;

  const colorHex = settings.color ?? defaults.color ?? '#ffe8c4';
  try {
    const color = new THREE.Color(colorHex);
    uniforms.uRayColor.value.set(color.r, color.g, color.b);
  } catch {
    // keep previous color
  }
}
