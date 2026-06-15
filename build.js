import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, cpSync, existsSync, rmSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { bundleMarketingCss } from './scripts/marketing/bundleMarketingCss.mjs';
import { buildFontAwesomeSubset } from './scripts/buildFontAwesomeSubset.mjs';
import { injectAllSubpageSiteNav } from './scripts/marketing/injectSubpageSiteNav.mjs';

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
  const v = line;
  return html
    .replace(
      /<div class="info-version-tag">[^<]+<\/div>/g,
      `<div class="info-version-tag">${banner}</div>`,
    )
    .replace(
      /<div class="dropzone-version-tag">[^<]+<\/div>/,
      `<div class="dropzone-version-tag">${banner}</div>`,
    )
    .replace(
      /src="\.\/scripts\/entry\.js(?:\?v=[^"]*)?"/,
      `src="./scripts/entry.js?v=${v}"`,
    )
    .replace(
      /<meta name="orby-version" content="[^"]*"\s*\/>/,
      `<meta name="orby-version" content="${v}" />`,
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

/** Public Turnstile site key; set TURNSTILE_SITE_KEY in CI to match TURNSTILE_SECRET_KEY on Vercel. */
function injectTurnstileSiteKey(html) {
  const key = process.env.TURNSTILE_SITE_KEY?.trim();
  if (!key) return html;
  const safe = key.replace(/"/g, '&quot;');
  return html.replace(
    /<meta\s+name="orby-turnstile-site-key"\s+content="[^"]*"\s*\/>/,
    `<meta name="orby-turnstile-site-key" content="${safe}" />`,
  );
}

/** Public stats API; ORBY_STATS_API_URL or derived from BUG_REPORT_API_URL (/api/stats). */
function injectStatsApiUrl(html) {
  let url = process.env.ORBY_STATS_API_URL?.trim();
  if (!url) {
    const bug = process.env.BUG_REPORT_API_URL?.trim();
    if (bug) url = bug.replace(/\/api\/bug-report\/?$/i, '/api/stats');
  }
  if (!url) return html;
  const safe = url.replace(/"/g, '&quot;');
  return html.replace(
    /<meta\s+name="orby-stats-api"\s+content="[^"]*"\s*\/>/,
    `<meta name="orby-stats-api" content="${safe}" />`,
  );
}

function injectStatsApiIntoHtmlTree(rootDir) {
  if (!existsSync(rootDir)) return;
  for (const name of readdirSync(rootDir)) {
    const full = join(rootDir, name);
    if (statSync(full).isDirectory()) {
      injectStatsApiIntoHtmlTree(full);
      continue;
    }
    if (!name.endsWith('.html')) continue;
    const html = readFileSync(full, 'utf-8');
    writeFileSync(full, injectStatsApiUrl(html));
  }
}

// Clean dist folder
const distDir = join(__dirname, 'dist');
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true });
}

const faSubset = await buildFontAwesomeSubset();
console.log(
  `🎯 Font Awesome subset (${faSubset.iconCount} icons, ${faSubset.cssBytes} CSS + ${faSubset.fontBytes} woff2)`,
);

// Build JavaScript bundle
// Note: Three.js is kept external (loaded via import map in HTML)
await esbuild.build({
  entryPoints: ['scripts/entry.js'],
  bundle: true,
  minify: true,
  sourcemap: false,
  format: 'esm',
  target: ['es2020'],
  outfile: 'dist/scripts/entry.js',
  external: ['three', 'opentype'], // Loaded via import map (vendor copy; not bundled — has Node fs paths)
  treeShaking: true,
  legalComments: 'none',
  banner: {
    js: '/* Orby - 3D Model Viewer - https://orby.studio */'
  }
});

// Standalone legal/docs pages (about, credits, privacy, …) — not part of entry.js
mkdirSync(join(distDir, 'scripts', 'marketing'), { recursive: true });
await esbuild.build({
  entryPoints: [join(__dirname, 'scripts', 'marketing', 'orbyMarketingScrollNav.js')],
  bundle: true,
  minify: true,
  sourcemap: false,
  format: 'esm',
  target: ['es2020'],
  outfile: join(distDir, 'scripts', 'marketing', 'orbyMarketingScrollNav.js'),
  treeShaking: true,
  legalComments: 'none',
});

mkdirSync(join(distDir, 'scripts'), { recursive: true });
cpSync(join(__dirname, 'scripts', 'orbyEntryGate.js'), join(distDir, 'scripts', 'orbyEntryGate.js'));
cpSync(
  join(__dirname, 'scripts', 'orbyMobileLandingBoot.js'),
  join(distDir, 'scripts', 'orbyMobileLandingBoot.js'),
);
cpSync(join(__dirname, 'scripts', 'orbyStatsBeacon.js'), join(distDir, 'scripts', 'orbyStatsBeacon.js'));

// Copy HTML (refresh version banners from VERSION for deterministic deploys)
const indexHtml = readFileSync('index.html', 'utf-8');
const updatedHtml = injectTurnstileSiteKey(
  injectStatsApiUrl(injectBugReportApiUrl(injectVersionIntoHtml(indexHtml))),
);
writeFileSync(join(distDir, 'index.html'), updatedHtml);
// GitHub Pages SPA fallback: serve app shell for unknown paths so route-aware
// client entry (scripts/entry.js) can render the in-app 404 experience.
writeFileSync(join(distDir, '404.html'), updatedHtml);

if (existsSync(join(__dirname, 'support'))) {
  cpSync('support', join(distDir, 'support'), { recursive: true });
  const supportIndexPath = join(distDir, 'support', 'index.html');
  if (existsSync(supportIndexPath)) {
    const supportHtml = readFileSync(join(__dirname, 'support', 'index.html'), 'utf-8');
    writeFileSync(
      supportIndexPath,
      injectTurnstileSiteKey(injectStatsApiUrl(injectBugReportApiUrl(supportHtml))),
    );
  }
}

// Copy assets
cpSync('assets', join(distDir, 'assets'), { recursive: true });
if (existsSync(join(__dirname, 'scripts', 'vendor'))) {
  cpSync(join(__dirname, 'scripts', 'vendor'), join(distDir, 'scripts', 'vendor'), {
    recursive: true,
  });
}
cpSync('styles.css', join(distDir, 'styles.css'));
if (existsSync(join(__dirname, 'partials'))) {
  cpSync(join(__dirname, 'partials'), join(distDir, 'partials'), { recursive: true });
}
/** Shelf partials linked from index.html — must land in dist for GitHub Pages. */
const SHELF_STYLE_PARTIALS = ['map-inspect.css', 'background-gradient.css'];
for (const name of SHELF_STYLE_PARTIALS) {
  const src = join(__dirname, 'styles', name);
  if (!existsSync(src)) continue;
  mkdirSync(join(distDir, 'styles'), { recursive: true });
  cpSync(src, join(distDir, 'styles', name));
}
if (existsSync(join(__dirname, 'styles', 'fontawesome', 'orby-icons.css'))) {
  mkdirSync(join(distDir, 'styles', 'fontawesome'), { recursive: true });
  cpSync(
    join(__dirname, 'styles', 'fontawesome', 'orby-icons.css'),
    join(distDir, 'styles', 'fontawesome', 'orby-icons.css'),
  );
}
if (existsSync(join(__dirname, 'styles', 'orby-home-padding-x.css'))) {
  mkdirSync(join(distDir, 'styles'), { recursive: true });
  cpSync(
    join(__dirname, 'styles', 'orby-home-padding-x.css'),
    join(distDir, 'styles', 'orby-home-padding-x.css'),
  );
}
if (existsSync(join(__dirname, 'styles', 'orby-brand-tokens.css'))) {
  mkdirSync(join(distDir, 'styles'), { recursive: true });
  cpSync(
    join(__dirname, 'styles', 'orby-brand-tokens.css'),
    join(distDir, 'styles', 'orby-brand-tokens.css'),
  );
}
if (existsSync(join(__dirname, 'styles', 'orby-mobile-landing-shell.css'))) {
  mkdirSync(join(distDir, 'styles'), { recursive: true });
  cpSync(
    join(__dirname, 'styles', 'orby-mobile-landing-shell.css'),
    join(distDir, 'styles', 'orby-mobile-landing-shell.css'),
  );
}
if (existsSync(join(__dirname, 'styles', 'orby-marketing.css'))) {
  mkdirSync(join(distDir, 'styles'), { recursive: true });
  const { bytes: marketingCssBytes } = await bundleMarketingCss({
    outPath: join(distDir, 'styles', 'orby-marketing.css'),
  });
  console.log(`📄 Bundled styles/orby-marketing.css (${marketingCssBytes} bytes)`);
}
/** Homepage scroll cue + lazy nav CSS — not in the marketing bundle entry. */
const MARKETING_DIST_PARTIALS = [
  '09-scroll-cue-responsive.css',
  '13-scroll-nav.css',
  '14-ultra-wide.css',
];
const marketingPartialsDir = join(__dirname, 'styles', 'marketing');
if (existsSync(marketingPartialsDir)) {
  const marketingDistDir = join(distDir, 'styles', 'marketing');
  mkdirSync(marketingDistDir, { recursive: true });
  for (const name of MARKETING_DIST_PARTIALS) {
    const src = join(marketingPartialsDir, name);
    if (existsSync(src)) cpSync(src, join(marketingDistDir, name));
  }
}
if (existsSync(join(__dirname, 'styles', 'orby-magic-btn.css'))) {
  mkdirSync(join(distDir, 'styles'), { recursive: true });
  cpSync(join(__dirname, 'styles', 'orby-magic-btn.css'), join(distDir, 'styles', 'orby-magic-btn.css'));
}
if (existsSync(join(__dirname, 'styles', 'orby-site-nav.css'))) {
  mkdirSync(join(distDir, 'styles'), { recursive: true });
  cpSync(join(__dirname, 'styles', 'orby-site-nav.css'), join(distDir, 'styles', 'orby-site-nav.css'));
}
if (existsSync(join(__dirname, 'styles', 'orby-ultra-wide-home.css'))) {
  mkdirSync(join(distDir, 'styles'), { recursive: true });
  cpSync(
    join(__dirname, 'styles', 'orby-ultra-wide-home.css'),
    join(distDir, 'styles', 'orby-ultra-wide-home.css'),
  );
}
if (existsSync(join(__dirname, 'styles', 'orby-home-padding-x.css'))) {
  mkdirSync(join(distDir, 'styles'), { recursive: true });
  cpSync(
    join(__dirname, 'styles', 'orby-home-padding-x.css'),
    join(distDir, 'styles', 'orby-home-padding-x.css'),
  );
}
cpSync('LICENSE', join(distDir, 'LICENSE'));
cpSync('ASSETS_LICENSE.md', join(distDir, 'ASSETS_LICENSE.md'));
if (existsSync(join(__dirname, 'legal'))) {
  cpSync('legal', join(distDir, 'legal'), { recursive: true });
  injectStatsApiIntoHtmlTree(join(distDir, 'legal'));
}
if (existsSync(join(__dirname, 'about'))) {
  cpSync('about', join(distDir, 'about'), { recursive: true });
  injectStatsApiIntoHtmlTree(join(distDir, 'about'));
}
if (existsSync(join(__dirname, 'credits'))) {
  cpSync('credits', join(distDir, 'credits'), { recursive: true });
  injectStatsApiIntoHtmlTree(join(distDir, 'credits'));
}
if (existsSync(join(__dirname, 'brand'))) {
  cpSync('brand', join(distDir, 'brand'), { recursive: true });
  injectStatsApiIntoHtmlTree(join(distDir, 'brand'));
}
if (existsSync(join(__dirname, 'stats'))) {
  cpSync('stats', join(distDir, 'stats'), { recursive: true });
  const statsIndexPath = join(distDir, 'stats', 'index.html');
  if (existsSync(statsIndexPath)) {
    const statsHtml = readFileSync(join(__dirname, 'stats', 'index.html'), 'utf-8');
    writeFileSync(statsIndexPath, injectStatsApiUrl(statsHtml));
  }
}

const { updated: subpageNavUpdated } = injectAllSubpageSiteNav({ root: distDir });
if (subpageNavUpdated > 0) {
  console.log(`🧭 Injected subpage site nav into ${subpageNavUpdated} HTML files`);
}

// Orby Mobile viewer at /mobile/app (landing stays at /mobile → index.html)
const mobileSrcDir = join(__dirname, 'apps', 'mobile');
if (existsSync(mobileSrcDir)) {
  const mobileDistDir = join(distDir, 'mobile', 'app');
  mkdirSync(join(mobileDistDir, 'styles'), { recursive: true });
  mkdirSync(join(mobileDistDir, 'scripts'), { recursive: true });
  await esbuild.build({
    entryPoints: [join(mobileSrcDir, 'scripts', 'main.js')],
    bundle: true,
    minify: true,
    sourcemap: false,
    format: 'esm',
    target: ['es2020'],
    outfile: join(mobileDistDir, 'scripts', 'main.js'),
    treeShaking: true,
    legalComments: 'none',
    external: ['three'],
    plugins: [
      {
        name: 'external-three-jsm',
        setup(build) {
          build.onResolve({ filter: /^three\// }, (args) => ({
            path: args.path,
            external: true,
          }));
          build.onResolve({ filter: /^https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.167\.0\// }, (args) => {
            const sub = args.path.replace('https://cdn.jsdelivr.net/npm/three@0.167.0/', '');
            if (sub === 'build/three.module.js') {
              return { path: 'three', external: true };
            }
            return { path: `three/${sub}`, external: true };
          });
        },
      },
    ],
    banner: {
      js: '/* Orby Mobile — https://orby.studio/mobile/app */',
    },
  });
  cpSync(join(mobileSrcDir, 'index.html'), join(mobileDistDir, 'index.html'));
  cpSync(join(mobileSrcDir, 'styles', 'mobile.css'), join(mobileDistDir, 'styles', 'mobile.css'));
  cpSync(join(distDir, 'index.html'), join(distDir, 'mobile', 'index.html'));
  console.log('📱 Orby Mobile bundle → dist/mobile/app/');
}

// Copy CNAME for GitHub Pages
if (existsSync('CNAME')) {
  cpSync('CNAME', join(distDir, 'CNAME'));
}

console.log('✅ Build complete! Output in dist/ folder');
console.log('📦 Minified bundle created');
console.log('🚀 Ready to deploy');
