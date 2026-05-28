/**
 * Single rAF-coalesced scroll bus for homepage marketing listeners.
 * Replaces per-module window scroll handlers (cue fade, nav, turntable, curtain).
 */

const SCROLL_OPTS = { passive: true };

/** @type {Set<() => void>} */
const subscribers = new Set();
let scrollRaf = 0;
let listening = false;

function flushScroll() {
  scrollRaf = 0;
  for (const fn of subscribers) {
    fn();
  }
}

function onWindowScroll() {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(flushScroll);
}

function syncListener() {
  if (subscribers.size === 0) {
    if (listening) {
      window.removeEventListener('scroll', onWindowScroll, SCROLL_OPTS);
      listening = false;
    }
    if (scrollRaf) {
      cancelAnimationFrame(scrollRaf);
      scrollRaf = 0;
    }
    return;
  }
  if (!listening) {
    window.addEventListener('scroll', onWindowScroll, SCROLL_OPTS);
    listening = true;
  }
}

/**
 * @param {() => void} callback — invoked once per coalesced scroll frame.
 * @returns {() => void} unsubscribe
 */
export function subscribeMarketingScroll(callback) {
  subscribers.add(callback);
  syncListener();
  return () => {
    subscribers.delete(callback);
    syncListener();
  };
}
