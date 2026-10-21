/**
 * Bundle prores-wasm-encoder for the browser (no Vite). Run from build.js and after npm install.
 * Usage: node scripts/dev/vendorProres.mjs
 *
 * Node builtins stay external — the browser never hits those Emscripten branches.
 * LGPL-2.1+: LICENSE is copied beside the modules.
 */
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = join(root, 'scripts/vendor/prores');
const pkgDir = join(root, 'node_modules/prores-wasm-encoder');

mkdirSync(outDir, { recursive: true });

const shared = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  legalComments: 'inline',
  external: ['module', 'fs', 'path', 'url'],
};

await esbuild.build({
  ...shared,
  entryPoints: [join(pkgDir, 'dist/prores-encoder-parallel.mjs')],
  outfile: join(outDir, 'prores-encoder-parallel.module.js'),
});

await esbuild.build({
  ...shared,
  entryPoints: [join(pkgDir, 'dist/prores-encoder.mjs')],
  outfile: join(outDir, 'prores-encoder.module.js'),
});

cpSync(join(pkgDir, 'LICENSE'), join(outDir, 'LICENSE'));

console.log('🎯 Vendored prores-wasm-encoder → scripts/vendor/prores');
