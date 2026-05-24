/**
 * Homepage / marketing capability tier — gates motion, decode, and GPU work
 * without changing layout.
 */
import { prefersReducedMotion } from '../ui/modalReveal.js';

/** @typedef {'full' | 'reduced'} MarketingPerformanceTier */

/** @type {MarketingPerformanceTier | null} */
let tierCache = null;

/**
 * @returns {MarketingPerformanceTier}
 */
export function getMarketingPerformanceTier() {
  if (tierCache) return tierCache;
  if (prefersReducedMotion()) {
    tierCache = 'reduced';
    return tierCache;
  }
  if (typeof window === 'undefined') {
    tierCache = 'full';
    return tierCache;
  }

  let score = 0;
  const conn =
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection;
  if (conn?.saveData) score += 3;
  const effectiveType = conn?.effectiveType;
  if (effectiveType && /^(slow-2g|2g|3g)$/i.test(effectiveType)) score += 2;

  const memory = navigator.deviceMemory;
  if (typeof memory === 'number') {
    if (memory <= 4) score += 3;
    else if (memory <= 8) score += 1;
  }

  const cores = navigator.hardwareConcurrency;
  if (typeof cores === 'number') {
    if (cores <= 4) score += 2;
    else if (cores <= 6) score += 1;
  }

  tierCache = score >= 3 ? 'reduced' : 'full';
  return tierCache;
}

/** Sync `html.orby-marketing-reduced` for CSS tiers. */
export function applyMarketingPerformanceClass() {
  if (typeof document === 'undefined') return;
  const reduced = getMarketingPerformanceTier() === 'reduced';
  document.documentElement.classList.toggle('orby-marketing-reduced', reduced);
}

export function shouldUseHeadlineWordStagger() {
  return getMarketingPerformanceTier() === 'full';
}

export function shouldUseMediaBlurReveal() {
  return getMarketingPerformanceTier() === 'full';
}

/** @returns {number} */
export function getIntroTurntableStride() {
  return getMarketingPerformanceTier() === 'full' ? 2 : 4;
}

/** @returns {number} */
export function getIntroTurntableMaxDpr() {
  return getMarketingPerformanceTier() === 'full' ? 2 : 1;
}

/** @returns {number} */
export function getTurntableFrameWindowRadius() {
  return getMarketingPerformanceTier() === 'full' ? 20 : 10;
}

export function shouldPreloadAllTurntableFrames() {
  return getMarketingPerformanceTier() === 'full';
}

/** @returns {number} */
export function getTurntablePreloadConcurrency() {
  return getMarketingPerformanceTier() === 'full' ? 10 : 5;
}

/** @returns {number} */
export function getShowcaseCycleMs() {
  return getMarketingPerformanceTier() === 'full' ? 5200 : 7800;
}
