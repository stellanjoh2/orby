varying vec2 vUv;
uniform sampler2D tEquirect;
uniform float rotation;

void main() {
  // For equirectangular maps, rotation is horizontal (around Y axis)
  // This means we shift the U coordinate
  vec2 uv = vUv;
  uv.x = mod(uv.x + rotation, 1.0);
  gl_FragColor = texture2D(tEquirect, uv);
}

