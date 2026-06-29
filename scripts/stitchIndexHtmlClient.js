/**
 * Browser fallback when index.html is served without build/dev stitch
 * (e.g. python http.server, stale dev process, or opening the shell file directly).
 */
import { INCLUDE_COMMENT_RE } from './stitchIndexInclude.js';

/** @type {Promise<void> | null} */
let stitchPromise = null;

/**
 * @param {ParentNode} container
 * @returns {{ node: Comment, path: string }[]}
 */
function findIncludeComments(container) {
  const out = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT);
  let node;
  while ((node = walker.nextNode())) {
    const match = INCLUDE_COMMENT_RE.exec(node.textContent.trim());
    if (match) out.push({ node, path: match[1] });
  }
  return out;
}

/**
 * @returns {boolean}
 */
export function shelfPanelsNeedClientStitch() {
  const panels = document.querySelector('.panels');
  if (!panels) return false;
  if (panels.querySelector('[data-panel="studio"]')) return false;
  return findIncludeComments(panels).length > 0;
}

/**
 * Fetch shelf partials and inject into `.panels` when `@include` comment markers are present.
 * @returns {Promise<void>}
 */
export function ensureShelfPanelsStitched() {
  if (!shelfPanelsNeedClientStitch()) return Promise.resolve();
  if (stitchPromise) return stitchPromise;

  const panels = document.querySelector('.panels');
  const includes = findIncludeComments(panels);

  stitchPromise = (async () => {
    for (const { node, path } of includes) {
      const url = path.startsWith('./') || path.startsWith('/') ? path : `./${path}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(
          `[Orby] Failed to load shelf partial ${path} (HTTP ${res.status}). ` +
            'Use npm run dev (not python http.server) or npm run build.',
        );
      }
      const html = await res.text();
      const template = document.createElement('template');
      template.innerHTML = html;
      node.parentNode?.insertBefore(template.content, node);
      node.remove();
    }
    if (!document.querySelector('#hdriEnabled')) {
      throw new Error(
        '[Orby] Shelf panels failed to stitch — #hdriEnabled missing after partial load.',
      );
    }
  })()
    .catch((err) => {
      stitchPromise = null;
      throw err;
    });

  return stitchPromise;
}
