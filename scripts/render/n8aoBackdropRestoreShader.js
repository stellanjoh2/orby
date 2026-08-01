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
    /** Min glass darkening factor — scales with AO intensity; never crushes to literal black. */
    glassAoFloor: { value: 0.2 },
  },
  vertexShader: CopyShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tAO;
    uniform sampler2D tBackdrop;
    uniform sampler2D tBeauty;
    uniform highp sampler2D tSceneDepth;
    uniform sampler2D tGlassMask;
    uniform float skyDepthThreshold;
    uniform float glassAoFloor;
    varying vec2 vUv;

    void main() {
      float depth = texture2D(tSceneDepth, vUv).r;
      float geometry = 1.0 - step(skyDepthThreshold, depth);
      vec4 maskSample = texture2D(tGlassMask, vUv);
      float glass = step(0.5, maskSample.r);
      float catcher = step(0.5, maskSample.g);
      vec3 ao = texture2D(tAO, vUv).rgb;
      vec3 backdrop = texture2D(tBackdrop, vUv).rgb;
      vec3 beauty = texture2D(tBeauty, vUv).rgb;

      // Mesh / podium: full N8AO plate. Sky + HDRI AO catcher: untouched RenderPass backdrop.
      // Catcher still writes beauty depth so N8AO can form foot contact on the mesh; the disc
      // itself must stay invisible (multiply/replace paths painted a huge darkened oval).
      vec3 geomMix = mix(backdrop, ao, geometry * (1.0 - catcher));

      // Glass disc: darken the reflection base (beauty) but keep screen-space overlays
      // (lens flare — in backdrop but excluded from beauty seed) at full strength.
      float beautyLum = max(dot(beauty, vec3(0.299, 0.587, 0.114)), 0.05);
      float aoLum = dot(ao, vec3(0.299, 0.587, 0.114));
      float aoFactor = clamp(aoLum / beautyLum, glassAoFloor, 1.0);
      vec3 overlay = max(backdrop - beauty, vec3(0.0));
      vec3 glassColor = beauty * aoFactor + overlay;

      gl_FragColor = vec4(mix(geomMix, glassColor, glass), 1.0);
    }
  `,
};
