/** PostScript names tried before scanning the full system list. */
export const DEFAULT_FONT_POSTSCRIPT_CANDIDATES = [
  'ArialMT',
  'Arial-Regular',
  'Arial',
  'ArialUnicodeMS',
  'Helvetica',
  'HelveticaNeue',
  'Helvetica Neue',
  'LiberationSans-Regular',
  'LiberationSans',
  'DejaVuSans',
  'DejaVu Sans',
];

/** Family display names (lowercase) when resolving from grouped Local Font Access data. */
export const DEFAULT_FONT_FAMILY_NAMES = [
  'arial',
  'helvetica',
  'helvetica neue',
  'liberation sans',
  'deja vu sans',
  'dejavu sans',
];

/**
 * @param {Array<{ family?: string, defaultPostscriptName?: string, variants?: Array<{ postscriptName?: string, styleLabel?: string, styleRaw?: string }> }>} families
 * @returns {string | null}
 */
export function pickDefaultPostscriptFromFamilies(families) {
  if (!Array.isArray(families) || families.length === 0) return null;

  for (const wanted of DEFAULT_FONT_FAMILY_NAMES) {
    const group = families.find((entry) => {
      const name = String(entry?.family || '').trim().toLowerCase();
      return name === wanted || name.startsWith(`${wanted} `);
    });
    if (!group) continue;
    const regular =
      group.variants?.find((variant) => {
        const label = `${variant.styleLabel || ''} ${variant.styleRaw || ''}`.toLowerCase();
        return /\b(regular|book|roman|normal|plain)\b/.test(label) &&
          !/\b(bold|italic|oblique|black|heavy|light|thin)\b/.test(label);
      }) ?? group.variants?.[0];
    return regular?.postscriptName || group.defaultPostscriptName || null;
  }

  return families[0]?.defaultPostscriptName ?? null;
}

/**
 * Resolve Arial (or closest system sans) for auto-load on font panel open.
 * @returns {Promise<string | null>}
 */
export async function resolveDefaultFontPostscript() {
  if (typeof window === 'undefined' || typeof window.queryLocalFonts !== 'function') {
    return null;
  }

  try {
    const direct = await window.queryLocalFonts({
      postscriptNames: DEFAULT_FONT_POSTSCRIPT_CANDIDATES,
    });
    if (direct?.length) {
      return direct[0].postscriptName || null;
    }
  } catch {
    // Permission denied or unsupported filter — fall through to full list.
  }

  try {
    const all = await window.queryLocalFonts();
    if (!all?.length) return null;

    /** @type {Map<string, { family: string, defaultPostscriptName: string, variants: Array<{ postscriptName: string, styleLabel: string, styleRaw: string }> }>} */
    const byFamily = new Map();
    for (const entry of all) {
      const family = String(entry.family || entry.fullName || '').trim();
      const postscriptName = entry.postscriptName || entry.fullName;
      if (!family || !postscriptName) continue;
      const key = family.toLowerCase();
      const variant = {
        postscriptName,
        styleLabel: String(entry.style || entry.fullName || 'Regular'),
        styleRaw: String(entry.style || ''),
      };
      const prev = byFamily.get(key);
      if (!prev) {
        byFamily.set(key, {
          family,
          defaultPostscriptName: postscriptName,
          variants: [variant],
        });
      } else {
        prev.variants.push(variant);
      }
    }

    return pickDefaultPostscriptFromFamilies([...byFamily.values()]);
  } catch {
    return null;
  }
}
