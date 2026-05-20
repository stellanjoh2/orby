/**
 * Intro turntable — canvas sequence driven by natural scroll (no pin / scroll-jack).
 * Web delivery: WebP/JPEG frames, windowed decode cache, static poster on slow/narrow viewports.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from '../ui/modalReveal.js';
import {
  getIntroTurntableMaxDpr,
  getIntroTurntableStride,
  getMarketingPerformanceTier,
  getTurntableFrameWindowRadius,
  getTurntablePreloadConcurrency,
  shouldPreloadAllTurntableFrames,
} from './marketingPerformanceTier.js';

gsap.registerPlugin(ScrollTrigger);

/** @type {const} */
export const INTRO_TURNTABLE_SEQUENCE = {
  basePath:
    './assets/marketing/toyotagr_supra_gt300__www_vecarz_com_turntable_5s_60fps_1spin_1440p_web',
  namePrefix: 'toyotagr_supra_gt300__www_vecarz_com_turntable_5s_',
  ext: 'webp',
  fallbackExt: 'jpg',
  frameCount: 300,
  pad: 4,
  startFrame: 60,
  drawScale: 1,
  poster: {
    webp: './assets/marketing/intro-turntable-poster.webp',
    jpg: './assets/marketing/intro-turntable-poster.jpg',
  },
};

const SCROLL_TRIGGER_ID = 'orby-intro-turntable';
const STATIC_MAX_WIDTH_PX = 767;
const PRELOAD_IO = { root: null, rootMargin: '480px 0px', threshold: 0 };

/** @type {TurntableFrameWindow | null} */
let frameWindow = null;
/** @type {Promise<TurntableFrameWindow> | null} */
let preloadPromise = null;
/** @type {Promise<'webp' | 'jpg'> | null} */
let resolvedExtPromise = null;
/** @type {IntersectionObserver | null} */
let preloadObserver = null;

/** @typedef {ImageBitmap | HTMLImageElement} TurntableFrame */

class TurntableFrameWindow {
  /**
   * @param {number[]} sourceIndices
   * @param {'webp' | 'jpg'} ext
   */
  constructor(sourceIndices, ext) {
    this.sourceIndices = sourceIndices;
    this.ext = ext;
    /** @type {(TurntableFrame | null)[]} */
    this.frames = new Array(sourceIndices.length);
    this.radius = getTurntableFrameWindowRadius();
    this.retainRadius = this.radius * 2;
    /** @type {Set<number>} */
    this.inFlight = new Set();
    this.firstReady = false;
  }

  /**
   * @param {number} scrubIndex
   */
  async ensureAround(scrubIndex) {
    const center = Math.min(
      this.frames.length - 1,
      Math.max(0, Math.round(scrubIndex)),
    );
    const jobs = [];
    for (
      let i = Math.max(0, center - this.radius);
      i <= Math.min(this.frames.length - 1, center + this.radius);
      i += 1
    ) {
      if (!this.frames[i] && !this.inFlight.has(i)) {
        jobs.push(this.loadSlot(i));
      }
    }
    this.evictOutside(center);
    if (jobs.length) await Promise.all(jobs);
  }

  /**
   * @param {number} center
   */
  evictOutside(center) {
    for (let i = 0; i < this.frames.length; i += 1) {
      if (Math.abs(i - center) <= this.retainRadius) continue;
      if (this.frames[i]) {
        releaseFrame(this.frames[i]);
        this.frames[i] = null;
      }
    }
  }

  /**
   * @param {number} slot
   */
  async loadSlot(slot) {
    if (this.frames[slot] || this.inFlight.has(slot)) return;
    this.inFlight.add(slot);
    try {
      this.frames[slot] = await loadFrame(this.sourceIndices[slot], this.ext);
      if (!this.firstReady && framePixelSize(this.frames[slot]).w > 0) {
        this.firstReady = true;
      }
    } finally {
      this.inFlight.delete(slot);
    }
  }

  async preloadAll() {
    const concurrency = getTurntablePreloadConcurrency();
    let cursor = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (cursor < this.frames.length) {
        const slot = cursor++;
        if (!this.frames[slot]) await this.loadSlot(slot);
      }
    });
    await Promise.all(workers);
  }

  async ensureFirst() {
    if (this.frames[0] && framePixelSize(this.frames[0]).w > 0) return;
    await this.loadSlot(0);
  }

  /**
   * @param {number} scrubIndex
   * @returns {TurntableFrame | null}
   */
  getFrame(scrubIndex) {
    const idx = Math.min(
      this.frames.length - 1,
      Math.max(0, Math.round(scrubIndex)),
    );
    return this.frames[idx] ?? null;
  }

  release() {
    this.frames.forEach((frame) => releaseFrame(frame));
    this.frames = [];
    this.inFlight.clear();
  }
}

/**
 * @returns {boolean}
 */
export function shouldRunIntroTurntableSequence() {
  if (prefersReducedMotion()) return false;
  if (typeof window === 'undefined') return true;
  if (window.matchMedia(`(max-width: ${STATIC_MAX_WIDTH_PX}px)`).matches) {
    return false;
  }
  const conn =
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection;
  if (conn?.saveData) return false;
  const effectiveType = conn?.effectiveType;
  if (effectiveType && /^(slow-2g|2g)$/i.test(effectiveType)) return false;
  if (getMarketingPerformanceTier() === 'reduced' && typeof navigator.deviceMemory === 'number') {
    if (navigator.deviceMemory <= 4) return false;
  }
  return true;
}

/**
 * @returns {Promise<'webp' | 'jpg'>}
 */
async function resolveFrameExt() {
  if (!resolvedExtPromise) {
    resolvedExtPromise = detectWebPSupport().then((ok) =>
      ok ? INTRO_TURNTABLE_SEQUENCE.ext : INTRO_TURNTABLE_SEQUENCE.fallbackExt,
    );
  }
  return resolvedExtPromise;
}

/** @returns {Promise<boolean>} */
async function detectWebPSupport() {
  if (typeof createImageBitmap !== 'function') return false;
  const probe =
    'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';
  try {
    const res = await fetch(probe);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const ok = bitmap.width > 0;
    bitmap.close();
    return ok;
  } catch {
    return false;
  }
}

/**
 * @param {number} sourceIndex
 * @param {'webp' | 'jpg'} ext
 */
function frameUrl(sourceIndex, ext) {
  const { basePath, namePrefix, pad } = INTRO_TURNTABLE_SEQUENCE;
  const n = String(sourceIndex).padStart(pad, '0');
  return `${basePath}/${namePrefix}${n}.${ext}`;
}

/**
 * @returns {number[]}
 */
export function sourceFrameIndices() {
  const { frameCount, startFrame = 1 } = INTRO_TURNTABLE_SEQUENCE;
  const stride = getIntroTurntableStride();
  const indices = [];
  for (let i = 1; i <= frameCount; i += stride) {
    indices.push(i);
  }
  const last = frameCount;
  if (indices[indices.length - 1] !== last) indices.push(last);

  if (!startFrame || startFrame <= 1) return indices;

  let list = indices;
  if (!list.includes(startFrame)) {
    list = [...list, startFrame].sort((a, b) => a - b);
  }

  const pivot = list.indexOf(startFrame);
  if (pivot < 0) return list;
  return [...list.slice(pivot), ...list.slice(0, pivot)];
}

/**
 * @param {TurntableFrame | null | undefined} frame
 */
function releaseFrame(frame) {
  if (frame && 'close' in frame && typeof frame.close === 'function') {
    frame.close();
  }
}

/**
 * @param {TurntableFrame | null | undefined} frame
 */
function framePixelSize(frame) {
  if (!frame) return { w: 0, h: 0 };
  if ('naturalWidth' in frame && frame.naturalWidth > 0) {
    return { w: frame.naturalWidth, h: frame.naturalHeight };
  }
  return { w: frame.width, h: frame.height };
}

/**
 * @param {string} url
 * @returns {Promise<TurntableFrame>}
 */
async function loadFrameFromUrl(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(blob, {
        premultiplyAlpha: 'none',
        colorSpaceConversion: 'none',
      });
    }
    const img = new Image();
    img.decoding = 'async';
    const objectUrl = URL.createObjectURL(blob);
    await new Promise((resolve, reject) => {
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve();
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('decode failed'));
      };
      img.src = objectUrl;
    });
    return img;
  } catch {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
      img.src = url;
    });
    return img;
  }
}

/**
 * @param {number} sourceIndex
 * @param {'webp' | 'jpg'} ext
 * @returns {Promise<TurntableFrame>}
 */
async function loadFrame(sourceIndex, ext) {
  const url = frameUrl(sourceIndex, ext);
  const frame = await loadFrameFromUrl(url);
  const { w } = framePixelSize(frame);
  if (w > 0) return frame;

  const fallback =
    ext === INTRO_TURNTABLE_SEQUENCE.ext
      ? INTRO_TURNTABLE_SEQUENCE.fallbackExt
      : INTRO_TURNTABLE_SEQUENCE.ext;
  releaseFrame(frame);
  return loadFrameFromUrl(frameUrl(sourceIndex, fallback));
}

/**
 * @param {{ eager?: boolean }} [options]
 * @returns {Promise<TurntableFrameWindow | null>}
 */
export async function preloadIntroTurntableFrames(options = {}) {
  if (!shouldRunIntroTurntableSequence()) {
    return null;
  }
  if (frameWindow?.firstReady) return frameWindow;
  if (preloadPromise) return preloadPromise;

  const indices = sourceFrameIndices();
  preloadPromise = (async () => {
    const ext = await resolveFrameExt();
    const windowCache = new TurntableFrameWindow(indices, ext);
    frameWindow = windowCache;
    await windowCache.ensureFirst();
    if (options.eager || shouldPreloadAllTurntableFrames()) {
      void windowCache.preloadAll();
    }
    return windowCache;
  })();

  return preloadPromise;
}

/**
 * Begin turntable decode when the intro section nears the viewport.
 * @param {HTMLElement} section
 */
export function scheduleIntroTurntablePreload(section) {
  if (!section || !shouldRunIntroTurntableSequence()) return;
  if (frameWindow?.firstReady) return;

  const run = () => {
    void preloadIntroTurntableFrames({ eager: shouldPreloadAllTurntableFrames() });
  };

  if (typeof IntersectionObserver === 'undefined') {
    run();
    return;
  }

  if (preloadObserver) {
    preloadObserver.disconnect();
    preloadObserver = null;
  }

  preloadObserver = new IntersectionObserver((entries, observer) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    observer.disconnect();
    preloadObserver = null;
    run();
  }, PRELOAD_IO);
  preloadObserver.observe(section);
}

/** @returns {Promise<TurntableFrameWindow | null> | null} */
export function getIntroTurntablePreloadPromise() {
  return preloadPromise;
}

export function clearIntroTurntablePreload() {
  preloadObserver?.disconnect();
  preloadObserver = null;
  frameWindow?.release();
  frameWindow = null;
  preloadPromise = null;
  resolvedExtPromise = null;
}

/**
 * @param {HTMLCanvasElement} canvas
 */
function resizeCanvasToDisplay(canvas) {
  const wrap = canvas.parentElement;
  if (!wrap) return { width: 0, height: 0 };

  const rect = wrap.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));
  const dpr = Math.min(getIntroTurntableMaxDpr(), window.devicePixelRatio || 1);
  const bitmapW = Math.round(cssW * dpr);
  const bitmapH = Math.round(cssH * dpr);

  if (canvas.width !== bitmapW || canvas.height !== bitmapH) {
    canvas.width = bitmapW;
    canvas.height = bitmapH;
  }

  return { cssW, cssH, dpr, bitmapW, bitmapH };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {TurntableFrame} frame
 * @param {number} bitmapW
 * @param {number} bitmapH
 */
function drawFrame(ctx, frame, bitmapW, bitmapH) {
  const { w: fw, h: fh } = framePixelSize(frame);
  if (!fw) return;

  ctx.fillStyle = '#080808';
  ctx.fillRect(0, 0, bitmapW, bitmapH);

  const fit = Math.min(bitmapW / fw, bitmapH / fh);
  const scale = fit * INTRO_TURNTABLE_SEQUENCE.drawScale;
  const w = fw * scale;
  const h = fh * scale;
  const x = (bitmapW - w) * 0.5;
  const y = (bitmapH - h) * 0.5;
  ctx.drawImage(frame, x, y, w, h);
}

/**
 * @param {HTMLElement} section
 * @param {HTMLImageElement | null} poster
 */
async function initStaticTurntablePoster(section, poster) {
  section.classList.add(
    'orby-marketing__intro-turntable--static',
    'orby-marketing__intro-turntable--ready',
  );
  if (!poster) return;

  const ext = await resolveFrameExt();
  const { poster: paths } = INTRO_TURNTABLE_SEQUENCE;
  poster.src = ext === 'webp' ? paths.webp : paths.jpg;
  poster.decoding = 'async';
}

/**
 * @param {HTMLElement} root
 * @returns {() => void}
 */
export function initIntroTurntable(root) {
  const section = root?.querySelector('.orby-marketing__section--intro-turntable');
  const canvas = section?.querySelector('.orby-marketing__intro-turntable-canvas');
  const poster = section?.querySelector('.orby-marketing__intro-turntable-poster');

  if (!section) {
    return () => {};
  }

  if (!shouldRunIntroTurntableSequence()) {
    void initStaticTurntablePoster(section, poster);
    return () => {
      section.classList.remove(
        'orby-marketing__intro-turntable--static',
        'orby-marketing__intro-turntable--ready',
      );
    };
  }

  scheduleIntroTurntablePreload(section);

  if (!canvas) {
    return () => {};
  }

  section.classList.remove('orby-marketing__intro-turntable--static');
  if (poster) poster.removeAttribute('src');

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return () => {};

  /** @type {TurntableFrameWindow | null} */
  let windowCache = null;
  let frameCount = sourceFrameIndices().length;
  let paintedFrame = -1;
  let scrollTrigger = null;
  let resizeObserver = null;
  let resizeTimer = 0;
  let paintPending = false;
  let lastScrub = 0;
  let lastEnsureIdx = -1;

  const paint = (scrubIndex) => {
    lastScrub = scrubIndex;
    if (paintPending) return;
    paintPending = true;
    requestAnimationFrame(() => {
      paintPending = false;
      const idx = Math.min(frameCount - 1, Math.max(0, Math.round(lastScrub)));
      const frame = windowCache?.getFrame(lastScrub);
      if (idx === paintedFrame || !frame || framePixelSize(frame).w === 0) return;
      paintedFrame = idx;
      const metrics = resizeCanvasToDisplay(canvas);
      if (!metrics.bitmapW) return;
      drawFrame(ctx, frame, metrics.bitmapW, metrics.bitmapH);
    });
  };

  const onResize = () => {
    paintedFrame = -1;
    paint(
      scrollTrigger
        ? scrollTrigger.progress * Math.max(0, frameCount - 1)
        : 0,
    );
  };

  const scheduleResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(onResize, 120);
  };

  const wrap = section.querySelector('.orby-marketing__intro-turntable-wrap');

  const markReady = () => {
    section.classList.add('orby-marketing__intro-turntable--ready');
    if (wrap) gsap.set(wrap, { opacity: 1, clearProps: 'opacity' });
  };

  const attachScrollScrub = () => {
    if (scrollTrigger || prefersReducedMotion() || !windowCache) return;
    scrollTrigger = ScrollTrigger.create({
      id: SCROLL_TRIGGER_ID,
      trigger: section,
      start: 'top bottom',
      end: 'bottom top',
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        const scrub = self.progress * Math.max(0, frameCount - 1);
        const idx = Math.round(scrub);
        if (idx !== lastEnsureIdx) {
          lastEnsureIdx = idx;
          void windowCache.ensureAround(scrub).then(() => paint(scrub));
        } else {
          paint(scrub);
        }
      },
    });
    onResize();
  };

  const applyWindow = (loaded) => {
    if (!section.isConnected || !loaded) return;
    windowCache = loaded;
    frameCount = loaded.frames.length;
    paintedFrame = -1;
    markReady();
    const scrub = scrollTrigger
      ? scrollTrigger.progress * Math.max(0, frameCount - 1)
      : 0;
    void loaded.ensureAround(scrub).then(() => {
      paint(scrub);
      attachScrollScrub();
    });
  };

  if (prefersReducedMotion()) {
    void preloadIntroTurntableFrames().then((loaded) => {
      if (loaded) {
        windowCache = loaded;
        void loaded.ensureFirst().then(() => paint(0));
      }
      markReady();
    });
    return () => {};
  }

  resizeObserver =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(scheduleResize)
      : null;
  resizeObserver?.observe(canvas.parentElement ?? canvas);
  window.addEventListener('resize', scheduleResize, { passive: true });

  void preloadIntroTurntableFrames().then((loaded) => {
    if (loaded?.frames[0]) {
      windowCache = loaded;
      paint(0);
      markReady();
    }
    applyWindow(loaded);
  });

  return () => {
    window.clearTimeout(resizeTimer);
    resizeObserver?.disconnect();
    window.removeEventListener('resize', scheduleResize);
    scrollTrigger?.kill();
    scrollTrigger = null;
    windowCache = null;
    paintedFrame = -1;
  };
}

/** @param {HTMLElement} [root] */
export function killIntroTurntableScrollTriggers(root) {
  ScrollTrigger.getAll().forEach((st) => {
    if (st.vars?.id === SCROLL_TRIGGER_ID) st.kill();
  });
  if (root) {
    root
      .querySelectorAll('.orby-marketing__section--intro-turntable')
      .forEach((section) => {
        section.classList.remove(
          'orby-marketing__intro-turntable--ready',
          'orby-marketing__intro-turntable--static',
        );
      });
  }
}

/** Batch ScrollTrigger layout after marketing enhancements mount. */
export function refreshIntroTurntableScrollTriggers() {
  ScrollTrigger.refresh();
}
