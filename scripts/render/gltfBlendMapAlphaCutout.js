/**
 * glTF BLEND + baseColorTexture often exports as transparent with depthWrite off even when
 * the map alpha is a hard cutout (atlas padding, decals, car interiors). Promote those to
 * alphaTest so depth writes — without touching maps that use soft gradients (hair, fur).
 */

/** alphaTest threshold — matches emissive HUD cutout path in MaterialController. */
export const GLTF_BLEND_MAP_CUTOUT_ALPHA_TEST = 0.02;

/** Fraction of mid-range alpha samples above which we keep true BLEND (soft gradients). */
export const GLTF_BLEND_MAP_SOFT_ALPHA_FRACTION = 0.08;

const ALPHA_LOW = 0.05;
const ALPHA_HIGH = 0.95;
const DEFAULT_SAMPLE_GRID = 64;

/**
 * @param {Iterable<number>} samples — normalized alpha in [0, 1]
 * @returns {'cutout' | 'soft' | 'unknown'}
 */
export function classifyBlendMapAlphaSamples(samples) {
  let count = 0;
  let mid = 0;
  for (const raw of samples) {
    const a = Number(raw);
    if (!Number.isFinite(a)) continue;
    count += 1;
    if (a > ALPHA_LOW && a < ALPHA_HIGH) mid += 1;
  }
  if (count === 0) return 'unknown';
  return mid / count <= GLTF_BLEND_MAP_SOFT_ALPHA_FRACTION ? 'cutout' : 'soft';
}

/**
 * @param {Uint8ClampedArray | Uint8Array | number[]} channel
 * @param {number} width
 * @param {number} height
 * @param {number} [channels] — 4 for RGBA, 1 for alpha-only; inferred when omitted
 * @param {number} [gridSize]
 * @returns {number[]}
 */
export function sampleRasterAlphaNormalized(channel, width, height, channels, gridSize = DEFAULT_SAMPLE_GRID) {
  if (!channel?.length || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return [];
  }
  const pixelCount = width * height;
  const ch =
    Number.isFinite(channels) && channels > 0
      ? channels
      : Math.max(1, Math.floor(channel.length / pixelCount));
  if (ch < 1 || channel.length < pixelCount * ch) return [];

  const samples = [];
  for (let gy = 0; gy < gridSize; gy += 1) {
    for (let gx = 0; gx < gridSize; gx += 1) {
      const px = Math.min(width - 1, Math.floor((gx / gridSize) * width));
      const py = Math.min(height - 1, Math.floor((gy / gridSize) * height));
      const idx = (py * width + px) * ch;
      const alpha = ch >= 4 ? channel[idx + 3] : channel[idx];
      samples.push(alpha / 255);
    }
  }

  return samples;
}

/**
 * Read alpha from a loaded Three.js map image (browser). Returns null when pixels are unavailable.
 * @param {unknown} image
 * @param {number} [gridSize]
 * @returns {number[] | null}
 */
export function sampleImageAlphaNormalized(image, gridSize = DEFAULT_SAMPLE_GRID) {
  if (!image || typeof image !== 'object') return null;

  const data = image.data;
  const width = image.width;
  const height = image.height;
  if (data && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    const channels = Math.max(1, Math.floor(data.length / (width * height)));
    return sampleRasterAlphaNormalized(data, width, height, channels, gridSize);
  }

  if (typeof document === 'undefined') return null;

  const w = image.naturalWidth || image.videoWidth || image.width;
  const h = image.naturalHeight || image.videoHeight || image.height;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  if (image.complete === false) return null;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  try {
    ctx.drawImage(image, 0, 0, w, h);
    const pixels = ctx.getImageData(0, 0, w, h).data;
    return sampleRasterAlphaNormalized(pixels, w, h, 4, gridSize);
  } catch {
    return null;
  }
}

/**
 * @param {import('three').Texture | null | undefined} texture
 * @returns {'cutout' | 'soft' | 'unknown'}
 */
export function resolveBlendMapAlphaProfile(texture) {
  if (!texture?.isTexture) return 'unknown';
  const cached = texture.userData?.orbyBlendMapAlphaProfile;
  if (cached === 'cutout' || cached === 'soft' || cached === 'unknown') return cached;

  const samples = sampleImageAlphaNormalized(texture.image);
  const profile = classifyBlendMapAlphaSamples(samples ?? []);
  texture.userData.orbyBlendMapAlphaProfile = profile;
  return profile;
}

/**
 * @param {import('three').Material | null | undefined} material
 * @param {'cutout' | 'soft' | 'unknown'} profile
 * @param {{ fullOpacityThreshold?: number, alphaMode?: string | null }} [opts]
 */
export function shouldPromoteBlendMapToAlphaCutout(material, profile, opts = {}) {
  if (!material) return false;
  if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) return false;
  if (material.userData?.orbySkipBlendMitigation) return false;
  if (material.userData?.orbyEmissiveBlend) return false;
  if (!material.transparent) return false;
  if (!material.map?.isTexture) return false;
  if (material.alphaMap) return false;
  if (material.alphaTest > 0) return false;

  const threshold = opts.fullOpacityThreshold ?? 0.989;
  const opacity = Number.isFinite(material.opacity) ? material.opacity : 1;
  if (opacity < threshold) return false;

  const alphaMode = opts.alphaMode ?? material.userData?.alphaMode ?? null;
  if (alphaMode === 'MASK') return false;
  if (profile !== 'cutout') return false;

  return true;
}

/**
 * @param {import('three').Material} material
 * @param {number} [alphaTest]
 */
export function applyBlendMapAlphaCutout(material, alphaTest = GLTF_BLEND_MAP_CUTOUT_ALPHA_TEST) {
  material.alphaTest = alphaTest;
  material.transparent = false;
  material.opacity = 1;
  material.depthWrite = true;
  if ('alphaHash' in material) material.alphaHash = false;
  material.userData.orbyBlendMitigation = 'alphaTest';
  material.needsUpdate = true;
}

/**
 * Clear cached alpha profile so a later retry can re-sample (e.g. after image load).
 * @param {import('three').Material} material
 */
export function clearBlendMapAlphaProfileCache(material) {
  if (material?.userData) delete material.userData.orbyBlendMapAlphaProfile;
  const tex = material?.map;
  if (tex?.userData) delete tex.userData.orbyBlendMapAlphaProfile;
}

/**
 * @param {import('three').Material} material
 * @returns {boolean}
 */
export function isBlendMapAlphaCutoutRetryCandidate(material) {
  if (!material?.map?.isTexture) return false;
  if (!material.transparent) return false;
  const opacity = Number.isFinite(material.opacity) ? material.opacity : 1;
  if (opacity < 0.989) return false;
  const alphaMode = material.userData?.alphaMode;
  if (alphaMode === 'MASK') return false;
  if (material.userData?.orbySkipBlendMitigation) return false;
  if (material.userData?.orbyEmissiveBlend) return false;
  if (material.alphaMap || material.alphaTest > 0) return false;
  return resolveBlendMapAlphaProfile(material.map) === 'unknown';
}

/**
 * Retry alpha profiling when the map image was not readable at import time.
 * @param {import('three').Material} material
 * @param {() => void} onReady
 */
export function scheduleBlendMapAlphaCutoutRetry(material, onReady) {
  if (!material?.map?.isTexture || typeof onReady !== 'function') return;
  const tex = material.map;
  if (tex.userData?.orbyBlendCutoutRetryHooked) return;
  tex.userData.orbyBlendCutoutRetryHooked = true;

  const retry = () => {
    clearBlendMapAlphaProfileCache(material);
    onReady();
  };

  const image = tex.image;
  if (image && typeof image.addEventListener === 'function') {
    if (image.complete) {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(retry);
      else retry();
    } else {
      image.addEventListener('load', retry, { once: true });
    }
    return;
  }

  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(retry);
  else retry();
}
