/**
 * safeUrl.js
 * Guards user-controlled URLs before they are written to the DB or rendered
 * as <a href> / <img src>. Only absolute http(s) URLs are treated as safe.
 */

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isSafeHttpUrl(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Filter a photo_urls array down to absolute http(s) URLs.
 * @param {unknown} urls
 * @returns {string[]}
 */
export function sanitizePhotoUrls(urls) {
  if (!Array.isArray(urls)) return [];
  return urls.filter(isSafeHttpUrl).map((url) => url.trim());
}
