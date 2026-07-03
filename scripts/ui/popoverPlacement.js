/** @typedef {{ clientX: number, clientY: number }} PopoverClickPoint */

const GAP_PX = 8;
const VIEWPORT_PAD_PX = 8;
/** Prefer opening over the viewport/scene, not the right screen edge. */
const SCENE_SIDE_GAP_PX = 8;
const RIGHT_EDGE_PENALTY_PX = 24;

/**
 * Resolve a stable anchor rect for popover placement.
 * Falls back to the shelf row, then the click point.
 *
 * @param {HTMLElement} anchor
 * @param {PopoverClickPoint | null | undefined} click
 */
export function getPopoverAnchorRect(anchor, click) {
  const primary = anchor.getBoundingClientRect();
  if (primary.width > 0 || primary.height > 0) return primary;

  const row = anchor.closest('.color-line, .select-line, label');
  if (row instanceof HTMLElement) {
    const rowRect = row.getBoundingClientRect();
    if (rowRect.width > 0 || rowRect.height > 0) return rowRect;
  }

  if (click) {
    return new DOMRect(click.clientX, click.clientY, 0, 0);
  }

  return primary;
}

/**
 * Figma / Adobe-style popover placement — top-aligned with the anchor, biased left
 * over the scene (shelf color chips sit on the right). Flips above when needed.
 *
 * @param {DOMRect} anchorRect
 * @param {{ width: number, height: number }} panel
 * @param {PopoverClickPoint | null | undefined} [click]
 */
export function computePopoverPlacement(anchorRect, panel, click) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = VIEWPORT_PAD_PX;
  const gap = GAP_PX;
  const { width, height } = panel;

  const anchorRight = anchorRect.width > 0 ? anchorRect.right : (click?.clientX ?? anchorRect.left);
  const anchorLeft = anchorRect.width > 0 ? anchorRect.left : anchorRight;
  const anchorTop = anchorRect.height > 0 ? anchorRect.top : (click?.clientY ?? anchorRect.top);
  const anchorBottom = anchorRect.height > 0 ? anchorRect.bottom : anchorTop;

  const minLeft = pad;
  const maxLeft = Math.max(minLeft, vw - width - pad);
  const minTop = pad;
  const maxTop = Math.max(minTop, vh - height - pad);

  const candidates = [
    { top: anchorTop, left: anchorLeft - width - SCENE_SIDE_GAP_PX, align: 'scene-top' },
    { top: anchorTop, left: anchorRight - width, align: 'end-top' },
    { top: anchorTop - height - gap, left: anchorLeft - width - SCENE_SIDE_GAP_PX, align: 'scene-above' },
    { top: anchorTop - height - gap, left: anchorRight - width, align: 'end-above' },
    { top: anchorBottom + gap, left: anchorLeft - width - SCENE_SIDE_GAP_PX, align: 'scene-below' },
  ];

  /** @param {{ top: number, left: number }} pos */
  const clamp = (pos) => ({
    top: Math.max(minTop, Math.min(pos.top, maxTop)),
    left: Math.max(minLeft, Math.min(pos.left, maxLeft)),
  });

  /** @param {{ top: number, left: number }} pos */
  const overlapsAnchorX = (pos) => {
    const panelRight = pos.left + width;
    return panelRight > anchorLeft && pos.left < anchorRight;
  };

  /** @param {{ top: number, left: number, align?: string }} candidate */
  const score = (candidate) => {
    const clamped = clamp(candidate);
    let value = 0;

    const topAligned = Math.abs(clamped.top - anchorTop) < 1;
    const below = clamped.top >= anchorBottom - 1;
    const above = clamped.top + height <= anchorTop + 1;
    if (topAligned) value += 1200;
    else if (above) value += 500;
    else if (below) value += 300;

    if (candidate.align?.startsWith('scene')) value += 400;

    if (overlapsAnchorX(clamped)) value += 120;

    const panelRight = clamped.left + width;
    const rightEdgeOverflow = panelRight - (vw - pad - RIGHT_EDGE_PENALTY_PX);
    if (rightEdgeOverflow > 0) value -= rightEdgeOverflow * 3;

    const anchorCenterX = (anchorLeft + anchorRight) / 2;
    const panelCenterX = clamped.left + width / 2;
    value -= Math.abs(panelCenterX - anchorCenterX) * 0.25;

    value -= Math.abs(clamped.top - anchorTop) * 0.5;

    return value;
  };

  let best = clamp(candidates[0]);
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const clamped = clamp(candidate);
    const nextScore = score({ ...clamped, align: candidate.align });
    if (nextScore > bestScore) {
      best = clamped;
      bestScore = nextScore;
    }
  }

  return {
    left: Math.round(best.left),
    top: Math.round(best.top),
  };
}

/**
 * @param {HTMLElement | null | undefined} anchor
 * @returns {Array<EventTarget>}
 */
export function collectScrollContainers(anchor) {
  /** @type {EventTarget[]} */
  const targets = [window];
  if (!anchor) return targets;

  let node = anchor.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    const scrollable =
      /(auto|scroll|overlay)/.test(style.overflowY) ||
      /(auto|scroll|overlay)/.test(style.overflowX) ||
      /(auto|scroll|overlay)/.test(style.overflow);
    if (scrollable) targets.push(node);
    node = node.parentElement;
  }

  return targets;
}
