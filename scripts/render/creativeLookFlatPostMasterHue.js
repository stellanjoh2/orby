/** YIQ hue rotation — shifts flat-post palette crush input and palette entries together. */
export const FLAT_POST_MASTER_HUE_GLSL = /* glsl */ `
uniform float uMasterHue;

vec3 applyFlatPostMasterHue(vec3 color) {
  if (abs(uMasterHue) < 0.0001) return color;
  const mat3 RGB_TO_YIQ = mat3(
    0.299, 0.587, 0.114,
    0.596, -0.274, -0.322,
    0.211, -0.523, 0.312
  );
  const mat3 YIQ_TO_RGB = mat3(
    1.0, 0.956, 0.621,
    1.0, -0.272, -0.647,
    1.0, -1.106, 1.703
  );
  vec3 yiq = RGB_TO_YIQ * color;
  float cosA = cos(uMasterHue);
  float sinA = sin(uMasterHue);
  mat2 rot = mat2(cosA, -sinA, sinA, cosA);
  yiq.yz = rot * yiq.yz;
  return clamp(YIQ_TO_RGB * yiq, 0.0, 4.0);
}
`;
