// Shader registry - exports all shaders
// For now, we keep shaders as template strings
// In the future, these can be loaded from .glsl files via a bundler

import * as THREE from 'three';

// Note: In a production setup with a bundler, these would be imported from .glsl files
// For now, we keep them inline but organized here

const bloomTintVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const bloomTintFragment = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec3 tint;
uniform float strength;

void main() {
  vec4 base = texture2D(tDiffuse, vUv);
  float luminance = dot(base.rgb, vec3(0.299, 0.587, 0.114));
  float mask = smoothstep(0.6, 1.2, luminance);
  vec3 colorized = base.rgb + tint * mask * strength;
  gl_FragColor = vec4(colorized, base.a);
}
`;

/**
 * Oriented gaussian streak on bright areas (runs after bloom + bloom tint).
 * `streakDir` is unit direction in UV space; (1,0) = horizontal (classic anamorphic).
 * `sampleRadius` is baked into the shader source so the blur loop is compile-time bounded.
 * @param {number} sampleRadius
 */
export function buildAnamorphicBloomShader(sampleRadius) {
  const R = Math.max(1, Math.min(64, Math.floor(sampleRadius)));
  const fragmentShader = `
#define SAMPLE_RADIUS ${R}
#define STREAK_LENGTH_SCALE 6.0
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 resolution;
uniform vec2 streakDir;
uniform float threshold;
uniform float soften;
uniform float strength;
uniform float spread;
uniform vec3 streakTint;

float linLum(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec4 base = texture2D(tDiffuse, vUv);
  vec2 px = vec2(1.0 / max(resolution.x, 1.0), 1.0 / max(resolution.y, 1.0));
  vec2 duv = vec2(streakDir.x * px.x, streakDir.y * px.y);
  // Without STREAK_LENGTH_SCALE, spread×radius only spans ~10–20px — flat, not cinematic.
  float sigma = float(SAMPLE_RADIUS) * 0.58 + 1.0e-4;
  float wsum = 0.0;
  float maskBlur = 0.0;
  for (int i = -SAMPLE_RADIUS; i <= SAMPLE_RADIUS; i++) {
    float fi = float(i);
    float w = exp(-(fi * fi) / (2.0 * sigma * sigma));
    vec2 off = duv * (fi * spread * STREAK_LENGTH_SCALE);
    vec4 s = texture2D(tDiffuse, vUv + off);
    float lu = linLum(s.rgb);
    float h = smoothstep(threshold - soften, threshold + soften, lu);
    maskBlur += h * w;
    wsum += w;
  }
  maskBlur /= max(wsum, 1.0e-5);
  vec3 streak = streakTint * maskBlur * strength;
  gl_FragColor = vec4(base.rgb + streak, base.a);
}
`;

  return {
    uniforms: {
      tDiffuse: { value: null },
      resolution: { value: new THREE.Vector2(1, 1) },
      streakDir: { value: new THREE.Vector2(1, 0) },
      threshold: { value: 0.7 },
      soften: { value: 0.12 },
      strength: { value: 1.0 },
      spread: { value: 0.2 },
      streakTint: { value: new THREE.Color('#7ec8ff') },
    },
    vertexShader: bloomTintVertex,
    fragmentShader,
  };
}

/**
 * Bloom tint then anamorphic streak (same order as the legacy two-pass chain).
 * Anamorphic taps apply bloom tint per sample so behavior matches tint → streak passes.
 * @param {number} sampleRadius
 */
export function buildBloomCompositeShader(sampleRadius) {
  const R = Math.max(1, Math.min(64, Math.floor(sampleRadius)));
  const fragmentShader = `
#define SAMPLE_RADIUS ${R}
#define STREAK_LENGTH_SCALE 6.0
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec3 bloomTint;
uniform float bloomTintStrength;
uniform vec2 resolution;
uniform vec2 streakDir;
uniform float threshold;
uniform float soften;
uniform float anamorphicStrength;
uniform float spread;
uniform vec3 streakTint;

float linLum(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 applyBloomTint(vec3 rgb) {
  if (bloomTintStrength < 0.0001) {
    return rgb;
  }
  float luminance = dot(rgb, vec3(0.299, 0.587, 0.114));
  float mask = smoothstep(0.6, 1.2, luminance);
  return rgb + bloomTint * mask * bloomTintStrength;
}

void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  vec3 rgb = applyBloomTint(color.rgb);

  if (anamorphicStrength < 0.0001) {
    gl_FragColor = vec4(rgb, color.a);
    return;
  }

  vec2 px = vec2(1.0 / max(resolution.x, 1.0), 1.0 / max(resolution.y, 1.0));
  vec2 duv = vec2(streakDir.x * px.x, streakDir.y * px.y);
  float sigma = float(SAMPLE_RADIUS) * 0.58 + 1.0e-4;
  float wsum = 0.0;
  float maskBlur = 0.0;
  for (int i = -SAMPLE_RADIUS; i <= SAMPLE_RADIUS; i++) {
    float fi = float(i);
    float w = exp(-(fi * fi) / (2.0 * sigma * sigma));
    vec2 off = duv * (fi * spread * STREAK_LENGTH_SCALE);
    vec3 s = applyBloomTint(texture2D(tDiffuse, vUv + off).rgb);
    float lu = linLum(s);
    float h = smoothstep(threshold - soften, threshold + soften, lu);
    maskBlur += h * w;
    wsum += w;
  }
  maskBlur /= max(wsum, 1.0e-5);
  vec3 streak = streakTint * maskBlur * anamorphicStrength;
  gl_FragColor = vec4(rgb + streak, color.a);
}
`;

  return {
    uniforms: {
      tDiffuse: { value: null },
      bloomTint: { value: new THREE.Color('#ffe9cc') },
      bloomTintStrength: { value: 0.0 },
      resolution: { value: new THREE.Vector2(1, 1) },
      streakDir: { value: new THREE.Vector2(1, 0) },
      threshold: { value: 0.7 },
      soften: { value: 0.12 },
      anamorphicStrength: { value: 0.0 },
      spread: { value: 0.2 },
      streakTint: { value: new THREE.Color('#7ec8ff') },
    },
    vertexShader: bloomTintVertex,
    fragmentShader,
  };
}

const grainTintVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const grainTintFragment = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float time;
uniform float intensity;
uniform vec3 tint;

float rand(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec4 base = texture2D(tDiffuse, vUv);
  
  if (intensity < 0.0001) {
    gl_FragColor = base;
    return;
  }
  
  vec2 grainUv = vUv * 800.0 + time * 0.05;
  float noise = rand(grainUv) * 2.0 - 1.0;
  
  float luminance = dot(base.rgb, vec3(0.299, 0.587, 0.114));
  float grainAmount = noise * intensity * 0.5;
  float grainBlend = mix(0.3, 1.0, smoothstep(0.0, 0.5, luminance));
  vec3 grain = tint * grainAmount * grainBlend;
  vec3 result = base.rgb + grain;
  
  gl_FragColor = vec4(result, base.a);
}
`;

const exposureVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const exposureFragment = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float exposure;

void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  color.rgb *= exposure;
  gl_FragColor = color;
}
`;

const toneMappingVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const toneMappingFragment = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float toneMappingType;
uniform float vignetteIntensity;
uniform vec3 vignetteColor;

vec3 ACESFilmicToneMapping(vec3 color) {
  // Reduced scaling to allow exposure to have more visible effect
  color *= 0.8;
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
}

vec3 ReinhardToneMapping(vec3 color) {
  return color / (1.0 + color);
}

void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  
  if (toneMappingType < 2.0) {
    gl_FragColor = color;
  } else if (toneMappingType < 3.5) {
    gl_FragColor = vec4(ReinhardToneMapping(color.rgb), color.a);
  } else {
    gl_FragColor = vec4(ACESFilmicToneMapping(color.rgb), color.a);
  }
  
  // Apply vignette
  if (vignetteIntensity > 0.0001) {
    vec2 center = vec2(0.5, 0.5);
    float dist = distance(vUv, center);
    
    // As intensity increases, make the falloff steeper and start earlier
    // This makes more of the image darker, not just the edges
    float start = mix(0.3, 0.0, vignetteIntensity); // Start darkening closer to center at higher intensity
    float end = mix(1.0, 0.6, vignetteIntensity * 0.5); // End closer to center for steeper falloff
    float vignetteMask = smoothstep(start, end, dist);
    
    // Use power curve to make falloff steeper at higher intensities
    float power = mix(1.0, 3.0, vignetteIntensity);
    vignetteMask = pow(vignetteMask, power);
    
    // Blend between original color and vignette color based on mask
    float vignetteStrength = vignetteMask * vignetteIntensity;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vignetteColor, vignetteStrength);
  }
}
`;

const rotateEquirectVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const rotateEquirectFragment = `
varying vec2 vUv;
uniform sampler2D tEquirect;
uniform float rotation;
uniform vec2 texelSize;

void main() {
  // Snap output columns to texel centers so the u=0 / u=1 meridian stays aligned.
  vec2 uv = vUv;
  if (texelSize.x > 0.0) {
    uv.x = (floor(uv.x / texelSize.x) + 0.5) * texelSize.x;
  }
  uv.x = fract(uv.x + rotation);
  gl_FragColor = texture2D(tEquirect, uv);
}
`;

export const BloomTintShader = {
  uniforms: {
    tDiffuse: { value: null },
    tint: { value: new THREE.Color('#ffe9cc') },
    strength: { value: 0.25 },
  },
  vertexShader: bloomTintVertex,
  fragmentShader: bloomTintFragment,
};

export const GrainTintShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    intensity: { value: 0.2 },
    tint: { value: new THREE.Color('#ffffff') },
  },
  vertexShader: grainTintVertex,
  fragmentShader: grainTintFragment,
};

export const ExposureShader = {
  uniforms: {
    tDiffuse: { value: null },
    exposure: { value: 1 },
  },
  vertexShader: exposureVertex,
  fragmentShader: exposureFragment,
};

export const ToneMappingShader = {
  uniforms: {
    tDiffuse: { value: null },
    toneMappingType: { value: 4 },
    vignetteIntensity: { value: 0.0 },
    vignetteColor: { value: new THREE.Color('#080808') },
  },
  vertexShader: toneMappingVertex,
  fragmentShader: toneMappingFragment,
};

export const RotateEquirectShader = {
  uniforms: {
    tEquirect: { value: null },
    rotation: { value: 0.0 },
    texelSize: { value: new THREE.Vector2(0, 0) },
  },
  vertexShader: rotateEquirectVertex,
  fragmentShader: rotateEquirectFragment,
};

const colorAdjustVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const colorAdjustFragment = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float contrast;
uniform float hue;
uniform float saturation;
uniform float temperature;
uniform float tint;
uniform float highlights;
uniform float shadows;
uniform float clarity;
uniform float fade;
uniform float sharpness;
uniform vec2 resolution;
uniform float bypass;
uniform sampler2D toneCurveLut; // 256×1 RGBA, R = output luma; CPU-baked Catmull–Rom spline
uniform float toneHdrTailSlope; // dy/dx at x=1 for HDR extrapolation
uniform float toneCurveIdentity;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const float CONTRAST_PIVOT = 0.18;
// Without a floor, amount 0 maps every pixel to the pivot (flat gray).
const float CONTRAST_AMOUNT_MIN = 0.18;
const float EPSILON = 1e-5;

vec3 applyContrast(vec3 color, float amount) {
  float a = max(amount, CONTRAST_AMOUNT_MIN);
  if (abs(a - 1.0) < 0.0001) {
    return color;
  }
  return (color - vec3(CONTRAST_PIVOT)) * a + vec3(CONTRAST_PIVOT);
}

vec3 applySaturation(vec3 color, float amount) {
  if (abs(amount - 1.0) < 0.0001) {
    return color;
  }
  float luma = dot(color, LUMA);
  return mix(vec3(luma), color, amount);
}

vec3 applyWhiteBalance(vec3 color, float temperature, float tint) {
  if (abs(temperature) < 0.0001 && abs(tint) < 0.0001) {
    return color;
  }
  float tempOffset = temperature * 0.2;
  float tintOffset = tint * 0.12;
  vec3 tempScale = vec3(
    1.0 + tempOffset,
    1.0,
    1.0 - tempOffset
  );
  vec3 tintScale = vec3(
    1.0 + tintOffset,
    1.0 - tintOffset * 2.0,
    1.0 + tintOffset
  );
  vec3 balance = max(tempScale * tintScale, vec3(0.05));
  vec3 balanced = clamp(color * balance, 0.0, 4.0);
  float srcLuma = dot(color, LUMA);
  float balancedLuma = max(dot(balanced, LUMA), EPSILON);
  float scale = srcLuma / balancedLuma;
  return clamp(balanced * scale, 0.0, 4.0);
}

vec3 applyHue(vec3 color, float hueDegrees) {
  if (abs(hueDegrees) < 0.0001) {
    return color;
  }
  const mat3 RGB_TO_YIQ = mat3(
    0.299, 0.587, 0.114,
    0.596, -0.274, -0.322,
    0.211, -0.523, 0.312
  );
  const mat3 YIQ_TO_RGB = mat3(
    1.0, 0.956, 0.621,
    1.0, -0.272, -0.647,
    1.0, -1.106, 1.703
  );
  vec3 yiq = RGB_TO_YIQ * color;
  float angle = radians(hueDegrees);
  float cosA = cos(angle);
  float sinA = sin(angle);
  mat2 rot = mat2(cosA, -sinA, sinA, cosA);
  yiq.yz = rot * yiq.yz;
  return clamp(YIQ_TO_RGB * yiq, 0.0, 4.0);
}

vec3 applyTonalRanges(
  vec3 color,
  float highlights,
  float shadows
) {
  if (abs(highlights) < 0.0001 && abs(shadows) < 0.0001) {
    return color;
  }
  float luma = dot(color, LUMA);
  float highlightMask = smoothstep(0.45, 1.0, luma);
  float shadowMask = 1.0 - smoothstep(0.1, 0.8, luma);

  // Scale highlights multiplier: at max (1.0) it's 100% stronger than original (2x)
  float highlightsMultiplier = 0.25 * (1.0 + 1.0 * abs(highlights));
  float highlightDelta = highlights * highlightsMultiplier * highlightMask;
  float shadowDelta = shadows * 0.25 * shadowMask;

  float totalDelta = highlightDelta + shadowDelta;
  float targetLuma = luma + totalDelta;
  float adjustment = targetLuma - luma;
  return color + vec3(adjustment);
}

// Clarity: Midtone contrast enhancement (like Lightroom)
vec3 applyClarity(vec3 color, float amount) {
  if (abs(amount) < 0.0001) {
    return color;
  }
  float luma = dot(color, LUMA);
  // Create a mask that emphasizes midtones (0.2 to 0.8)
  float midtoneMask = smoothstep(0.2, 0.5, luma) * (1.0 - smoothstep(0.5, 0.8, luma));
  // Apply local contrast enhancement to midtones
  float clarityAmount = amount * 0.01; // Scale to reasonable range
  vec3 enhanced = (color - vec3(0.5)) * (1.0 + clarityAmount * midtoneMask) + vec3(0.5);
  return mix(color, enhanced, midtoneMask * 0.5);
}

// Fade: Reduce black point (fade to black, like Darkroom)
vec3 applyFade(vec3 color, float amount) {
  if (abs(amount) < 0.0001) {
    return color;
  }
  // Reduce black point - lift shadows towards gray
  float fadeAmount = amount * 0.01; // Scale to 0-1 range
  return mix(color, vec3(0.5), fadeAmount * (1.0 - dot(color, LUMA)));
}

// Master luminance remapping: baked 256-entry LUT (CPU spline), nearest sample + HDR tail
float sampleToneLut(float x) {
  x = clamp(x, 0.0, 1.0);
  float u = (floor(x * 255.0) + 0.5) / 256.0;
  return texture2D(toneCurveLut, vec2(u, 0.5)).r;
}

vec3 applyLumaToneCurve(vec3 c) {
  if (toneCurveIdentity > 0.5) {
    return c;
  }
  float l = dot(c, LUMA);
  if (l < 1e-5) {
    return c;
  }
  float l2;
  if (l <= 1.0) {
    l2 = sampleToneLut(l);
  } else {
    float y1 = sampleToneLut(1.0);
    float dEnd = max(toneHdrTailSlope, 0.0);
    l2 = y1 + (l - 1.0) * dEnd;
  }
  return clamp(c * (l2 / l), 0.0, 4.0);
}

// Unsharp mask with HDR highlight guard — prevents black "burn" speckles in hot speculars.
vec3 finishUnsharpMask(vec3 center, vec3 blur, float sharpAmount) {
  vec3 sharp = center + (center - blur) * sharpAmount;
  float luma = dot(center, LUMA);
  // When neighbors are hotter than center, unsharp can go negative → max(...,0) burns black.
  float hot = smoothstep(0.65, 1.35, luma);
  vec3 floorRgb = mix(vec3(0.0), center, hot);
  return max(sharp, floorRgb);
}

// Sharpness: Simple unsharp mask
vec3 applySharpness(sampler2D tex, vec2 uv, vec2 res, float amount) {
  if (abs(amount) < 0.0001) {
    return texture2D(tex, uv).rgb;
  }
  // Safety check: if resolution is invalid (too small), skip sharpness
  if (res.x < 2.0 || res.y < 2.0) {
    return texture2D(tex, uv).rgb;
  }
  vec2 pixelSize = 1.0 / res;
  vec3 center = texture2D(tex, uv).rgb;
  
  // Sample neighboring pixels for unsharp mask
  vec3 left = texture2D(tex, uv + vec2(-pixelSize.x, 0.0)).rgb;
  vec3 right = texture2D(tex, uv + vec2(pixelSize.x, 0.0)).rgb;
  vec3 top = texture2D(tex, uv + vec2(0.0, -pixelSize.y)).rgb;
  vec3 bottom = texture2D(tex, uv + vec2(0.0, pixelSize.y)).rgb;
  
  // Calculate blur (average of neighbors)
  vec3 blur = (left + right + top + bottom) * 0.25;
  
  float sharpAmount = amount * 0.01; // Scale to reasonable range
  return finishUnsharpMask(center, blur, sharpAmount);
}

void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  if (bypass > 0.5) {
    gl_FragColor = color;
    return;
  }

  vec3 adjusted = max(color.rgb, vec3(0.0));
  
  // Apply sharpness first (needs original texture sampling before other adjustments)
  // This ensures sharpness operates on the raw input, not processed values
  if (abs(sharpness) > 0.0001) {
    adjusted = applySharpness(tDiffuse, vUv, resolution, sharpness);
  }
  
  // Apply color and tonal adjustments
  adjusted = applyContrast(adjusted, contrast);
  adjusted = applySaturation(adjusted, saturation);
  adjusted = applyHue(adjusted, hue);
  adjusted = applyWhiteBalance(adjusted, temperature, tint);
  adjusted = applyTonalRanges(adjusted, highlights, shadows);
  adjusted = applyClarity(adjusted, clarity);
  adjusted = applyFade(adjusted, fade);
  adjusted = applyLumaToneCurve(adjusted);

  gl_FragColor = vec4(max(adjusted, vec3(0.0)), color.a);
}
`;

export const ColorAdjustShader = {
  uniforms: {
    tDiffuse: { value: null },
    contrast: { value: 1.0 },
    hue: { value: 0.0 },
    saturation: { value: 1.0 },
    temperature: { value: 0.0 },
    tint: { value: 0.0 },
    highlights: { value: 0.0 },
    shadows: { value: 0.0 },
    clarity: { value: 0.0 },
    fade: { value: 0.0 },
    sharpness: { value: 0.0 },
    resolution: { value: new THREE.Vector2(1, 1) },
    bypass: { value: 1.0 },
    toneCurveLut: { value: null },
    toneHdrTailSlope: { value: 1.0 },
    toneCurveIdentity: { value: 1.0 },
  },
  vertexShader: colorAdjustVertex,
  fragmentShader: colorAdjustFragment,
};

const gradingVertex = colorAdjustVertex;

const gradingFragment = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float exposure;
uniform float contrast;
uniform float hue;
uniform float saturation;
uniform float temperature;
uniform float tint;
uniform float highlights;
uniform float shadows;
uniform float clarity;
uniform float fade;
uniform float sharpness;
uniform vec2 resolution;
uniform float bypass;
uniform sampler2D toneCurveLut;
uniform float toneHdrTailSlope;
uniform float toneCurveIdentity;
uniform float toneMappingType;
uniform float vignetteIntensity;
uniform vec3 vignetteColor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const float CONTRAST_PIVOT = 0.18;
const float CONTRAST_AMOUNT_MIN = 0.18;
const float EPSILON = 1e-5;

vec3 applyContrast(vec3 color, float amount) {
  float a = max(amount, CONTRAST_AMOUNT_MIN);
  if (abs(a - 1.0) < 0.0001) {
    return color;
  }
  return (color - vec3(CONTRAST_PIVOT)) * a + vec3(CONTRAST_PIVOT);
}

vec3 applySaturation(vec3 color, float amount) {
  if (abs(amount - 1.0) < 0.0001) {
    return color;
  }
  float luma = dot(color, LUMA);
  return mix(vec3(luma), color, amount);
}

vec3 applyWhiteBalance(vec3 color, float temperature, float tint) {
  if (abs(temperature) < 0.0001 && abs(tint) < 0.0001) {
    return color;
  }
  float tempOffset = temperature * 0.2;
  float tintOffset = tint * 0.12;
  vec3 tempScale = vec3(
    1.0 + tempOffset,
    1.0,
    1.0 - tempOffset
  );
  vec3 tintScale = vec3(
    1.0 + tintOffset,
    1.0 - tintOffset * 2.0,
    1.0 + tintOffset
  );
  vec3 balance = max(tempScale * tintScale, vec3(0.05));
  vec3 balanced = clamp(color * balance, 0.0, 4.0);
  float srcLuma = dot(color, LUMA);
  float balancedLuma = max(dot(balanced, LUMA), EPSILON);
  float scale = srcLuma / balancedLuma;
  return clamp(balanced * scale, 0.0, 4.0);
}

vec3 applyHue(vec3 color, float hueDegrees) {
  if (abs(hueDegrees) < 0.0001) {
    return color;
  }
  const mat3 RGB_TO_YIQ = mat3(
    0.299, 0.587, 0.114,
    0.596, -0.274, -0.322,
    0.211, -0.523, 0.312
  );
  const mat3 YIQ_TO_RGB = mat3(
    1.0, 0.956, 0.621,
    1.0, -0.272, -0.647,
    1.0, -1.106, 1.703
  );
  vec3 yiq = RGB_TO_YIQ * color;
  float angle = radians(hueDegrees);
  float cosA = cos(angle);
  float sinA = sin(angle);
  mat2 rot = mat2(cosA, -sinA, sinA, cosA);
  yiq.yz = rot * yiq.yz;
  return clamp(YIQ_TO_RGB * yiq, 0.0, 4.0);
}

vec3 applyTonalRanges(
  vec3 color,
  float highlights,
  float shadows
) {
  if (abs(highlights) < 0.0001 && abs(shadows) < 0.0001) {
    return color;
  }
  float luma = dot(color, LUMA);
  float highlightMask = smoothstep(0.45, 1.0, luma);
  float shadowMask = 1.0 - smoothstep(0.1, 0.8, luma);
  float highlightsMultiplier = 0.25 * (1.0 + 1.0 * abs(highlights));
  float highlightDelta = highlights * highlightsMultiplier * highlightMask;
  float shadowDelta = shadows * 0.25 * shadowMask;
  float totalDelta = highlightDelta + shadowDelta;
  float targetLuma = luma + totalDelta;
  float adjustment = targetLuma - luma;
  return color + vec3(adjustment);
}

vec3 applyClarity(vec3 color, float amount) {
  if (abs(amount) < 0.0001) {
    return color;
  }
  float luma = dot(color, LUMA);
  float midtoneMask = smoothstep(0.2, 0.5, luma) * (1.0 - smoothstep(0.5, 0.8, luma));
  float clarityAmount = amount * 0.01;
  vec3 enhanced = (color - vec3(0.5)) * (1.0 + clarityAmount * midtoneMask) + vec3(0.5);
  return mix(color, enhanced, midtoneMask * 0.5);
}

vec3 applyFade(vec3 color, float amount) {
  if (abs(amount) < 0.0001) {
    return color;
  }
  float fadeAmount = amount * 0.01;
  return mix(color, vec3(0.5), fadeAmount * (1.0 - dot(color, LUMA)));
}

float sampleToneLut(float x) {
  x = clamp(x, 0.0, 1.0);
  float u = (floor(x * 255.0) + 0.5) / 256.0;
  return texture2D(toneCurveLut, vec2(u, 0.5)).r;
}

vec3 applyLumaToneCurve(vec3 c) {
  if (toneCurveIdentity > 0.5) {
    return c;
  }
  float l = dot(c, LUMA);
  if (l < 1e-5) {
    return c;
  }
  float l2;
  if (l <= 1.0) {
    l2 = sampleToneLut(l);
  } else {
    float y1 = sampleToneLut(1.0);
    float dEnd = max(toneHdrTailSlope, 0.0);
    l2 = y1 + (l - 1.0) * dEnd;
  }
  return clamp(c * (l2 / l), 0.0, 4.0);
}

vec3 finishUnsharpMask(vec3 center, vec3 blur, float sharpAmount) {
  vec3 sharp = center + (center - blur) * sharpAmount;
  float luma = dot(center, LUMA);
  float hot = smoothstep(0.65, 1.35, luma);
  vec3 floorRgb = mix(vec3(0.0), center, hot);
  return max(sharp, floorRgb);
}

vec3 applySharpnessExposed(
  sampler2D tex,
  vec2 uv,
  vec2 res,
  float amount,
  float exposureScale
) {
  if (abs(amount) < 0.0001) {
    return texture2D(tex, uv).rgb * exposureScale;
  }
  if (res.x < 2.0 || res.y < 2.0) {
    return texture2D(tex, uv).rgb * exposureScale;
  }
  vec2 pixelSize = 1.0 / res;
  vec3 center = texture2D(tex, uv).rgb * exposureScale;
  vec3 left = texture2D(tex, uv + vec2(-pixelSize.x, 0.0)).rgb * exposureScale;
  vec3 right = texture2D(tex, uv + vec2(pixelSize.x, 0.0)).rgb * exposureScale;
  vec3 top = texture2D(tex, uv + vec2(0.0, -pixelSize.y)).rgb * exposureScale;
  vec3 bottom = texture2D(tex, uv + vec2(0.0, pixelSize.y)).rgb * exposureScale;
  vec3 blur = (left + right + top + bottom) * 0.25;
  float sharpAmount = amount * 0.01;
  return finishUnsharpMask(center, blur, sharpAmount);
}

vec3 ACESFilmicToneMapping(vec3 color) {
  color *= 0.8;
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
}

vec3 ReinhardToneMapping(vec3 color) {
  return color / (1.0 + color);
}

void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  vec3 rgb = color.rgb * exposure;

  if (bypass <= 0.5) {
    vec3 adjusted = max(rgb, vec3(0.0));
    if (abs(sharpness) > 0.0001) {
      adjusted = applySharpnessExposed(tDiffuse, vUv, resolution, sharpness, exposure);
    }
    adjusted = applyContrast(adjusted, contrast);
    adjusted = applySaturation(adjusted, saturation);
    adjusted = applyHue(adjusted, hue);
    adjusted = applyWhiteBalance(adjusted, temperature, tint);
    adjusted = applyTonalRanges(adjusted, highlights, shadows);
    adjusted = applyClarity(adjusted, clarity);
    adjusted = applyFade(adjusted, fade);
    adjusted = applyLumaToneCurve(adjusted);
    rgb = max(adjusted, vec3(0.0));
  }

  vec4 mapped;
  if (toneMappingType < 2.0) {
    mapped = vec4(rgb, color.a);
  } else if (toneMappingType < 3.5) {
    mapped = vec4(ReinhardToneMapping(rgb), color.a);
  } else {
    mapped = vec4(ACESFilmicToneMapping(rgb), color.a);
  }

  if (vignetteIntensity > 0.0001) {
    vec2 center = vec2(0.5, 0.5);
    float dist = distance(vUv, center);
    float start = mix(0.3, 0.0, vignetteIntensity);
    float end = mix(1.0, 0.6, vignetteIntensity * 0.5);
    float vignetteMask = smoothstep(start, end, dist);
    float power = mix(1.0, 3.0, vignetteIntensity);
    vignetteMask = pow(vignetteMask, power);
    float vignetteStrength = vignetteMask * vignetteIntensity;
    mapped.rgb = mix(mapped.rgb, mapped.rgb * vignetteColor, vignetteStrength);
  }

  gl_FragColor = mapped;
}
`;

export const GradingShader = {
  uniforms: {
    tDiffuse: { value: null },
    exposure: { value: 1.0 },
    contrast: { value: 1.0 },
    hue: { value: 0.0 },
    saturation: { value: 1.0 },
    temperature: { value: 0.0 },
    tint: { value: 0.0 },
    highlights: { value: 0.0 },
    shadows: { value: 0.0 },
    clarity: { value: 0.0 },
    fade: { value: 0.0 },
    sharpness: { value: 0.0 },
    resolution: { value: new THREE.Vector2(1, 1) },
    bypass: { value: 1.0 },
    toneCurveLut: { value: null },
    toneHdrTailSlope: { value: 1.0 },
    toneCurveIdentity: { value: 1.0 },
    toneMappingType: { value: 4 },
    vignetteIntensity: { value: 0.0 },
    vignetteColor: { value: new THREE.Color('#080808') },
  },
  vertexShader: gradingVertex,
  fragmentShader: gradingFragment,
};

const lensDirtVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const lensDirtFragment = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D tDirt;
uniform float strength;
uniform float minLuminance;
uniform float maxLuminance;
uniform float sensitivity;
uniform float exposureFactor;
uniform vec3 tintColor;

void main() {
  vec4 base = texture2D(tDiffuse, vUv);
  vec4 dirt = texture2D(tDirt, vUv);
  float ramp = smoothstep(minLuminance, maxLuminance, exposureFactor);
  float amount = pow(ramp, sensitivity) * strength;
  vec3 dirtTinted = dirt.rgb * tintColor;
  vec3 result = base.rgb + dirtTinted * amount;
  gl_FragColor = vec4(result, base.a);
}
`;

const emptyTexture = new THREE.Texture();

export const LensDirtShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDirt: { value: emptyTexture },
    strength: { value: 0.35 },
    minLuminance: { value: 0.1 },
    maxLuminance: { value: 0.5 },
    sensitivity: { value: 1.0 },
    exposureFactor: { value: 1.0 },
    tintColor: { value: new THREE.Color(0xffffff) },
  },
  vertexShader: lensDirtVertex,
  fragmentShader: lensDirtFragment,
};

/** Barrel / fisheye-style lens distortion (post-process). Giliam de Carpentier, BSD — see decarpentier.nl/lens-distortion */
const lensDistortionVertex = `
uniform float strength;
uniform float height;
uniform float aspectRatio;
uniform float cylindricalRatio;

varying vec3 vUV;
varying vec2 vUVDot;

void main() {
  gl_Position = projectionMatrix * (modelViewMatrix * vec4(position, 1.0));

  float scaledHeight = strength * height;
  float cylAspectRatio = aspectRatio * cylindricalRatio;
  float aspectDiagSq = aspectRatio * aspectRatio + 1.0;
  float diagSq = scaledHeight * scaledHeight * aspectDiagSq;
  vec2 signedUV = (2.0 * uv + vec2(-1.0, -1.0));

  float z = 0.5 * sqrt(diagSq + 1.0) + 0.5;
  float ny = (z - 1.0) / (cylAspectRatio * cylAspectRatio + 1.0);

  vUVDot = sqrt(ny) * vec2(cylAspectRatio, 1.0) * signedUV;
  vUV = vec3(0.5, 0.5, 1.0) * z + vec3(-0.5, -0.5, 0.0);
  vUV.xy += uv;
}
`;

const lensDistortionFragment = `
uniform sampler2D tDiffuse;
varying vec3 vUV;
varying vec2 vUVDot;

void main() {
  vec3 uv = dot(vUVDot, vUVDot) * vec3(-0.5, -0.5, -1.0) + vUV;
  gl_FragColor = texture2DProj(tDiffuse, uv);
}
`;

export const LensDistortionShader = {
  uniforms: {
    tDiffuse: { value: null },
    strength: { value: 0 },
    height: { value: 1 },
    aspectRatio: { value: 1 },
    cylindricalRatio: { value: 1 },
  },
  vertexShader: lensDistortionVertex,
  fragmentShader: lensDistortionFragment,
};

export {
  AberrationShader,
  applyChromaticAberrationToPass,
  defaultAberration,
  isChromaticAberrationActive,
  mergeAberrationSettings,
} from '../render/chromaticAberration.js';

