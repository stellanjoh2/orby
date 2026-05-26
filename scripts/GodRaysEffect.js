import * as THREE from 'three';
import { KernelSize } from 'postprocessing';
import { resolveGodRaysQualityTier } from './constants.js';

const yAxis = new THREE.Vector3(0, 1, 0);
export const SUN_DISTANCE = 40;
/** Base sphere radius before {@link applyGodRaysLightScale}. */
export const GOD_RAYS_LIGHT_RADIUS = 3.5;
export const GOD_RAYS_LIGHT_SCALE_MIN = 0.08;
export const GOD_RAYS_LIGHT_SCALE_MAX = 1.25;

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

export function syncGodRaysLightSource(
  lightSource,
  rotationDeg,
  heightDeg,
  colorHex = '#ffe8c4',
  scratch = new THREE.Vector3(),
) {
  if (!lightSource) return scratch;

  computeSunAnchorWorld(rotationDeg, heightDeg, SUN_DISTANCE, scratch);
  lightSource.position.copy(scratch);
  lightSource.updateMatrixWorld(true, false);

  if (lightSource.material?.color && colorHex) {
    try {
      lightSource.material.color.set(colorHex);
    } catch {
      // keep previous
    }
  }

  return scratch;
}

/** Uniform scale on the virtual sun mesh (1 = base {@link GOD_RAYS_LIGHT_RADIUS}). */
export function applyGodRaysLightScale(lightSource, lightScale = 1) {
  if (!lightSource) return;
  const uniform = THREE.MathUtils.clamp(
    lightScale,
    GOD_RAYS_LIGHT_SCALE_MIN,
    GOD_RAYS_LIGHT_SCALE_MAX,
  );
  lightSource.scale.setScalar(uniform);
  lightSource.updateMatrixWorld(true, false);
}

/**
 * Read pmndrs god-rays fields from state (supports legacy strength/length/softness keys).
 */
export function normalizeGodRaysState(settings = {}, defaults = {}) {
  const d = { ...defaults, ...settings };
  const legacyStrength =
    typeof d.strength === 'number' && !Number.isNaN(d.strength) ? d.strength : null;
  const legacyLength =
    typeof d.length === 'number' && !Number.isNaN(d.length) ? d.length : null;
  const legacySoftness =
    typeof d.softness === 'number' && !Number.isNaN(d.softness) ? d.softness : null;

  const opacity =
    typeof d.opacity === 'number'
      ? d.opacity
      : legacyStrength != null
        ? THREE.MathUtils.clamp(legacyStrength * 0.5, 0, 1)
        : 1;
  const density =
    typeof d.density === 'number'
      ? d.density
      : legacyLength != null
        ? THREE.MathUtils.lerp(0.88, 1.08, THREE.MathUtils.clamp(legacyLength, 0, 1))
        : 0.96;
  const decay =
    typeof d.decay === 'number'
      ? d.decay
      : legacySoftness != null
        ? THREE.MathUtils.lerp(0.99, 0.86, THREE.MathUtils.clamp(legacySoftness, 0, 1))
        : 0.92;
  const weight = typeof d.weight === 'number' ? d.weight : 0.4;
  const exposure = typeof d.exposure === 'number' ? d.exposure : 0.6;
  const clampMax = typeof d.clampMax === 'number' ? d.clampMax : 1;
  const blur = d.blur ?? true;
  const quality = d.quality ?? 'medium';
  // Missing key → 1 (legacy full disc); reset / new scenes set lightScale explicitly.
  const lightScale =
    typeof settings.lightScale === 'number' && !Number.isNaN(settings.lightScale)
      ? settings.lightScale
      : 1;

  const tier = resolveGodRaysQualityTier(quality);
  const samples =
    typeof d.samples === 'number'
      ? Math.round(d.samples)
      : tier.maxSamples ?? 60;

  return {
    enabled: !!d.enabled,
    color: d.color ?? '#ffe8c4',
    opacity: THREE.MathUtils.clamp(opacity, 0, 1),
    density: THREE.MathUtils.clamp(density, 0, 1.2),
    decay: THREE.MathUtils.clamp(decay, 0, 1),
    weight: THREE.MathUtils.clamp(weight, 0, 1),
    exposure: THREE.MathUtils.clamp(exposure, 0, 2),
    clampMax: THREE.MathUtils.clamp(clampMax, 0, 1),
    samples: THREE.MathUtils.clamp(samples, 15, 120),
    blur: !!blur,
    quality,
    lightScale: THREE.MathUtils.clamp(
      lightScale,
      GOD_RAYS_LIGHT_SCALE_MIN,
      GOD_RAYS_LIGHT_SCALE_MAX,
    ),
    resolutionScale: tier.resolutionScale ?? 0.5,
  };
}

/** Canonical god-rays parameter fields for section reset dirty checks (not the master toggle). */
export function godRaysStateForResetCompare(settings = {}, defaults = {}) {
  const p = normalizeGodRaysState(settings, defaults);
  return {
    color: p.color,
    lightScale: p.lightScale,
    opacity: p.opacity,
    density: p.density,
    decay: p.decay,
    weight: p.weight,
    exposure: p.exposure,
    clampMax: p.clampMax,
    blur: !!p.blur,
    quality: p.quality,
  };
}

/** Default god-rays parameters with the current on/off state preserved (section undo). */
export function godRaysStateAfterSectionReset(current = {}, defaults = {}) {
  const reset = normalizeGodRaysState(defaults, defaults);
  const cur = normalizeGodRaysState(current, defaults);
  return {
    ...reset,
    enabled: !!cur.enabled,
  };
}

/**
 * Push normalized god-rays params to the scene (studio event bus).
 * @param {{ emit: (name: string, value: unknown) => void }} eventBus
 */
export function emitGodRaysStudioEvents(eventBus, godRays = {}, defaults = {}) {
  const p = normalizeGodRaysState(godRays, defaults);
  eventBus.emit('studio:god-rays-enabled', p.enabled);
  eventBus.emit('studio:god-rays-color', p.color);
  eventBus.emit('studio:god-rays-light-scale', p.lightScale);
  eventBus.emit('studio:god-rays-opacity', p.opacity);
  eventBus.emit('studio:god-rays-density', p.density);
  eventBus.emit('studio:god-rays-decay', p.decay);
  eventBus.emit('studio:god-rays-weight', p.weight);
  eventBus.emit('studio:god-rays-exposure', p.exposure);
  eventBus.emit('studio:god-rays-clamp-max', p.clampMax);
  eventBus.emit('studio:god-rays-blur', p.blur);
  eventBus.emit('studio:god-rays-quality', p.quality);
}

export function applyGodRaysSettings(effect, settings = {}, defaults = {}, pass = null) {
  if (!effect) return;

  const p = normalizeGodRaysState(settings, defaults);
  const material = effect.godRaysMaterial;

  const nextSamples = p.samples;
  if (material.samples !== nextSamples) {
    material.samples = nextSamples;
    pass?.recompile?.();
  }

  material.density = p.density;
  material.decay = p.decay;
  material.weight = p.weight;
  material.exposure = p.exposure;
  material.maxIntensity = p.clampMax;

  effect.blendMode.setOpacity(p.opacity);
  effect.resolution.scale = p.resolutionScale;
  effect.blurPass.enabled = p.blur;
  effect.blurPass.kernelSize = KernelSize.SMALL;

  const lightSource = pass?.lightSource ?? effect.lightSource;
  applyGodRaysLightScale(lightSource, p.lightScale);

  if (lightSource?.material?.color && p.color) {
    try {
      lightSource.material.color.set(p.color);
    } catch {
      // keep previous
    }
  }
}
