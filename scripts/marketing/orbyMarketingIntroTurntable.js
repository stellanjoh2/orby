/**
 * Intro turntable — canvas sequence driven by natural scroll (no pin / scroll-jack).
 * Web delivery: WebP/JPEG frames, fetch + createImageBitmap, static poster on slow/narrow viewports.
 * Scroll scrub uses rAF + IntersectionObserver — no ScrollTrigger plugin.
 */
import { gsap, prefersReducedMotion } from './marketingMotion.js';

/** @type {const} */
export const INTRO_TURNTABLE_SEQUENCE = {
  basePath:
    './assets/marketing/toyotagr_supra_gt300__www_vecarz_com_turntable_5s_60fps_1spin_1440p_web',
  namePrefix: 'toyotagr_supra_gt300__www_vecarz_com_turntable_5s_',
  /** Primary format (run `npm run encode:turntable` from PNG masters). */
  ext: 'webp',
  fallbackExt: 'jpg',
  frameCount: 300,
  pad: 4,
  /** Every Nth source frame (~150 scrub frames at stride 2). */
  stride: 2,
  /** 1-based source frame at scroll progress 0; scroll runs 60→300→1→59. */
  startFrame: 60,
  /** Fallback when CSS --orby-intro-turntable-fit-scale is unset. */
  drawScale: 0.85,
  poster: {
    webp: './assets/marketing/intro-turntable-poster.webp',
    jpg: './assets/marketing/intro-turntable-poster.jpg',
  },
};

const PRELOAD_CONCURRENCY = 12;
const SCROLL_ACTIVATE_ROOT_MARGIN = '240px 0px';
const MAX_DPR = 2;
const STATIC_MAX_WIDTH_PX = 767;
/** Below 1920, layout math uses these refs so resize does not re-center the car. */
export const INTRO_TURNTABLE_LAYOUT_REF_WIDTH_PX = 1920;
export const INTRO_TURNTABLE_LAYOUT_REF_HEIGHT_PX = 1080;
const INTRO_TURNTABLE_NARROW_MQ = `(max-width: ${INTRO_TURNTABLE_LAYOUT_REF_WIDTH_PX - 1}px)`;

/** @type {(() => void) | null} */
let activeTurntableRepaint = null;

/**
 * Maps section position to 0–1 — same range as ScrollTrigger start/end top bottom → bottom top.
 * @param {HTMLElement} section
 */
function computeSectionScrollProgress(section) {
  const rect = section.getBoundingClientRect();
  const vh = window.innerHeight;
  const range = vh + rect.height;
  if (range <= 0) return 0;
  return Math.min(1, Math.max(0, (vh - rect.top) / range));
}

/** @type {TurntableFrame[] | null} */
let frameCache = null;
/** @type {Promise<TurntableFrame[]> | null} */
let preloadPromise = null;
/** @type {Promise<'webp' | 'jpg'> | null} */
let resolvedExtPromise = null;

/** @typedef {ImageBitmap | HTMLImageElement} TurntableFrame */

/** @returns {boolean} */
function isIntroTurntableNarrowViewport() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia(INTRO_TURNTABLE_NARROW_MQ).matches
  );
}

/**
 * Apple-style gate: scroll sequence only where it will stay smooth.
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
 * @param {number} sourceIndex 1-based frame index in the asset folder
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
  const { frameCount, stride, startFrame = 1 } = INTRO_TURNTABLE_SEQUENCE;
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
 * @param {number[]} indices
 * @param {TurntableFrame[]} results
 * @param {'webp' | 'jpg'} ext
 */
async function preloadFrames(indices, results, ext) {
  let cursor = 0;

  const workers = Array.from({ length: PRELOAD_CONCURRENCY }, async () => {
    while (cursor < indices.length) {
      const slot = cursor++;
      if (!results[slot]) {
        results[slot] = await loadFrame(indices[slot], ext);
      }
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * @returns {Promise<TurntableFrame[]>}
 */
export function preloadIntroTurntableFrames() {
  if (!shouldRunIntroTurntableSequence()) {
    return Promise.resolve([]);
  }
  if (frameCache?.length && frameCache.every((f) => f && framePixelSize(f).w > 0)) {
    return Promise.resolve(frameCache);
  }
  if (preloadPromise) return preloadPromise;

  const indices = sourceFrameIndices();
  frameCache = new Array(indices.length);
  const cache = frameCache;

  preloadPromise = (async () => {
    const ext = await resolveFrameExt();
    cache[0] = await loadFrame(indices[0], ext);
    await preloadFrames(indices, cache, ext);
    return cache;
  })();

  return preloadPromise;
}

/** Frees decoded frames when leaving the home marketing page entirely. */
export function clearIntroTurntablePreload() {
  frameCache?.forEach(releaseFrame);
  frameCache = null;
  preloadPromise = null;
  resolvedExtPromise = null;
}

/**
 * @param {HTMLElement} section
 */
function readTurntableFitScale(section) {
  const raw = getComputedStyle(section)
    .getPropertyValue('--orby-intro-turntable-fit-scale')
    .trim();
  const n = Number.parseFloat(raw);
  if (Number.isFinite(n) && n > 0) return Math.min(1, n);
  return INTRO_TURNTABLE_SEQUENCE.drawScale;
}

/**
 * @param {number} containerW
 * @param {number} containerH
 * @param {number} frameW
 * @param {number} frameH
 * @param {number} fitScale
 */
function computeContainedSize(containerW, containerH, frameW, frameH, fitScale) {
  const fit = Math.min(containerW / frameW, containerH / frameH) * fitScale;
  return { w: frameW * fit, h: frameH * fit };
}

/**
 * Size the canvas element to object-fit: contain (canvas ignores CSS object-fit).
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} section
 * @param {TurntableFrame} frame
 */
function layoutCanvasToContain(canvas, section, frame) {
  const wrap = canvas.parentElement;
  if (!wrap) return { bitmapW: 0, bitmapH: 0 };

  const { w: fw, h: fh } = framePixelSize(frame);
  if (!fw || !fh) return { bitmapW: 0, bitmapH: 0 };

  const rect = wrap.getBoundingClientRect();
  const narrow = isIntroTurntableNarrowViewport();
  /* Below 1920, lock placement to 1920×1080 layout math — no shift on resize */
  const containerW = narrow
    ? INTRO_TURNTABLE_LAYOUT_REF_WIDTH_PX
    : Math.max(1, rect.width);
  const containerH = narrow
    ? INTRO_TURNTABLE_LAYOUT_REF_HEIGHT_PX
    : Math.max(1, rect.height);
  const fitScale = readTurntableFitScale(section);
  const { w, h } = computeContainedSize(containerW, containerH, fw, fh, fitScale);
  const [posX, posY] = parseObjectPositionPair(
    readTurntableObjectPosition(section),
  );
  const cssW = Math.max(1, Math.round(w));
  const cssH = Math.max(1, Math.round(h));
  const offsetX = Math.round((containerW - cssW) * posX);
  const offsetY = Math.round((containerH - cssH) * posY);

  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.style.right = 'auto';
  canvas.style.left = `${offsetX}px`;
  canvas.style.top = `${offsetY}px`;

  const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
  const bitmapW = Math.max(1, Math.round(cssW * dpr));
  const bitmapH = Math.max(1, Math.round(cssH * dpr));

  if (canvas.width !== bitmapW || canvas.height !== bitmapH) {
    canvas.width = bitmapW;
    canvas.height = bitmapH;
  }

  return { bitmapW, bitmapH, cssW, cssH, dpr };
}

/**
 * CSS object-position axis → 0–1 along the free space after object-fit: contain.
 * @param {string} token
 * @param {'x' | 'y'} axis
 */
function parseObjectPositionAxis(token, axis) {
  const t = token.trim().toLowerCase();
  if (t.endsWith('%')) {
    const pct = Number.parseFloat(t);
    return Number.isFinite(pct) ? Math.min(1, Math.max(0, pct / 100)) : 0.5;
  }
  const map = {
    left: 0,
    top: 0,
    center: 0.5,
    right: 1,
    bottom: 1,
  };
  if (t in map) return map[t];
  return axis === 'x' ? 0.5 : 0.5;
}

/**
 * @param {string} value e.g. "62% 44%" or "center"
 * @returns {[number, number]}
 */
function parseObjectPositionPair(value) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const xToken = parts[0] || 'center';
  const yToken = parts[1] || parts[0] || 'center';
  return [parseObjectPositionAxis(xToken, 'x'), parseObjectPositionAxis(yToken, 'y')];
}

/**
 * @param {HTMLElement} section
 */
function readTurntableObjectPosition(section) {
  const raw = getComputedStyle(section)
    .getPropertyValue('--orby-intro-turntable-object-position')
    .trim();
  return raw || 'center center';
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {TurntableFrame} frame
 * @param {number} bitmapW
 * @param {number} bitmapH
 */
function drawFrame(ctx, frame, bitmapW, bitmapH) {
  const { w: fw, h: fh } = framePixelSize(frame);
  if (!fw || !bitmapW || !bitmapH) return;

  ctx.clearRect(0, 0, bitmapW, bitmapH);
  ctx.drawImage(frame, 0, 0, bitmapW, bitmapH);
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

  if (!canvas) {
    return () => {};
  }

  section.classList.remove('orby-marketing__intro-turntable--static');
  if (poster) poster.removeAttribute('src');

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return () => {};

  const sourceIndices = sourceFrameIndices();
  /** @type {TurntableFrame[]} */
  let frames = new Array(sourceIndices.length);
  let paintedFrame = -1;
  let scrollScrubActive = false;
  let scrollRaf = 0;
  /** @type {(() => void) | null} */
  let detachScrollScrub = null;
  /** @type {IntersectionObserver | null} */
  let scrollActivateObserver = null;
  let resizeObserver = null;
  let resizeTimer = 0;

  const currentScrubIndex = () =>
    scrollScrubActive
      ? computeSectionScrollProgress(section) * Math.max(0, frames.length - 1)
      : 0;

  const paint = (scrubIndex) => {
    const idx = Math.min(frames.length - 1, Math.max(0, Math.round(scrubIndex)));
    const frame = frames[idx];
    if (idx === paintedFrame || !frame || framePixelSize(frame).w === 0) return;
    paintedFrame = idx;
    const metrics = layoutCanvasToContain(canvas, section, frame);
    if (!metrics.bitmapW) return;
    drawFrame(ctx, frame, metrics.bitmapW, metrics.bitmapH);
  };

  const paintFromScroll = () => {
    paint(currentScrubIndex());
  };

  const onResize = () => {
    paintedFrame = -1;
    paintFromScroll();
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
    if (scrollScrubActive || prefersReducedMotion()) return;
    scrollScrubActive = true;

    const onScroll = () => {
      if (scrollRaf) return;
      scrollRaf = window.requestAnimationFrame(() => {
        scrollRaf = 0;
        paintFromScroll();
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    detachScrollScrub = () => {
      window.removeEventListener('scroll', onScroll);
      if (scrollRaf) {
        window.cancelAnimationFrame(scrollRaf);
        scrollRaf = 0;
      }
      scrollScrubActive = false;
      detachScrollScrub = null;
    };

    paintFromScroll();
  };

  /** Attach scroll scrub only while the section is near the viewport — detach on exit. */
  const bindScrollScrubVisibility = () => {
    if (prefersReducedMotion() || typeof IntersectionObserver !== 'function') {
      attachScrollScrub();
      return;
    }

    scrollActivateObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries.find((e) => e.target === section);
        if (!entry) return;
        if (entry.isIntersecting) {
          attachScrollScrub();
        } else {
          detachScrollScrub?.();
        }
      },
      { root: null, rootMargin: SCROLL_ACTIVATE_ROOT_MARGIN, threshold: 0 },
    );
    scrollActivateObserver.observe(section);
  };

  const applyLoadedFrames = (loaded) => {
    if (!section.isConnected) return;
    frames = loaded;
    paintedFrame = -1;
    markReady();
    paintFromScroll();
  };

  const paintFirstCached = () => {
    const first = frameCache?.[0];
    if (!first || !section.isConnected || framePixelSize(first).w === 0) return;
    frames[0] = first;
    paint(0);
    markReady();
  };

  if (prefersReducedMotion()) {
    void preloadIntroTurntableFrames().then((loaded) => {
      if (loaded[0]) {
        frames[0] = loaded[0];
        paint(0);
      }
      markReady();
    });
    return () => {};
  }

  resizeObserver =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(scheduleResize)
      : null;
  const stage = section.querySelector('.orby-marketing__intro-stage');
  resizeObserver?.observe(stage ?? canvas.parentElement ?? canvas);
  window.addEventListener('resize', scheduleResize, { passive: true });

  activeTurntableRepaint = onResize;
  paintFirstCached();
  bindScrollScrubVisibility();
  void preloadIntroTurntableFrames().then(applyLoadedFrames);

  return () => {
    activeTurntableRepaint = null;
    window.clearTimeout(resizeTimer);
    resizeObserver?.disconnect();
    window.removeEventListener('resize', scheduleResize);
    scrollActivateObserver?.disconnect();
    scrollActivateObserver = null;
    detachScrollScrub?.();
    frames = [];
    paintedFrame = -1;
  };
}

/** @param {HTMLElement} [root] */
export function killIntroTurntableScrollTriggers(root) {
  activeTurntableRepaint = null;
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

/** Repaint turntable canvas after marketing layout shifts (replaces ScrollTrigger.refresh). */
export function refreshIntroTurntableScrollTriggers() {
  activeTurntableRepaint?.();
}
