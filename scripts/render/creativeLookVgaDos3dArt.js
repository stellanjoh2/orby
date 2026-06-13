import * as THREE from 'three';

/**
 * MCGA/VGA 256-color palette — warm 16-step grey ramp, muted 6×6×6 DAC cube,
 * and industrial accent slots (Descent-era tunnel shooters).
 * @returns {Array<[number, number, number]>}
 */
export function buildVgaDosPaletteRgb() {
  const palette = [];
  for (let i = 0; i < 16; i += 1) {
    const t = i / 15;
    palette.push([
      0.04 + t * 0.88,
      0.035 + t * 0.82,
      0.03 + t * 0.76,
    ]);
  }
  const levels = [0, 0.22, 0.42, 0.58, 0.76, 1.0];
  for (let ri = 0; ri < 6; ri += 1) {
    for (let gi = 0; gi < 6; gi += 1) {
      for (let bi = 0; bi < 6; bi += 1) {
        palette.push([
          levels[ri] * 0.92,
          levels[gi] * 0.9,
          levels[bi] * 0.88,
        ]);
      }
    }
  }
  const accents = [
    [0.0, 0.55, 0.65],
    [0.0, 0.72, 0.82],
    [0.2, 0.85, 0.95],
    [0.55, 0.28, 0.12],
    [0.72, 0.38, 0.18],
    [0.85, 0.48, 0.22],
    [0.65, 0.42, 0.22],
    [0.48, 0.35, 0.25],
    [0.35, 0.28, 0.22],
    [0.82, 0.22, 0.12],
    [0.95, 0.35, 0.15],
    [0.72, 0.15, 0.08],
    [0.12, 0.18, 0.28],
    [0.18, 0.24, 0.38],
    [0.28, 0.35, 0.48],
    [0.55, 0.65, 0.72],
    [0.68, 0.75, 0.82],
    [0.82, 0.88, 0.92],
    [0.35, 0.55, 0.28],
    [0.22, 0.42, 0.18],
    [0.45, 0.65, 0.35],
    [0.55, 0.12, 0.55],
    [0.72, 0.22, 0.72],
    [0.85, 0.42, 0.85],
  ];
  for (const accent of accents) {
    if (palette.length < 256) palette.push(accent);
  }
  while (palette.length < 256) palette.push([0, 0, 0]);
  return palette.slice(0, 256);
}

export const VGA_DOS_PALETTE_RGB = buildVgaDosPaletteRgb();
export const VGA_DOS_PALETTE_COUNT = VGA_DOS_PALETTE_RGB.length;

let _sharedPaletteTexture = null;

/** Shared palette texture for all VGA/DOS 3D materials. @returns {THREE.DataTexture} */
export function getVgaDosPaletteTexture() {
  if (!_sharedPaletteTexture) {
    _sharedPaletteTexture = createVgaDosPaletteTexture();
  }
  return _sharedPaletteTexture;
}

/** @returns {THREE.DataTexture} */
export function createVgaDosPaletteTexture() {
  const data = new Uint8Array(VGA_DOS_PALETTE_COUNT * 4);
  for (let i = 0; i < VGA_DOS_PALETTE_COUNT; i += 1) {
    const [r, g, b] = VGA_DOS_PALETTE_RGB[i];
    data[i * 4] = Math.round(r * 255);
    data[i * 4 + 1] = Math.round(g * 255);
    data[i * 4 + 2] = Math.round(b * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, VGA_DOS_PALETTE_COUNT, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Mesh shader — affine UVs, flat DOS lighting, 256-color palette snap (no hardware dither).
 */
export const VGA_DOS_3D_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec3 vTexAffine;
uniform vec3 uLightDir;
uniform vec3 uTint;
uniform sampler2D uMap;
uniform sampler2D uPalette;
uniform float uHasMap;
uniform float uTexRes;
uniform float uPaletteCount;
uniform float uLightScale;
uniform float uAmbientFloor;
uniform float uIntensity;
uniform float uOpacity;

const vec3 VGA_LUMA = vec3(0.2126, 0.7152, 0.0722);
const int VGA_PAL_MAX = 256;

vec3 vgaPalColor(int idx) {
  float u = (float(idx) + 0.5) / uPaletteCount;
  return texture2D(uPalette, vec2(u, 0.5)).rgb;
}

float vgaPalLuma(vec3 c) {
  return dot(c, VGA_LUMA);
}

vec3 quantizeVgaDos(vec3 rgb) {
  int bestIdx = 0;
  float bestScore = 1e6;
  for (int i = 0; i < VGA_PAL_MAX; i++) {
    vec3 pal = vgaPalColor(i);
    float lumDiff = abs(vgaPalLuma(pal) - vgaPalLuma(rgb));
    float colDist = distance(rgb, pal);
    float score = lumDiff * 0.42 + colDist * 0.58;
    if (score < bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return vgaPalColor(bestIdx);
}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uLightDir);
  float ndl = max(dot(N, L), 0.0);
  float crush = clamp(uIntensity, 0.0, 2.0);
  float crushT = clamp((crush - 1.0) / 1.0, 0.0, 1.0);
  float bands = mix(8.0, 5.0, crushT);
  float stepped = floor(ndl * bands) / max(bands - 1.0, 1.0);
  stepped = clamp(stepped, 0.0, 1.0);

  vec3 baseCol = clamp(uTint, vec3(0.0), vec3(1.0));
  float mapAlpha = 1.0;
  if (uHasMap > 0.5) {
    vec2 uvAff = vTexAffine.xy / max(vTexAffine.z, 1e-5);
    float tr = max(uTexRes, 4.0);
    uvAff = (floor(uvAff * tr) + 0.5) / tr;
    vec4 mapSample = texture2D(uMap, uvAff);
    baseCol = mapSample.rgb;
    mapAlpha = mapSample.a;
  }

  vec3 sourceCol = baseCol;
  float shade = uAmbientFloor + (1.0 - uAmbientFloor) * stepped * uLightScale;

  float srcLum = max(dot(sourceCol, VGA_LUMA), 1e-4);
  float litLum = srcLum * shade;
  vec3 col = sourceCol * (litLum / srcLum);

  vec3 V = normalize(cameraPosition - vWorldPosition);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += rim * mix(vec3(0.06, 0.07, 0.09), sourceCol * 0.28, 0.5) * 0.22;

  col = quantizeVgaDos(clamp(col, vec3(0.0), vec3(1.0)));

  gl_FragColor = vec4(col, uOpacity * mapAlpha);
}
`;
