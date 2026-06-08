varying vec2 vUv;
uniform sampler2D tEquirect;
uniform float rotation;
uniform vec2 texelSize;

void main() {
  // Snap output columns to texel centers so the u=0 / u=1 meridian stays aligned.
  vec2 uv = vUv;
  if (texelSize.x > 0.0) {
    uv.x = (floor(uv.x / texelSize.x) + 0.5) * texelSize.x;
  }
  uv.x = fract(uv.x + rotation);
  gl_FragColor = texture2D(tEquirect, uv);
}
