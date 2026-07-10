import { CopyShader } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/shaders/CopyShader.js';

/**
 * Composite N8AO onto geometry while keeping the RenderPass backdrop on sky pixels.
 * Geometry mask comes from the beauty depth buffer (cleared far plane ≈ 1.0).
 */
export const N8aoBackdropRestoreShader = {
  uniforms: {
    tAO: { value: null },
    tBackdrop: { value: null },
    tSceneDepth: { value: null },
    /** Raw depth below this is treated as geometry (not cleared sky). */
    skyDepthThreshold: { value: 0.9995 },
  },
  vertexShader: CopyShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tAO;
    uniform sampler2D tBackdrop;
    uniform highp sampler2D tSceneDepth;
    uniform float skyDepthThreshold;
    varying vec2 vUv;

    void main() {
      float depth = texture2D(tSceneDepth, vUv).r;
      float geometry = 1.0 - step(skyDepthThreshold, depth);
      vec3 ao = texture2D(tAO, vUv).rgb;
      vec3 backdrop = texture2D(tBackdrop, vUv).rgb;
      gl_FragColor = vec4(mix(backdrop, ao, geometry), 1.0);
    }
  `,
};
