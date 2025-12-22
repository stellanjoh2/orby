import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, cpSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Clean dist folder
const distDir = join(__dirname, 'dist');
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true });
}

// Build JavaScript bundle
// Note: Three.js is kept external (loaded via import map in HTML)
await esbuild.build({
  entryPoints: ['scripts/main.js'],
  bundle: true,
  minify: true,
  sourcemap: false,
  format: 'esm',
  target: ['es2020'],
  outfile: 'dist/scripts/main.js',
  external: ['three'], // Keep Three.js external (loaded via import map)
  treeShaking: true,
  legalComments: 'none',
  banner: {
    js: '/* Orby - 3D Model Viewer - https://orby.studio */'
  }
});

// Copy HTML and replace script reference
const indexHtml = readFileSync('index.html', 'utf-8');
const updatedHtml = indexHtml.replace(
  '<script type="module" src="./scripts/main.js"></script>',
  '<script type="module" src="./scripts/main.js"></script>'
);
writeFileSync(join(distDir, 'index.html'), updatedHtml);

// Copy assets
cpSync('assets', join(distDir, 'assets'), { recursive: true });
cpSync('styles.css', join(distDir, 'styles.css'));
cpSync('LICENSE', join(distDir, 'LICENSE'));
cpSync('ASSETS_LICENSE.md', join(distDir, 'ASSETS_LICENSE.md'));

// Copy CNAME for GitHub Pages
if (existsSync('CNAME')) {
  cpSync('CNAME', join(distDir, 'CNAME'));
}

console.log('✅ Build complete! Output in dist/ folder');
console.log('📦 Minified bundle created');
console.log('🚀 Ready to deploy');
