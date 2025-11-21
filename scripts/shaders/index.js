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
}
`;

const backgroundVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const backgroundFragment = `
varying vec2 vUv;
uniform sampler2D tBackground;
uniform float intensity;
uniform float blurriness;

void main() {
  vec2 uv = vUv;
  
  vec4 color = vec4(0.0);
  if (blurriness > 0.0) {
    float blurAmount = blurriness * 0.02;
    color += texture2D(tBackground, uv + vec2(-blurAmount, -blurAmount)) * 0.25;
    color += texture2D(tBackground, uv + vec2(blurAmount, -blurAmount)) * 0.25;
    color += texture2D(tBackground, uv + vec2(-blurAmount, blurAmount)) * 0.25;
    color += texture2D(tBackground, uv + vec2(blurAmount, blurAmount)) * 0.25;
  } else {
    color = texture2D(tBackground, uv);
  }
  
  color.rgb *= intensity;
  
  gl_FragColor = color;
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
  },
  vertexShader: toneMappingVertex,
  fragmentShader: toneMappingFragment,
};

export const BackgroundShader = {
  uniforms: {
    tBackground: { value: null },
    intensity: { value: 1.0 },
    blurriness: { value: 0.0 },
  },
  vertexShader: backgroundVertex,
  fragmentShader: backgroundFragment,
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
uniform float bypass;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const float CONTRAST_PIVOT = 0.18;
const float EPSILON = 1e-5;

vec3 applyContrast(vec3 color, float amount) {
  if (abs(amount - 1.0) < 0.0001) {
    return color;
  }
  return (color - vec3(CONTRAST_PIVOT)) * amount + vec3(CONTRAST_PIVOT);
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
  float tempOffset = temperature * 0.35;
  float tintOffset = tint * 0.25;
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
  vec3 balanced = color * balance;
  float srcLuma = dot(color, LUMA);
  float balancedLuma = max(dot(balanced, LUMA), EPSILON);
  float scale = srcLuma / balancedLuma;
  return balanced * scale;
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

  float highlightDelta = highlights * 0.25 * highlightMask;
  float shadowDelta = shadows * 0.25 * shadowMask;

  float totalDelta = highlightDelta + shadowDelta;
  float targetLuma = luma + totalDelta;
  float adjustment = targetLuma - luma;
  return color + vec3(adjustment);
}

void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  if (bypass > 0.5) {
    gl_FragColor = color;
    return;
  }

  vec3 adjusted = max(color.rgb, vec3(0.0));
  adjusted = applyContrast(adjusted, contrast);
  adjusted = applySaturation(adjusted, saturation);
  adjusted = applyHue(adjusted, hue);
  adjusted = applyWhiteBalance(adjusted, temperature, tint);
  adjusted = applyTonalRanges(adjusted, highlights, shadows);

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
    bypass: { value: 1.0 },
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


