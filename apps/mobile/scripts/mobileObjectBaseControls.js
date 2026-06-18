/** Object menu — base scale 0 = off; active range matches desktop (0.5–10). */
export const MOBILE_BASE_SCALE = {
  label: 'Base scale',
  min: 0,
  max: 10,
  step: 0.01,
  minActive: 0.5,
  format: (v) => v.toFixed(2),
  defaultValue: 0,
};
