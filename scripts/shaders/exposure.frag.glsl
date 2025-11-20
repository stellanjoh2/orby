varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float exposure;

void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  color.rgb *= exposure;
  gl_FragColor = color;
}

