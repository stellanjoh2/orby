import * as THREE from 'three';

const VERTEX = `
varying vec2 vMapUv;
void main() {
  vMapUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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
 * @param {{ side?: number, transparent?: boolean, opacity?: number }} [opts]
 */
export function createMapChannelPreviewMaterial(texture, channel, opts = {}) {
  const channelIndex = channel === 'r' ? 0 : channel === 'g' ? 1 : 2;
  return new THREE.ShaderMaterial({
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
}
