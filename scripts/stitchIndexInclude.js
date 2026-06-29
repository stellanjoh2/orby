/** Shared `@include` markers for shelf partial stitch (browser + Node). */
export const INCLUDE_PATH_RE = /<!--\s*@include\s+([^\s]+)\s*-->/g;
/** Comment-node text inside a live DOM `.panels` container. */
export const INCLUDE_COMMENT_RE = /@include\s+([^\s]+)/;

/** Prepended to stitched dist HTML so prod debugging edits aren’t mistaken for source. */
export const STITCHED_HTML_BANNER =
  '<!-- GENERATED — do not edit. Edit index.html + partials/, then npm run build. -->';

/**
 * @param {string} html
 * @returns {string}
 */
export function stampStitchedHtmlBanner(html) {
  if (html.includes(STITCHED_HTML_BANNER)) return html;
  return html.replace(/^<!DOCTYPE html>\s*/i, `<!DOCTYPE html>\n${STITCHED_HTML_BANNER}\n`);
}
