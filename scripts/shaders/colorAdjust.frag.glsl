varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float contrast;
uniform float hue;
uniform float saturation;

// RGB to HSV
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// HSV to RGB
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  
  // Apply contrast
  vec3 rgb = color.rgb;
  rgb = (rgb - 0.5) * contrast + 0.5;
  rgb = clamp(rgb, 0.0, 1.0);
  
  // Convert to HSV for hue and saturation adjustment
  vec3 hsv = rgb2hsv(rgb);
  
  // Apply hue shift
  hsv.x = mod(hsv.x + hue / 360.0, 1.0);
  
  // Apply saturation
  hsv.y *= saturation;
  hsv.y = clamp(hsv.y, 0.0, 1.0);
  
  // Convert back to RGB
  rgb = hsv2rgb(hsv);
  
  gl_FragColor = vec4(rgb, color.a);
}

