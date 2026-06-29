import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, cpSync, existsSync, rmSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { bundleMarketingCss } from './scripts/marketing/bundleMarketingCss.mjs';
import { buildFontAwesomeSubset } from './scripts/buildFontAwesomeSubset.mjs';
import { injectAllSubpageSiteNav } from './scripts/marketing/injectSubpageSiteNav.mjs';
import { readStitchedIndexHtml } from './scripts/stitchIndexHtml.mjs';
import { stampStitchedHtmlBanner } from './scripts/stitchIndexInclude.js';

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

function injectMobileAssetCacheBust(html, version) {
  const v = encodeURIComponent(version.trim());
  return html
    .replace(
      '<meta name="orby-mobile-asset-base"',
      `<meta name="orby-mobile-build" content="${version.trim()}" />\n    <meta name="orby-mobile-asset-base"`,
    )
    .replace('href="styles/mobile.css"', `href="styles/mobile.css?v=${v}"`)
    .replace('src="scripts/main.js"', `src="scripts/main.js?v=${v}"`);
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
      /href="\.\/styles\.css(?:\?v=[^"]*)?"/,
      `href="./styles.css?v=${v}"`,
    )
    .replace(
      /href="\/styles\.css(?:\?v=[^"]*)?"/,
      `href="/styles.css?v=${v}"`,
    )
    .replace(
      /src="\.\/scripts\/entry\.js(?:\?v=[^"]*)?"/,
      `src="./scripts/entry.js?v=${v}"`,
    )
    .replace(
      /src="\/scripts\/mobileLearnBoot\.js(?:\?v=[^"]*)?"/,
      `src="/scripts/mobileLearnBoot.js?v=${v}"`,
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

// Browser ESM vendor (dev serves raw modules — no bare npm specifier resolution).
mkdirSync(join(__dirname, 'scripts', 'vendor'), { recursive: true });
await esbuild.build({
  entryPoints: [join(__dirname, 'node_modules', 'cdt2d', 'cdt2d.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile: join(__dirname, 'scripts', 'vendor', 'cdt2d.module.js'),
  legalComments: 'none',
});

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
cpSync(
  join(__dirname, 'scripts', 'orbyMarketingPerformanceBoot.js'),
  join(distDir, 'scripts', 'orbyMarketingPerformanceBoot.js'),
);

await esbuild.build({
  entryPoints: ['scripts/mobileLearnBoot.js'],
  bundle: true,
  minify: true,
  sourcemap: false,
  format: 'esm',
  target: ['es2020'],
  outfile: join(distDir, 'scripts', 'mobileLearnBoot.js'),
  treeShaking: true,
  legalComments: 'none',
  banner: {
    js: '/* Orby Mobile learn — https://orby.studio/mobile/learn */',
  },
});

// Copy HTML (stitch shelf partials, then refresh version banners for deterministic deploys)
const indexHtml = readStitchedIndexHtml(join(__dirname, 'index.html'));
const updatedHtml = stampStitchedHtmlBanner(
  injectTurnstileSiteKey(
    injectStatsApiUrl(injectBugReportApiUrl(injectVersionIntoHtml(indexHtml))),
  ),
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
const SHELF_STYLE_PARTIALS = ['map-inspect.css', 'background-gradient.css', 'background-image.css'];
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
  '15-mobile.css',
  '15-subpage-mobile-nav.css',
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
if (existsSync(join(__dirname, 'styles', 'orby-entry-gate.css'))) {
  mkdirSync(join(distDir, 'styles'), { recursive: true });
  cpSync(join(__dirname, 'styles', 'orby-entry-gate.css'), join(distDir, 'styles', 'orby-entry-gate.css'));
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

// Orby Mobile — minimal gate at /mobile, viewer at /mobile/app, marketing at /mobile/learn
const mobileSrcDir = join(__dirname, 'apps', 'mobile');
if (existsSync(mobileSrcDir)) {
  const mobileGateDir = join(distDir, 'mobile');
  const mobileLandingSrc = join(mobileSrcDir, 'landing');
  mkdirSync(join(mobileGateDir, 'styles'), { recursive: true });
  mkdirSync(join(mobileGateDir, 'scripts'), { recursive: true });

  if (existsSync(mobileLandingSrc)) {
    await esbuild.build({
      entryPoints: [join(mobileLandingSrc, 'main.js')],
      bundle: true,
      minify: true,
      sourcemap: false,
      format: 'esm',
      target: ['es2020'],
      outfile: join(mobileGateDir, 'scripts', 'landing.js'),
      treeShaking: true,
      legalComments: 'none',
      banner: {
        js: '/* Orby Mobile gate — https://orby.studio/mobile */',
      },
    });
    cpSync(join(mobileLandingSrc, 'index.html'), join(mobileGateDir, 'index.html'));
    cpSync(join(mobileLandingSrc, 'landing.css'), join(mobileGateDir, 'styles', 'landing.css'));
    console.log('📱 Orby Mobile gate → dist/mobile/');
  }

  const mobileLearnDir = join(mobileGateDir, 'learn');
  mkdirSync(mobileLearnDir, { recursive: true });
  const mobileLearnTemplate = join(mobileSrcDir, 'learn', 'index.html');
  if (existsSync(mobileLearnTemplate)) {
    const mobileLearnHtml = injectTurnstileSiteKey(
      injectStatsApiUrl(injectBugReportApiUrl(injectVersionIntoHtml(readFileSync(mobileLearnTemplate, 'utf-8')))),
    );
    writeFileSync(join(mobileLearnDir, 'index.html'), mobileLearnHtml);
  } else {
    writeFileSync(join(mobileLearnDir, 'index.html'), updatedHtml);
  }
  console.log('📱 Orby Mobile learn → dist/mobile/learn/');

  const mobileDistDir = join(mobileGateDir, 'app');
  mkdirSync(join(mobileDistDir, 'styles'), { recursive: true });
  mkdirSync(join(mobileDistDir, 'scripts', 'chunks'), { recursive: true });
  await esbuild.build({
    entryPoints: [join(mobileSrcDir, 'scripts', 'main.js')],
    bundle: true,
    minify: true,
    sourcemap: false,
    format: 'esm',
    target: ['es2020'],
    outdir: join(mobileDistDir, 'scripts'),
    splitting: true,
    entryNames: '[name]',
    chunkNames: 'chunks/[name]-[hash]',
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
  const mobileVersionPath = join(__dirname, 'VERSION');
  if (existsSync(mobileVersionPath)) {
    const mobileVersion = readFileSync(mobileVersionPath, 'utf-8').trim();
    const mobileIndexRaw = readFileSync(join(mobileDistDir, 'index.html'), 'utf-8');
    writeFileSync(
      join(mobileDistDir, 'index.html'),
      injectMobileAssetCacheBust(mobileIndexRaw, mobileVersion),
    );
  }
  console.log('📱 Orby Mobile viewer → dist/mobile/app/');
}

// Copy CNAME for GitHub Pages
if (existsSync('CNAME')) {
  cpSync('CNAME', join(distDir, 'CNAME'));
}

console.log('✅ Build complete! Output in dist/ folder');
console.log('📦 Minified bundle created');
console.log('🚀 Ready to deploy');
