/**
 * Shelf panel tab title — word stagger with subtle horizontal motion (from the right).
 */
import { gsap } from 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js';

const STAGGER_CLASS = 'orby-stagger-word';

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function wrapWordsForStagger(root) {
  if (!root || root.querySelector(`.${STAGGER_CLASS}`)) return;
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
            span.className = STAGGER_CLASS;
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

/** Snappy word stagger; motion is subtle right → left (positive x), not from below */
const headWordDur = 0.42;
const headStagger = 0.035;
const headOffsetX = 14;

/**
 * @param {HTMLElement | null} header .panel-header-title for the active tab
 */
export function revealShelfPanelHeadline(header) {
  if (!header) return;
  wrapWordsForStagger(header);
  const words = [...header.querySelectorAll(`.${STAGGER_CLASS}`)];

  if (prefersReducedMotion()) {
    gsap.killTweensOf([header, ...words]);
    gsap.set(header, { opacity: 1, clearProps: 'transform' });
    words.forEach((node) => gsap.set(node, { opacity: 1, x: 0, clearProps: 'transform' }));
    return;
  }

  const targets = words.length ? words : [header];
  gsap.killTweensOf(targets);
  gsap.set(targets, { opacity: 0, x: headOffsetX });

  if (words.length) {
    gsap.fromTo(
      words,
      { opacity: 0, x: headOffsetX },
      {
        opacity: 1,
        x: 0,
        duration: headWordDur,
        stagger: headStagger,
        ease: 'power2.out',
        overwrite: 'auto',
      },
    );
  } else {
    gsap.fromTo(
      header,
      { opacity: 0, x: headOffsetX },
      {
        opacity: 1,
        x: 0,
        duration: headWordDur,
        ease: 'power2.out',
        overwrite: 'auto',
      },
    );
  }
}
