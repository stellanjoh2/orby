varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float time;
uniform float intensity;
uniform vec3 tint;

// Better noise function - smoother and less glitchy
float rand(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

// Improved grain calculation - prevents exposure pop and glitchiness
void main() {
  vec4 base = texture2D(tDiffuse, vUv);
  
  // Early exit if intensity is effectively zero
  if (intensity < 0.0001) {
    gl_FragColor = base;
    return;
  }
  
  // Use screen-space UV for better grain distribution
  // Scale UV to create fine grain pattern
  vec2 grainUv = vUv * 800.0 + time * 0.05;
  float noise = rand(grainUv) * 2.0 - 1.0;
  
  // Calculate luminance for adaptive grain
  float luminance = dot(base.rgb, vec3(0.299, 0.587, 0.114));
  
  // Scale grain amount - make it more visible
  // intensity is typically 0.03-0.15 range, so multiply by larger factor
  float grainAmount = noise * intensity * 0.5;
  
  // Apply grain - blend based on luminance but make it more visible
  // Use a smoother curve that doesn't completely hide grain in dark areas
  float grainBlend = mix(0.3, 1.0, smoothstep(0.0, 0.5, luminance));
  vec3 grain = tint * grainAmount * grainBlend;
  vec3 result = base.rgb + grain;
  
  gl_FragColor = vec4(result, base.a);
}

