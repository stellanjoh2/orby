import * as THREE from 'three';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/ShaderPass.js';

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Lightweight threshold + blur + add — viewport-only bloom for Shader Lab (avoids UnrealBloomPass RT bugs). */
const FRAGMENT_SHADER = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 texelSize;
uniform float threshold;
uniform float strength;
uniform float radius;
uniform vec3 tint;

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 extractBright(vec3 c) {
  float lum = luma(c);
  float soft = max(0.04, threshold * 0.22 + 0.03);
  float mask = smoothstep(threshold - soft, threshold + soft, lum);
  return c * mask;
}

void main() {
  vec3 base = texture2D(tDiffuse, vUv).rgb;

  // Radius 0–1 → wide spread (matches Cam/FX bloom radius feel more closely).
  float r = clamp(radius, 0.0, 1.0);
  float spread = mix(3.0, 88.0, r * r * 0.65 + r * 0.35);
  vec2 px = texelSize * spread;
  float sigma = mix(1.1, 5.5, r);

  vec3 bloom = vec3(0.0);
  float wsum = 0.0;

  for (int y = -4; y <= 4; y++) {
    for (int x = -4; x <= 4; x++) {
      vec2 off = vec2(float(x), float(y));
      float d2 = dot(off, off);
      float w = exp(-d2 / (2.0 * sigma * sigma));
      vec3 s = extractBright(texture2D(tDiffuse, vUv + off * px).rgb);
      bloom += s * w;
      wsum += w;
    }
  }
  bloom /= max(wsum, 1.0e-4);

  float glowAmt = max(strength, 0.0) * 8.0;
  vec3 glow = bloom * glowAmt;
  glow = mix(glow, glow * tint, clamp(glowAmt * 0.65, 0.0, 1.0));

  gl_FragColor = vec4(clamp(base + glow, vec3(0.0), vec3(3.0)), 1.0);
}
`;

/**
 * Viewport-only bloom for Shader Lab — reads `state.bloom` (Camera & FX panel).
 */
export class CreativeLookViewportBloom {
  /** @param {import('three').WebGLRenderer} renderer */
  constructor(renderer) {
    this.pass = new ShaderPass({
      name: 'CreativeLookViewportBloomPass',
      uniforms: {
        tDiffuse: { value: null },
        texelSize: { value: new THREE.Vector2(1, 1) },
        threshold: { value: 0.75 },
        strength: { value: 0.5 },
        radius: { value: 0.2 },
        tint: { value: new THREE.Color('#ffe9cc') },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    });
    this.pass.enabled = false;
    this.pass.renderToScreen = false;
    if (renderer) {
      const size = new THREE.Vector2();
      renderer.getSize(size);
      this.setSize(size.x, size.y);
    }
  }

  getPass() {
    return this.pass;
  }

  /** @param {number} width @param {number} height */
  setSize(width, height) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.pass.uniforms.texelSize.value.set(1 / w, 1 / h);
  }

  /**
   * @param {object} settings — `state.bloom`
   */
  updateSettings(settings) {
    const u = this.pass.uniforms;
    const thresh = Number(settings?.threshold);
    // Shader Lab output is pre-tonemapped — remap Cam/FX threshold so bloom is visible.
    u.threshold.value = Number.isFinite(thresh)
      ? THREE.MathUtils.clamp(thresh * 0.78 + 0.08, 0.05, 0.92)
      : 0.65;
    const strength = Number(settings?.strength);
    u.strength.value = Number.isFinite(strength) ? Math.max(0, strength) : 0.2;
    const rad = Number(settings?.radius);
    u.radius.value = Number.isFinite(rad)
      ? THREE.MathUtils.clamp(rad, 0, 1)
      : 0.2;
    u.tint.value.set(
      typeof settings?.color === 'string' && settings.color.trim()
        ? settings.color.trim()
        : '#ffe9cc',
    );
  }
}
