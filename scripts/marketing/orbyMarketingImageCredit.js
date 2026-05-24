/**
 * Marketing HTML helpers — attribute/text escaping and lower-third credits.
 */

/**
 * Escape text for HTML attributes and text nodes in marketing templates.
 * @param {string} text
 */
export function escapeMarketingHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Escape body copy and wrap phrase matches in animated brand gradient spans.
 * Phrases are matched literally in order; overlapping phrases are not supported.
 * @param {string} text
 * @param {readonly string[]} [gradientPhrases]
 */
export function renderMarketingBodyHtml(text, gradientPhrases = []) {
  const raw = String(text ?? '');
  const phrases = gradientPhrases?.filter(Boolean) ?? [];
  if (!phrases.length) return escapeMarketingHtml(raw);

  /** @type {{ type: 'text' | 'gradient', value: string }[]} */
  let segments = [{ type: 'text', value: raw }];

  for (const phrase of phrases) {
    /** @type {{ type: 'text' | 'gradient', value: string }[]} */
    const next = [];
    for (const segment of segments) {
      if (segment.type !== 'text') {
        next.push(segment);
        continue;
      }
      let cursor = 0;
      const haystack = segment.value;
      let index = haystack.indexOf(phrase);
      if (index === -1) {
        next.push(segment);
        continue;
      }
      while (index !== -1) {
        if (index > cursor) {
          next.push({ type: 'text', value: haystack.slice(cursor, index) });
        }
        next.push({ type: 'gradient', value: phrase });
        cursor = index + phrase.length;
        index = haystack.indexOf(phrase, cursor);
      }
      if (cursor < haystack.length) {
        next.push({ type: 'text', value: haystack.slice(cursor) });
      }
    }
    segments = next;
  }

  return segments
    .map((segment) =>
      segment.type === 'gradient'
        ? `<span class="orby-marketing__gradient-text">${escapeMarketingHtml(segment.value)}</span>`
        : escapeMarketingHtml(segment.value),
    )
    .join('');
}

/**
 * @param {import('./orbyMarketingContent.js').MarketingImageCredit | undefined} credit
 * @returns {string}
 */
export function formatMarketingImageCreditHtml(credit) {
  if (!credit?.title && !credit?.artist && !credit?.sourceLabel) return '';
  const parts = [];
  if (credit.title) parts.push(escapeMarketingHtml(credit.title));
  if (credit.artist) parts.push(escapeMarketingHtml(credit.artist));
  let body = parts.join(' · ');
  if (credit.sourceLabel) {
    const label = escapeMarketingHtml(credit.sourceLabel);
    const viaTarget = credit.sourceHref
      ? `<a class="orby-marketing__media-credit-link" href="${escapeMarketingHtml(credit.sourceHref)}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : label;
    body = body ? `${body} · via ${viaTarget}` : `via ${viaTarget}`;
  }
  return body;
}
