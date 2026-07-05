import * as THREE from 'three';

const VERTEX = /* glsl */ `
#include <common>
#include <uv_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>

varying vec2 vMapUv;

void main() {
  #include <uv_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  vMapUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`;

const FRAGMENT = `
uniform sampler2D map;
uniform int channel;
varying vec2 vMapUv;
void main() {
  vec4 c = texture2D(map, vMapUv);
  float v = channel == 0 ? c.r : (channel == 1 ? c.g : c.b);
  gl_FragColor = vec4(vec3(v), 1.0);
}
`;

/**
 * Unlit grayscale preview of one channel from a packed ORM map (R=AO, G=roughness, B=metallic).
 * @param {import('three').Texture} texture
 * @param {'r' | 'g' | 'b'} channel
 * @param {{ side?: number, transparent?: boolean, opacity?: number, skinning?: boolean, morphTargets?: boolean }} [opts]
 */
export function createMapChannelPreviewMaterial(texture, channel, opts = {}) {
  const channelIndex = channel === 'r' ? 0 : channel === 'g' ? 1 : 2;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      channel: { value: channelIndex },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: opts.side ?? THREE.FrontSide,
    transparent: !!opts.transparent,
    opacity: Number.isFinite(opts.opacity) ? opts.opacity : 1,
    depthWrite: !opts.transparent,
  });
  if (opts.skinning) {
    material.skinning = true;
  }
  if (opts.morphTargets) {
    material.morphTargets = true;
  }
  return material;
}
