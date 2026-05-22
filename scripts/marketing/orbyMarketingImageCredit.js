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
