/**
 * Full-screen “big message” copy — same word stagger + lift as dropzone `.drop-primary` headline.
 * Used by #orbyFullscreenPrompt, #bugReportThankYouLayer, etc.
 */
import gsap from 'gsap';
import { prefersReducedMotion } from './modalReveal.js';

export const BIG_MESSAGE_STAGGER_CLASS = 'orby-stagger-word';

/** Text/copy reveal pace (1 = baseline; 0.72 ≈ 28% snappier). Dropzone, marketing, modals. */
export const TEXT_REVEAL_PACE = 0.72;

const headWordDur = 0.42 * TEXT_REVEAL_PACE;
const headStagger = 0.035 * TEXT_REVEAL_PACE;
const headLiftY = 14;
const btnDur = 0.38 * TEXT_REVEAL_PACE;
const btnEase = 'power3.out';
const btnStagger = 0.022 * TEXT_REVEAL_PACE;
const blockOverlap = 0.2 * TEXT_REVEAL_PACE;

/**
 * Wrap whitespace-delimited text nodes in spans for word stagger (recursive).
 * Skips if already wrapped (e.g. reopen).
 * @param {HTMLElement | null} root
 */
export function wrapWordsForBigMessage(root) {
  if (!root || root.querySelector(`.${BIG_MESSAGE_STAGGER_CLASS}`)) return;
  const processNode = (node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent;
        if (!text.trim()) continue;
        const fragment = document.createDocumentFragment();
        for (const part of text.split(/(\s+)/)) {
          if (part === '') continue;
          if (/^\s+$/.test(part)) {
            fragment.appendChild(document.createTextNode(part));
          } else {
            const span = document.createElement('span');
            span.className = BIG_MESSAGE_STAGGER_CLASS;
            span.textContent = part;
            fragment.appendChild(span);
          }
        }
        node.insertBefore(fragment, child);
        node.removeChild(child);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        processNode(child);
      }
    }
  };
  processNode(root);
}

/**
 * Kill tweens on message + stagger words inside it (nested spans).
 * @param {HTMLElement | null} msg
 */
export function killBigMessageRevealTweens(msg, buttons = []) {
  if (!msg && (!buttons || !buttons.length)) return;
  const words = msg ? [...msg.querySelectorAll(`.${BIG_MESSAGE_STAGGER_CLASS}`)] : [];
  const flat = [msg, ...words, ...buttons.filter(Boolean)].filter(Boolean);
  gsap.killTweensOf(flat);
}

/**
 * Timeline: headline word stagger (dropzone style) then button row lift — matches StartMenuController ordering.
 * @param {HTMLElement | null} msgEl `.bug-report-thank-you-message`
 * @param {(HTMLElement | null)[]} buttonEls e.g. [ghost, primary]
 * @returns {gsap.core.Timeline}
 */
export function createBigMessageRevealTimeline(msgEl, buttonEls = []) {
  const tl = gsap.timeline();
  const buttons = buttonEls.filter(Boolean);

  if (prefersReducedMotion()) {
    if (msgEl) {
      gsap.set(msgEl, { opacity: 1 });
      const words = [...msgEl.querySelectorAll(`.${BIG_MESSAGE_STAGGER_CLASS}`)];
      words.forEach((n) => gsap.set(n, { opacity: 1, y: 0, clearProps: 'transform' }));
      if (!words.length) gsap.set(msgEl, { opacity: 1, clearProps: 'transform' });
    }
    buttons.forEach((b) => gsap.set(b, { opacity: 1, y: 0, clearProps: 'transform' }));
    return tl;
  }

  wrapWordsForBigMessage(msgEl);
  const words = msgEl ? [...msgEl.querySelectorAll(`.${BIG_MESSAGE_STAGGER_CLASS}`)] : [];

  if (msgEl) gsap.set(msgEl, { opacity: 1 });

  let headLabel = 0;
  if (words.length) {
    tl.fromTo(
      words,
      { opacity: 0, y: headLiftY },
      {
        opacity: 1,
        y: 0,
        duration: headWordDur,
        stagger: headStagger,
        ease: 'power2.out',
      },
    );
    headLabel = tl.duration();
  } else if (msgEl) {
    tl.fromTo(
      msgEl,
      { opacity: 0, y: headLiftY },
      { opacity: 1, y: 0, duration: btnDur, ease: 'power2.out' },
    );
    headLabel = tl.duration();
  }

  if (buttons.length) {
    const pos = headLabel > 0 ? `>-=${blockOverlap}` : 0;
    tl.fromTo(
      buttons,
      { opacity: 0, y: -15 },
      {
        opacity: 1,
        y: 0,
        duration: btnDur,
        ease: btnEase,
        stagger: btnStagger,
      },
      pos,
    );
  }

  return tl;
}
