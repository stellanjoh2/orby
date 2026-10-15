import test from 'node:test';
import assert from 'node:assert/strict';
import { toSeoSafeNotFoundHtml } from './seoSafeNotFoundHtml.js';

const SAMPLE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="description"
      content="Free browser-based 3D viewer and virtual studio."
    />
    <link rel="canonical" href="https://orby.studio/" />
    <meta property="og:title" content="Orby — 3D viewer" />
    <meta property="og:description" content="Drop a GLB or SVG." />
    <meta name="twitter:title" content="Orby — 3D viewer" />
    <meta name="twitter:description" content="Drop a GLB or SVG." />
    <title>Orby — 3D viewer and virtual studio in the browser</title>
    <script type="application/ld+json">
      { "@context": "https://schema.org", "@type": "WebApplication", "name": "Orby" }
    </script>
    <script src="./scripts/entry.js"></script>
  </head>
  <body></body>
</html>`;

test('toSeoSafeNotFoundHtml marks 404 for crawlers without stripping the app shell', () => {
  const out = toSeoSafeNotFoundHtml(SAMPLE);
  assert.match(out, /name="robots" content="noindex, follow"/);
  assert.match(out, /<title>Page not found — Orby<\/title>/);
  assert.match(out, /This Orby page could not be found/);
  assert.doesNotMatch(out, /rel="canonical"/);
  assert.doesNotMatch(out, /application\/ld\+json/);
  assert.match(out, /scripts\/entry\.js/);
  assert.match(out, /property="og:title" content="Page not found — Orby"/);
});

test('toSeoSafeNotFoundHtml replaces an existing robots meta', () => {
  const withRobots = SAMPLE.replace(
    '<meta charset="UTF-8" />',
    '<meta charset="UTF-8" />\n    <meta name="robots" content="index, follow" />',
  );
  const out = toSeoSafeNotFoundHtml(withRobots);
  assert.match(out, /name="robots" content="noindex, follow"/);
  assert.equal((out.match(/name="robots"/g) || []).length, 1);
});
