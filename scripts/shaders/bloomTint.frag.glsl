varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec3 tint;
uniform float strength;

void main() {
  vec4 base = texture2D(tDiffuse, vUv);
  float luminance = dot(base.rgb, vec3(0.299, 0.587, 0.114));
  float mask = smoothstep(0.6, 1.2, luminance);
  vec3 colorized = base.rgb + tint * mask * strength;
  gl_FragColor = vec4(colorized, base.a);
}

