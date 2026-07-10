import { CopyShader } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/shaders/CopyShader.js';

/**
 * Composite N8AO onto geometry while keeping the RenderPass backdrop on sky pixels
 * and reflective studio surfaces (base glass).
 * Geometry mask comes from the beauty depth buffer (cleared far plane ≈ 1.0).
 */
export const N8aoBackdropRestoreShader = {
  uniforms: {
    tAO: { value: null },
    tBackdrop: { value: null },
    tBeauty: { value: null },
    tSceneDepth: { value: null },
    tGlassMask: { value: null },
    /** Raw depth below this is treated as geometry (not cleared sky). */
    skyDepthThreshold: { value: 0.9995 },
  },
  vertexShader: CopyShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tAO;
    uniform sampler2D tBackdrop;
    uniform sampler2D tBeauty;
    uniform highp sampler2D tSceneDepth;
    uniform sampler2D tGlassMask;
    uniform float skyDepthThreshold;
    varying vec2 vUv;

    void main() {
      float depth = texture2D(tSceneDepth, vUv).r;
      float geometry = 1.0 - step(skyDepthThreshold, depth);
      float glass = step(0.5, texture2D(tGlassMask, vUv).r);
      vec3 ao = texture2D(tAO, vUv).rgb;
      vec3 backdrop = texture2D(tBackdrop, vUv).rgb;
      vec3 beauty = texture2D(tBeauty, vUv).rgb;

      // Mesh / podium: full N8AO plate. Sky: untouched RenderPass backdrop.
      vec3 geomMix = mix(backdrop, ao, geometry);

      // Glass disc only: RenderPass reflections with N8AO darkening applied on top.
      vec3 beautySafe = max(beauty, vec3(0.001));
      vec3 aoFactor = clamp(ao / beautySafe, 0.0, 1.0);
      vec3 glassColor = backdrop * aoFactor;

      gl_FragColor = vec4(mix(geomMix, glassColor, glass), 1.0);
    }
  `,
};
