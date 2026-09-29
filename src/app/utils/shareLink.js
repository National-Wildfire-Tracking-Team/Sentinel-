/**
 * shareLink.js
 * Native share sheet with a clipboard fallback, for share buttons that live
 * outside FireDetailPanel (e.g. the reporter dashboard).
 */

/**
 * Share `{ title, text, url }` via the Web Share API when the browser can
 * handle the payload, otherwise copy "text\nurl" to the clipboard.
 *
 * @returns {Promise<string>} Short status for the UI ('' when the user
 *   dismissed the share sheet).
 */
export async function shareOrCopy(payload) {
  const canUseNativeShare =
    typeof navigator.share === 'function' &&
    (typeof navigator.canShare !== 'function' || navigator.canShare(payload));

  if (canUseNativeShare) {
    try {
      await navigator.share(payload);
      return 'Shared';
    } catch (err) {
      if (err?.name === 'AbortError') return '';
      // Any other failure falls through to the clipboard.
    }
  }

  try {
    if (!navigator.clipboard?.writeText) return 'Sharing unavailable';
    await navigator.clipboard.writeText(`${payload.text}\n${payload.url}`);
    return 'Link copied';
  } catch {
    return 'Copy failed';
  }
}

/** Deep link that opens a hazard event report on the live map. */
export function hazardEventShareUrl(eventId) {
  const url = new URL('/', window.location.origin);
  url.searchParams.set('incident', eventId);
  return url.toString();
}
