varying vec2 vUv;
uniform sampler2D tBackground;
uniform float intensity;
uniform float blurriness;

void main() {
  vec2 uv = vUv;
  
  // Simple blur effect using multiple samples
  vec4 color = vec4(0.0);
  if (blurriness > 0.0) {
    float blurAmount = blurriness * 0.02;
    color += texture2D(tBackground, uv + vec2(-blurAmount, -blurAmount)) * 0.25;
    color += texture2D(tBackground, uv + vec2(blurAmount, -blurAmount)) * 0.25;
    color += texture2D(tBackground, uv + vec2(-blurAmount, blurAmount)) * 0.25;
    color += texture2D(tBackground, uv + vec2(blurAmount, blurAmount)) * 0.25;
  } else {
    color = texture2D(tBackground, uv);
  }
  
  // Apply intensity (darkens when < 1, brightens when > 1)
  color.rgb *= intensity;
  
  gl_FragColor = color;
}

