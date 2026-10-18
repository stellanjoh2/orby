/**
 * GitHub Pages serves `404.html` for unknown paths (HTTP 404). Keep the app shell
 * for the in-app 404 experience, but remove homepage SEO signals so crawlers do
 * not treat missing URLs as soft copies of `/`.
 * @param {string} html
 * @returns {string}
 */
export function toSeoSafeNotFoundHtml(html) {
  let out = String(html ?? '');
  if (!/<meta\s+name="robots"/i.test(out)) {
    out = out.replace(
      /<meta charset="UTF-8"\s*\/>/,
      '<meta charset="UTF-8" />\n    <meta name="robots" content="noindex, follow" />',
    );
  } else {
    out = out.replace(
      /<meta\s+name="robots"\s+content="[^"]*"\s*\/>/i,
      '<meta name="robots" content="noindex, follow" />',
    );
  }
  out = out.replace(
    /<title>[^<]*<\/title>/i,
    '<title>Page not found — Orby</title>',
  );
  out = out.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/>/i,
    '<meta name="description" content="This Orby page could not be found." />',
  );
  out = out.replace(/\s*<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/i, '');
  out = out.replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/i, '');
  out = out.replace(
    /(<meta\s+property="og:title"\s+content=")[^"]*("\s*\/>)/i,
    '$1Page not found — Orby$2',
  );
  out = out.replace(
    /(<meta\s+property="og:description"\s+content=")[^"]*("\s*\/>)/i,
    '$1This Orby page could not be found.$2',
  );
  out = out.replace(
    /(<meta\s+name="twitter:title"\s+content=")[^"]*("\s*\/>)/i,
    '$1Page not found — Orby$2',
  );
  out = out.replace(
    /(<meta\s+name="twitter:description"\s+content=")[^"]*("\s*\/>)/i,
    '$1This Orby page could not be found.$2',
  );
  return out;
}
