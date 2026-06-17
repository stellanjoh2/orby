/**
 * Mobile range slider fill track (--slider-fill-start / --slider-fill-end).
 * Shared by shell panels and future ui/* modules.
 */

/** @param {HTMLInputElement | null | undefined} slider */
export function updateMobileSliderFill(slider) {
  if (!slider || slider.type !== 'range') return;
  const min = parseFloat(slider.min) || 0;
  const max = parseFloat(slider.max) || 100;
  const value = parseFloat(slider.value) || 0;
  const isCentered = min < 0 && max > 0;
  if (isCentered) {
    const center = 0;
    const range = max - min;
    const centerPercent = ((center - min) / range) * 100;
    if (value === center) {
      slider.style.setProperty('--slider-fill-start', `${centerPercent}%`);
      slider.style.setProperty('--slider-fill-end', `${centerPercent}%`);
    } else if (value > center) {
      const valuePercent = ((value - min) / range) * 100;
      slider.style.setProperty('--slider-fill-start', `${centerPercent}%`);
      slider.style.setProperty('--slider-fill-end', `${valuePercent}%`);
    } else {
      const valuePercent = ((value - min) / range) * 100;
      slider.style.setProperty('--slider-fill-start', `${valuePercent}%`);
      slider.style.setProperty('--slider-fill-end', `${centerPercent}%`);
    }
    return;
  }
  const range = max - min;
  const fillPercent = range > 0 ? ((value - min) / range) * 100 : 0;
  slider.style.setProperty('--slider-fill-start', '0%');
  slider.style.setProperty('--slider-fill-end', `${fillPercent}%`);
}
