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

const aberrationVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const aberrationFragment = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float offset;
uniform float strength;

void main() {
  vec2 center = vec2(0.5);
  vec2 dir = normalize(vUv - center);
  vec2 shift = dir * offset * strength;
  float r = texture2D(tDiffuse, vUv + shift).r;
  float g = texture2D(tDiffuse, vUv).g;
  float b = texture2D(tDiffuse, vUv - shift).b;
  gl_FragColor = vec4(r, g, b, 1.0);
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
  
  if (toneMappingType < 0.5) {
    gl_FragColor = color;
  } else if (toneMappingType < 1.5) {
    gl_FragColor = color;
  } else if (toneMappingType < 2.5) {
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

void main() {
  vec2 uv = vUv;
  uv.x = mod(uv.x + rotation, 1.0);
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

export const AberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 0.003 },
    strength: { value: 0.4 },
  },
  vertexShader: aberrationVertex,
  fragmentShader: aberrationFragment,
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
    vignetteColor: { value: new THREE.Color('#000000') },
  },
  vertexShader: toneMappingVertex,
  fragmentShader: toneMappingFragment,
};

export const RotateEquirectShader = {
  uniforms: {
    tEquirect: { value: null },
    rotation: { value: 0.0 },
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
uniform vec2 toneP1;
uniform vec2 toneP2;
uniform vec4 toneDydx; // f'(0), f'(x1), f'(x2), f'(1) — PCHIP, CPU
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

// Master luminance remapping: monotone PCHIP (smooth) through (0,0)–p1–p2–(1,1)
float hermite1dLuma(float tLocal, float h, float y0, float y1, float m0, float m1) {
  if (h < 0.0001) {
    return mix(y0, y1, 0.5);
  }
  float u = tLocal / h;
  float u2 = u * u;
  float u3 = u2 * u;
  return (2.0 * u3 - 3.0 * u2 + 1.0) * y0
       + (u3 - 2.0 * u2 + u) * (h * m0)
       + (-2.0 * u3 + 3.0 * u2) * y1
       + (u3 - u2) * (h * m1);
}

float evalToneCurve(float t) {
  float x1 = toneP1.x;
  float y1 = toneP1.y;
  float x2 = toneP2.x;
  float y2 = toneP2.y;
  float m0 = toneDydx.x;
  float m1 = toneDydx.y;
  float m2 = toneDydx.z;
  float m3 = toneDydx.w;
  t = clamp(t, 0.0, 1.0);
  if (t < 0.00001) {
    return 0.0;
  }
  if (t > 0.99999) {
    return 1.0;
  }
  if (t <= x1) {
    return hermite1dLuma(t, x1, 0.0, y1, m0, m1);
  } else if (t <= x2) {
    return hermite1dLuma(t - x1, x2 - x1, y1, y2, m1, m2);
  } else {
    return hermite1dLuma(t - x2, 1.0 - x2, y2, 1.0, m2, m3);
  }
}

vec3 applyLumaToneCurve(vec3 c) {
  if (toneCurveIdentity > 0.5) {
    return c;
  }
  float l = dot(c, LUMA);
  if (l < 1e-5) {
    return c;
  }
  // evalToneCurve() clamps input to [0,1], so l > 1 used to map every HDR pixel to l2=1
  // (scale 1/l), which crushed highlights and conflicted with toneCurveIdentity bypass —
  // a visible 1-frame pop when |x−y| crossed TONE_IDENTITY_EPS (~neutral curve).
  // Extrapolate past white using PCHIP slope at t=1 (toneDydx.w) so HDR stays continuous.
  float l2;
  if (l <= 1.0) {
    l2 = evalToneCurve(l);
  } else {
    float dEnd = max(toneDydx.w, 0.0);
    l2 = 1.0 + (l - 1.0) * dEnd;
  }
  return clamp(c * (l2 / l), 0.0, 4.0);
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
  
  // Unsharp mask: center - blur, then add back with strength
  // Don't clamp here - preserve HDR values, clamping happens at the end
  float sharpAmount = amount * 0.01; // Scale to reasonable range
  vec3 sharp = center + (center - blur) * sharpAmount;
  return max(sharp, vec3(0.0)); // Only clamp negative values, preserve highlights
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
    toneP1: { value: new THREE.Vector2(0.25, 0.25) },
    toneP2: { value: new THREE.Vector2(0.75, 0.75) },
    toneDydx: { value: new THREE.Vector4(1.0, 1.0, 1.0, 1.0) },
    toneCurveIdentity: { value: 1.0 },
  },
  vertexShader: colorAdjustVertex,
  fragmentShader: colorAdjustFragment,
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

void main() {
  vec4 base = texture2D(tDiffuse, vUv);
  vec4 dirt = texture2D(tDirt, vUv);
  float ramp = smoothstep(minLuminance, maxLuminance, exposureFactor);
  float amount = pow(ramp, sensitivity) * strength;
  vec3 result = base.rgb + dirt.rgb * amount;
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

