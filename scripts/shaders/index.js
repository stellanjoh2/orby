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
  color *= 0.6;
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

