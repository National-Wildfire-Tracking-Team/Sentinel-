/**
 * incidentLocation.js
 * Helpers for the `ADDRESS:` line that reporter incidents keep inside their
 * description (fire_reports has no address column).
 */

const ADDRESS_LINE = /^ADDRESS:\s*(.+)$/m;
const ADDRESS_LINE_WITH_BREAK = /^ADDRESS:.*(?:\r?\n|$)/m;

export function extractAddressFromDescription(description) {
  const match = String(description || '').match(ADDRESS_LINE);
  return match ? match[1].trim() : '';
}

/* Remove the ADDRESS line so the address can be edited in its own field. */
export function stripAddressFromDescription(description) {
  return String(description || '').replace(ADDRESS_LINE_WITH_BREAK, '');
}

/* Replace the ADDRESS line, or put one at the top if there isn't one. */
export function replaceAddressInDescription(description, address) {
  const text = String(description || '');
  const line = `ADDRESS: ${String(address || '').trim()}`;

  return ADDRESS_LINE.test(text)
    ? text.replace(ADDRESS_LINE, () => line)
    : [line, text].filter(Boolean).join('\n');
}

export function isValidCoordinate(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

export function formatCoordinates(latitude, longitude) {
  return `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}`;
}

/* True when the new point is far enough from the old one to count as a move
 * (~1 m); avoids logging float noise as a relocation. */
export function hasLocationChanged(prev, next) {
  if (!isValidCoordinate(prev.latitude, prev.longitude)) return isValidCoordinate(next.latitude, next.longitude);
  return Math.abs(prev.latitude - next.latitude) > 1e-5 || Math.abs(prev.longitude - next.longitude) > 1e-5;
}
