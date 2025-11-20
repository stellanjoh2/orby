varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float toneMappingType;

// ACES Filmic approximation
vec3 ACESFilmicToneMapping(vec3 color) {
  color *= 0.6;
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
}

// Reinhard tone mapping
vec3 ReinhardToneMapping(vec3 color) {
  return color / (1.0 + color);
}

void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  
  if (toneMappingType < 0.5) {
    // None - no tone mapping
    gl_FragColor = color;
  } else if (toneMappingType < 1.5) {
    // Linear - no tone mapping (same as none)
    gl_FragColor = color;
  } else if (toneMappingType < 2.5) {
    // Reinhard
    gl_FragColor = vec4(ReinhardToneMapping(color.rgb), color.a);
  } else {
    // ACES Filmic (default)
    gl_FragColor = vec4(ACESFilmicToneMapping(color.rgb), color.a);
  }
}

