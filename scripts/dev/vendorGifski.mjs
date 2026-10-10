/**
 * Bundle gifski-wasm for the browser (no Vite). Run from build.js and after npm install.
 * Usage: node scripts/dev/vendorGifski.mjs
 */
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = join(root, 'scripts/vendor/gifski');

mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: [join(root, 'node_modules/gifski-wasm/dist/encode.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile: join(outDir, 'gifski-wasm.module.js'),
  legalComments: 'none',
});

cpSync(
  join(root, 'node_modules/gifski-wasm/pkg/gifski_wasm_bg.wasm'),
  join(outDir, 'gifski_wasm_bg.wasm'),
);

console.log('🎯 Vendored gifski-wasm → scripts/vendor/gifski');
