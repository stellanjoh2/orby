import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stitchIndexHtml, readStitchedIndexHtml } from './stitchIndexHtml.mjs';
import { stampStitchedHtmlBanner, STITCHED_HTML_BANNER } from './stitchIndexInclude.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

test('stitchIndexHtml resolves shelf panel includes', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf-8');
  assert.match(html, /@include partials\/shelf-panels\/shelf-panel-mesh\.html/);

  const stitched = stitchIndexHtml(html, root);
  assert.doesNotMatch(stitched, /@include/);
  assert.match(stitched, /data-panel="mesh"/);
  assert.match(stitched, /data-panel="studio"/);
  assert.match(stitched, /data-panel="render"/);
  assert.match(stitched, /data-panel="export"/);
  assert.match(stitched, /data-panel="info"/);
  assert.match(stitched, /id="exportImageSectionOpen"/);
});

test('readStitchedIndexHtml matches stitchIndexHtml on index shell', () => {
  const indexPath = join(root, 'index.html');
  const stitched = readStitchedIndexHtml(indexPath);
  const manual = stitchIndexHtml(readFileSync(indexPath, 'utf-8'), root);
  assert.equal(stitched, manual);
});

test('stampStitchedHtmlBanner prepends generated notice after doctype', () => {
  const html = '<!DOCTYPE html>\n<html lang="en"></html>';
  const stamped = stampStitchedHtmlBanner(html);
  assert.ok(stamped.startsWith(`<!DOCTYPE html>\n${STITCHED_HTML_BANNER}\n`));
  assert.equal(stampStitchedHtmlBanner(stamped), stamped);
});
