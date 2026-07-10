import { ORBY_BLACK } from '../constants.js';

/** Backdrop while marketing ↔ studio transitions are in flight — always Orby black. */
export const TRANSITION_BACKDROP = ORBY_BLACK;

const CLASS = 'orby-page-transition';

let loadSpinnerDepth = 0;

function isDropzoneHiding() {
  return !!document.querySelector('.dropzone.hiding');
}

export function isStudioBackdropTransitionLocked() {
  return (
    loadSpinnerDepth > 0
    || isDropzoneHiding()
    || document.documentElement.classList.contains(CLASS)
  );
}

function presentTransitionBackdrop() {
  window.orby?.scene?.presentStudioBackdropDuringTransition?.();
}

function flushStudioViewportBackdrop() {
  window.orby?.scene?.flushStudioViewportBackdrop?.();
}

function syncTransitionClass() {
  const locked = loadSpinnerDepth > 0 || isDropzoneHiding();
  if (locked) {
    document.documentElement.classList.add(CLASS);
    presentTransitionBackdrop();
    return;
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

export function noteDropzoneHideStarted() {
  syncTransitionClass();
}

export function noteDropzoneHideEnded() {
  syncTransitionClass();
}

/** Return-home reveal — keep black under the fading dropzone. */
export function noteDropzoneRevealStarted() {
  document.documentElement.classList.add(CLASS);
  presentTransitionBackdrop();
}

export function noteDropzoneRevealEnded() {
  syncTransitionClass();
}
