/**
 * Flatten styles/orby-marketing.css @import chain into one file for production.
 * Dev keeps partials + @imports; build.js writes dist/styles/orby-marketing.css.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../..');
const entryPath = join(repoRoot, 'styles/orby-marketing.css');
const defaultOutPath = join(repoRoot, 'dist/styles/orby-marketing.css');

const IMPORT_RE = /@import\s+url\(['"]?([^'")]+)['"]?\)\s*;/g;

/**
 * @param {string} css
 * @param {string} fromDir
 * @param {string} outPath
 */
function rewriteUrls(css, fromDir, outPath) {
  const toDir = dirname(outPath);
  const assetsRoot = join(repoRoot, 'assets');

  return css.replace(/url\((['"]?)([^'")]+)\1\)/g, (match, quote, urlPath) => {
    const trimmed = urlPath.trim();
    if (
      !trimmed ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('#')
    ) {
      return match;
    }
    const abs = resolve(fromDir, trimmed);

    if (abs === assetsRoot || abs.startsWith(`${assetsRoot}/`)) {
      const withinAssets = relative(assetsRoot, abs).replace(/\\/g, '/');
      const rel = `../assets/${withinAssets}`;
      return `url(${quote}${rel}${quote})`;
    }

    let rel = relative(toDir, abs).replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return `url(${quote}${rel}${quote})`;
  });
}

/**
 * @param {string} filePath
 * @param {string} outPath
 * @param {Set<string>} seen
 */
function bundleFile(filePath, outPath, seen) {
  const absPath = resolve(filePath);
  if (seen.has(absPath)) return '';
  seen.add(absPath);

  const dir = dirname(absPath);
  let css = readFileSync(absPath, 'utf8');

  css = css.replace(IMPORT_RE, (_full, importPath) => {
    const imported = resolve(dir, importPath);
    const bundled = bundleFile(imported, outPath, seen);
    const rel = relative(repoRoot, imported).replace(/\\/g, '/');
    return `/* @import ${rel} */\n${bundled}\n`;
  });

  return rewriteUrls(css, dir, outPath);
}

/**
 * @param {{ outPath?: string, minify?: boolean }} [options]
 * @returns {Promise<{ outPath: string, bytes: number }>}
 */
export async function bundleMarketingCss(options = {}) {
  const outPath = options.outPath ?? defaultOutPath;
  const minify = options.minify !== false;

  mkdirSync(dirname(outPath), { recursive: true });

  let css = `/* Bundled from styles/orby-marketing.css — do not edit */\n${bundleFile(
    entryPath,
    outPath,
    new Set(),
  )}`;

  if (minify) {
    const result = await esbuild.transform(css, {
      loader: 'css',
      minify: true,
    });
    css = result.code;
  }

  writeFileSync(outPath, css);
  return { outPath, bytes: Buffer.byteLength(css, 'utf8') };
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const { outPath, bytes } = await bundleMarketingCss();
  console.log(`Wrote ${relative(repoRoot, outPath)} (${bytes} bytes)`);
}
