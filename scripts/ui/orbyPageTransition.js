import { ORBY_BLACK } from '../constants.js';

/** Backdrop while marketing ↔ studio transitions are in flight — always Orby black. */
export const TRANSITION_BACKDROP = ORBY_BLACK;

const CLASS = 'orby-page-transition';
const REVEAL_CLASS = 'orby-studio-reveal-active';
const SCRIM_CLASS = 'workspace-studio-reveal-scrim';
/** Shelf / side chrome — from first marketing → studio beat. */
const STUDIO_SHELF_REVEAL_MS = 1500;
/** Viewport black scrim — quick fade once mesh / blank canvas is ready. */
const STUDIO_VIEWPORT_FADE_MS = 500;
/** Matches `dropzoneHide` in styles.css (+ small buffer). */
const DROPZONE_HIDE_MS = 650;

let loadSpinnerDepth = 0;
let dropzoneHideInFlight = false;
let studioEntranceContentReady = false;
let pendingStudioEntranceContentReady = false;
let studioRevealArmed = false;
let viewportRevealStarted = false;
let entranceStartedAt = 0;
let scrimEl = null;
let scrimFadeTimer = null;
let scrimFadeListener = null;
let shelfReleaseTimer = null;
let dropzoneHideFallbackTimer = null;

function isDropzoneHiding() {
  return dropzoneHideInFlight;
}

function isDropzoneBlockingEntrance() {
  if (!dropzoneHideInFlight) return false;
  const dropzone = document.querySelector('.dropzone');
  if (!dropzone) return false;
  const opacity = Number.parseFloat(window.getComputedStyle(dropzone).opacity);
  return Number.isFinite(opacity) && opacity > 0.05;
}

function clearDropzoneHideFallback() {
  if (dropzoneHideFallbackTimer == null) return;
  clearTimeout(dropzoneHideFallbackTimer);
  dropzoneHideFallbackTimer = null;
}

function scheduleDropzoneHideFallback() {
  clearDropzoneHideFallback();
  dropzoneHideFallbackTimer = window.setTimeout(() => {
    dropzoneHideFallbackTimer = null;
    if (!dropzoneHideInFlight) return;
    dropzoneHideInFlight = false;
    syncTransitionClass();
  }, DROPZONE_HIDE_MS);
}

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function isStudioBackdropTransitionLocked() {
  return (
    loadSpinnerDepth > 0
    || isDropzoneHiding()
    || document.documentElement.classList.contains(CLASS)
  );
}

export function isStudioRevealActive() {
  return document.documentElement.classList.contains(REVEAL_CLASS);
}

function presentTransitionBackdrop() {
  window.orby?.scene?.presentStudioBackdropDuringTransition?.();
}

function flushStudioViewportBackdrop() {
  window.orby?.scene?.flushStudioViewportBackdrop?.();
}

function ensureStudioRevealScrim() {
  if (scrimEl?.isConnected) return scrimEl;
  const workspace = document.querySelector('.workspace');
  if (!workspace) return null;
  scrimEl = document.createElement('div');
  scrimEl.className = SCRIM_CLASS;
  scrimEl.setAttribute('aria-hidden', 'true');
  workspace.appendChild(scrimEl);
  return scrimEl;
}

function cancelShelfReleaseTimer() {
  if (shelfReleaseTimer == null) return;
  clearTimeout(shelfReleaseTimer);
  shelfReleaseTimer = null;
}

function cancelStudioRevealFade() {
  if (scrimFadeTimer != null) {
    clearTimeout(scrimFadeTimer);
    scrimFadeTimer = null;
  }
  if (scrimFadeListener && scrimEl) {
    scrimEl.removeEventListener('transitionend', scrimFadeListener);
    scrimFadeListener = null;
  }
}

function removeStudioRevealScrim() {
  cancelStudioRevealFade();
  scrimEl?.remove();
  scrimEl = null;
}

function shouldPlayStudioRevealFade() {
  return document.documentElement.classList.contains('orby-studio-active');
}

function clearStudioRevealState() {
  studioRevealArmed = false;
  studioEntranceContentReady = false;
  pendingStudioEntranceContentReady = false;
  viewportRevealStarted = false;
  entranceStartedAt = 0;
  dropzoneHideInFlight = false;
  clearDropzoneHideFallback();
  cancelShelfReleaseTimer();
  document.documentElement.classList.remove(REVEAL_CLASS, 'orby-studio-reveal-instant-chrome');
  removeStudioRevealScrim();
}

function releaseStudioChromeHold() {
  if (!document.documentElement.classList.contains(REVEAL_CLASS)) return;
  document.documentElement.classList.add('orby-studio-reveal-instant-chrome');
  document.documentElement.classList.remove(REVEAL_CLASS);
  requestAnimationFrame(() => {
    document.documentElement.classList.remove('orby-studio-reveal-instant-chrome');
  });
}

function maybeFinishEntrance() {
  if (!studioRevealArmed) return;
  const shelfReleased = !document.documentElement.classList.contains(REVEAL_CLASS);
  const scrimGone = !scrimEl?.isConnected;
  if (!shelfReleased || !scrimGone) return;
  studioRevealArmed = false;
  studioEntranceContentReady = false;
  pendingStudioEntranceContentReady = false;
  viewportRevealStarted = false;
  dropzoneHideInFlight = false;
  clearDropzoneHideFallback();
  cancelShelfReleaseTimer();
}

function scheduleShelfRelease() {
  cancelShelfReleaseTimer();
  if (!studioRevealArmed) return;

  const elapsed = performance.now() - entranceStartedAt;
  const delay = Math.max(0, STUDIO_SHELF_REVEAL_MS - elapsed);
  const release = () => {
    shelfReleaseTimer = null;
    releaseStudioChromeHold();
    maybeFinishEntrance();
  };

  if (delay === 0) {
    release();
    return;
  }

  shelfReleaseTimer = window.setTimeout(release, delay);
}

function finishViewportReveal() {
  if (!viewportRevealStarted) return;
  cancelStudioRevealFade();
  removeStudioRevealScrim();
  maybeFinishEntrance();
}

function showStudioRevealScrimOpaque() {
  if (!studioRevealArmed || viewportRevealStarted) return;
  const scrim = ensureStudioRevealScrim();
  if (!scrim) return;
  cancelStudioRevealFade();
  scrim.classList.remove('is-fading');
  scrim.classList.add('is-visible');
}

function armStudioReveal() {
  if (!studioRevealArmed) {
    entranceStartedAt = performance.now();
  }
  studioRevealArmed = true;
  document.documentElement.classList.add(REVEAL_CLASS);
  if (pendingStudioEntranceContentReady) {
    studioEntranceContentReady = true;
    pendingStudioEntranceContentReady = false;
  }
  showStudioRevealScrimOpaque();
}

function beginStudioRevealFade() {
  if (viewportRevealStarted) return;

  if (!studioRevealArmed || !shouldPlayStudioRevealFade()) {
    clearStudioRevealState();
    flushStudioViewportBackdrop();
    return;
  }

  const scrim = ensureStudioRevealScrim();
  if (!scrim) {
    clearStudioRevealState();
    flushStudioViewportBackdrop();
    return;
  }

  viewportRevealStarted = true;
  showStudioRevealScrimOpaque();
  flushStudioViewportBackdrop();
  scheduleShelfRelease();
  document.documentElement.classList.remove(CLASS);

  if (prefersReducedMotion()) {
    removeStudioRevealScrim();
    releaseStudioChromeHold();
    maybeFinishEntrance();
    return;
  }

  requestAnimationFrame(() => {
    if (!scrim.isConnected) {
      finishViewportReveal();
      return;
    }

    scrimFadeListener = (event) => {
      if (event.target !== scrim || event.propertyName !== 'opacity') return;
      finishViewportReveal();
    };
    scrim.addEventListener('transitionend', scrimFadeListener);
    scrimFadeTimer = window.setTimeout(finishViewportReveal, STUDIO_VIEWPORT_FADE_MS + 80);
    scrim.classList.add('is-fading');
  });
}

function syncTransitionClass() {
  const entranceWaitingForContent = studioRevealArmed && !studioEntranceContentReady;
  const locked = isDropzoneBlockingEntrance() || entranceWaitingForContent;

  if (locked) {
    if (!viewportRevealStarted) {
      cancelStudioRevealFade();
      cancelShelfReleaseTimer();
    }
    document.documentElement.classList.add(CLASS);
    if (studioRevealArmed) {
      showStudioRevealScrimOpaque();
    }
    presentTransitionBackdrop();
    return;
  }

  if (studioRevealArmed && shouldPlayStudioRevealFade()) {
    beginStudioRevealFade();
    return;
  }

  if (studioRevealArmed) {
    clearStudioRevealState();
  }

  document.documentElement.classList.remove(CLASS);
  flushStudioViewportBackdrop();
}

export function noteOrbyLoadSpinnerBegun() {
  loadSpinnerDepth += 1;
  syncTransitionClass();
}

export function noteOrbyLoadSpinnerEnded() {
  loadSpinnerDepth = Math.max(0, loadSpinnerDepth - 1);
  syncTransitionClass();
}

/** Mesh / blank canvas ready — hide spinner; viewport fade once dropzone hide completes. */
export function noteStudioEntranceContentReady() {
  pendingStudioEntranceContentReady = true;
  if (!studioRevealArmed) return;
  studioEntranceContentReady = true;
  syncTransitionClass();
}

export function noteDropzoneHideStarted() {
  dropzoneHideInFlight = true;
  studioEntranceContentReady = false;
  viewportRevealStarted = false;
  scheduleDropzoneHideFallback();
  armStudioReveal();
  syncTransitionClass();
}

export function noteDropzoneHideEnded() {
  dropzoneHideInFlight = false;
  clearDropzoneHideFallback();
  syncTransitionClass();
}

export function noteDropzoneRevealStarted() {
  clearStudioRevealState();
  document.documentElement.classList.add(CLASS);
  presentTransitionBackdrop();
}

export function noteDropzoneRevealEnded() {
  syncTransitionClass();
}
