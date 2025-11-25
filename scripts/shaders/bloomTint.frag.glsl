varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec3 tint;
uniform float strength;

void main() {
  vec4 base = texture2D(tDiffuse, vUv);
  float luminance = dot(base.rgb, vec3(0.299, 0.587, 0.114));
  float mask = smoothstep(0.6, 1.2, luminance);
  // Apply power curve to make color more intense and visible
  float blend = clamp(mask * strength, 0.0, 1.0);
  blend = pow(blend, 0.7); // Power curve makes the blend more aggressive
  vec3 colorized = mix(base.rgb, tint, blend);
  gl_FragColor = vec4(colorized, base.a);
}

