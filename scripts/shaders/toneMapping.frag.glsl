varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float toneMappingType;
uniform float vignetteIntensity;
uniform vec3 vignetteColor;

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
  
  // Apply vignette
  if (vignetteIntensity > 0.0001) {
    vec2 center = vec2(0.5, 0.5);
    float dist = distance(vUv, center);
    
    // As intensity increases, make the falloff steeper and start earlier
    // This makes more of the image darker, not just the edges
    float start = mix(0.3, 0.0, vignetteIntensity); // Start darkening closer to center at higher intensity
    float end = mix(1.0, 0.6, vignetteIntensity * 0.5); // End closer to center for steeper falloff
    float vignetteMask = smoothstep(start, end, dist);
    
    // Use power curve to make falloff steeper at higher intensities
    float power = mix(1.0, 3.0, vignetteIntensity);
    vignetteMask = pow(vignetteMask, power);
    
    // Blend between original color and vignette color based on mask
    float vignetteStrength = vignetteMask * vignetteIntensity;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vignetteColor, vignetteStrength);
  }
}

