/**
 * Shared GLSL for Shader Lab presets — world-space scalar fields that stay continuous
 * at duplicate seam verts (same position, split normals on torus wraps, etc.).
 */
export const ORBY_SEAMLESS_FIELD_GLSL = /* glsl */ `
float orbySeamlessLogScaleU(float sc) {
  float logMin = -3.321928094887362;
  float logMax = 2.321928094887362;
  return (log2(clamp(sc, 0.1, 5.0)) - logMin) / (logMax - logMin);
}

float orbySeamlessHoloWFreq(float sc) {
  float u = (log2(clamp(sc, 0.1, 5.0)) + 3.321928094887362) / 5.643856189774724;
  return mix(2.923, 0.25, u);
}

float orbySeamlessOil(vec3 worldPos, float patternScale, float time) {
  float wFreq = orbySeamlessHoloWFreq(patternScale);
  vec3 pw = worldPos * wFreq;
  float t = time * (wFreq / 1.35);
  return
    sin(pw.x * 0.72 + t * 0.72) * cos(pw.y * 0.78 - t * 0.62) +
    sin(pw.z * 0.68 + t * 0.42) * 0.45 +
    sin(dot(pw, vec3(0.72, 1.02, 0.58)) * 1.05 + t * 0.85) * 0.35;
}

float orbySeamlessFlowLift(vec3 worldPos, float patternScale, float time) {
  float wFreq = orbySeamlessHoloWFreq(patternScale);
  vec3 pw = worldPos * wFreq;
  float t = time * (wFreq / 1.35);
  return sin(dot(pw, vec3(0.15, 0.97, 0.18)) * 0.85 + t * 0.4) * 0.4;
}

float orbySeamlessViewShimmer(vec3 worldPos, float patternScale, float time, vec3 toCam) {
  float wFreq = orbySeamlessHoloWFreq(patternScale);
  vec3 pw = worldPos * wFreq;
  float t = time * (wFreq / 1.35);
  return sin(dot(pw, toCam * 0.42 + vec3(0.28, 0.74, 0.36)) * 2.1 + t * 0.55) * 0.5 + 0.5;
}

float orbySeamlessChromePulse(vec3 worldPos, float patternScale, float time) {
  float wFreq = orbySeamlessHoloWFreq(patternScale);
  vec3 pw = worldPos * wFreq;
  float t = time * (wFreq / 1.35);
  return sin(dot(pw, vec3(0.52, 0.18, 0.86)) * 1.35 - t * 0.48) * 0.5 + 0.5;
}

float orbySeamlessWorldHeat(vec3 worldPos, float patternScale, float time) {
  float sc = clamp(patternScale, 0.1, 5.0);
  vec3 p = worldPos * (1.15 / max(sc, 0.001));
  float w1 = sin(p.x * 2.1 + time * 0.85) + sin(p.y * 2.35 - time * 0.72) + sin(p.z * 1.62 + time * 0.58);
  float w2 = sin(length(p.xy) * 3.4 + time * 1.05);
  float w3 = sin(dot(p, vec3(0.95, 1.35, 1.05)) * 2.75 - time * 0.92);
  return clamp((w1 + w2 * 0.62 + w3 * 0.48) * 0.18 + 0.50, 0.0, 1.0);
}

float orbySeamlessViewAccent(vec3 worldPos, float patternScale, vec3 toCam) {
  float sc = clamp(patternScale, 0.1, 5.0);
  vec3 p = worldPos * (0.55 / max(sc, 0.001));
  return sin(dot(p, toCam * 0.38 + vec3(0.25, 0.72, 0.45)) * 2.4) * 0.5 + 0.5;
}
`;
