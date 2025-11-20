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

