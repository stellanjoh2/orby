import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, cpSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Match scripts/update-version.js display format (CI may build before index.html is re-synced). */
function formatVersionBanner(versionLine) {
  const v = versionLine.trim();
  const iso = new Date().toISOString();
  const utcDate = iso.split('T')[0];
  const utcTime = `${iso.split('T')[1].split('.')[0]} UTC`;
  return `v${v} · ${utcDate} ${utcTime}`;
}

function injectVersionIntoHtml(html) {
  const versionPath = join(__dirname, 'VERSION');
  if (!existsSync(versionPath)) return html;
  const line = readFileSync(versionPath, 'utf-8').trim();
  if (!/^\d+\.\d+\.\d+$/.test(line)) return html;
  const banner = formatVersionBanner(line);
  return html
    .replace(
      /<div class="info-version-tag">[^<]+<\/div>/,
      `<div class="info-version-tag">${banner}</div>`,
    )
    .replace(
      /<div class="dropzone-version-tag">[^<]+<\/div>/,
      `<div class="dropzone-version-tag">${banner}</div>`,
    );
}

/** GitHub Pages is static; set BUG_REPORT_API_URL in Actions (repo variable) to your Vercel /api/bug-report URL. */
function injectBugReportApiUrl(html) {
  const url = process.env.BUG_REPORT_API_URL?.trim();
  if (!url) return html;
  const safe = url.replace(/"/g, '&quot;');
  return html.replace(
    /<meta\s+name="orby-bug-report-api"\s+content="[^"]*"\s*\/>/,
    `<meta name="orby-bug-report-api" content="${safe}" />`,
  );
}

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

// Copy HTML (refresh version banners from VERSION for deterministic deploys)
const indexHtml = readFileSync('index.html', 'utf-8');
const updatedHtml = injectBugReportApiUrl(injectVersionIntoHtml(indexHtml));
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
