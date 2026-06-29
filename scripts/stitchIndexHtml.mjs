/**
 * Resolve `<!-- @include relative/path -->` markers in index.html at build/dev serve time.
 * Shelf panel markup lives in partials/shelf-panels/*.html — edit those, not duplicated blocks.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { INCLUDE_PATH_RE } from './stitchIndexInclude.js';

const INCLUDE_RE = INCLUDE_PATH_RE;

/**
 * @param {string} html
 * @param {string} [rootDir] — project root (directory containing index.html)
 * @returns {string}
 */
export function stitchIndexHtml(html, rootDir = process.cwd()) {
  const root = resolve(rootDir);
  return html.replace(INCLUDE_RE, (match, relPath) => {
    const filePath = resolve(root, relPath);
    if (!existsSync(filePath)) {
      throw new Error(`[stitchIndexHtml] Missing include: ${relPath} (resolved ${filePath})`);
    }
    const fragment = readFileSync(filePath, 'utf-8');
    // Nested includes (e.g. partial inside partial) — rare but supported.
    return fragment.includes('@include') ? stitchIndexHtml(fragment, root) : fragment;
  });
}

/**
 * @param {string} indexPath — absolute or relative path to index.html
 * @returns {string}
 */
export function readStitchedIndexHtml(indexPath) {
  const abs = resolve(indexPath);
  const root = dirname(abs);
  return stitchIndexHtml(readFileSync(abs, 'utf-8'), root);
}
