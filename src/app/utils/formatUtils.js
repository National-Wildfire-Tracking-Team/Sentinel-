/**
 * formatUtils.js
 * Formatting helpers for fire data, dates, numbers, and units.
 */

/**
 * Format acreage with appropriate commas and abbreviation
 * @param {number} acres
 * @returns {string}
 */
export function formatAcres(acres) {
  if (!acres && acres !== 0) return 'Unknown';

  const numericAcres = Number(acres);
  if (Number.isNaN(numericAcres)) return 'Unknown';

  const truncateToTwoDecimals = (value) => Math.trunc(value * 100) / 100;
  const formattedAcres = truncateToTwoDecimals(numericAcres);

  if (formattedAcres >= 1_000_000) {
    const millions = truncateToTwoDecimals(formattedAcres / 1_000_000);
    return `${millions.toLocaleString('en-US', { maximumFractionDigits: 2 })}M acres`;
  }

  return `${formattedAcres.toLocaleString('en-US', { maximumFractionDigits: 2 })} acres`;
}

/**
 * Format FRP value with units
 * @param {number} frp  Fire Radiative Power in MW
 * @returns {string}
 */
export function formatFRP(frp) {
  if (!frp && frp !== 0) return 'Unknown';
  const numericFrp = Number(frp);
  if (!Number.isFinite(numericFrp)) return 'Unknown';
  return `${numericFrp.toFixed(1)} MW`;
}

/**
 * Format AQI value with category label
 * @param {number} aqi
 * @param {string} category
 * @returns {string}
 */
export function formatAQI(aqi, category) {
  return `${aqi} – ${category}`;
}

/**
 * Format a date string into a human-readable relative time
 * e.g. "2 hours ago", "3 days ago"
 * @param {string|Date} dateInput
 * @returns {string}
 */
export function formatRelativeTime(dateInput) {
  if (!dateInput) return 'Unknown';
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  const now = new Date();
  const diffMs = date - now;
  const isFuture = diffMs > 0;
  const absDiffSecs = Math.floor(Math.abs(diffMs) / 1000);
  const absDiffMins = Math.floor(absDiffSecs / 60);
  const absDiffHours = Math.floor(absDiffMins / 60);
  const absDiffDays = Math.floor(absDiffHours / 24);

  if (absDiffSecs < 60) return 'Just now';
  if (absDiffMins < 60) return isFuture ? `in ${absDiffMins}m` : `${absDiffMins}m ago`;
  if (absDiffHours < 24) return isFuture ? `in ${absDiffHours}h` : `${absDiffHours}h ago`;
  if (absDiffDays < 7) return isFuture ? `in ${absDiffDays}d` : `${absDiffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format a date for display in the detail panel
 * @param {string|Date} dateInput
 * @returns {string}
 */
export function formatDateTime(dateInput) {
  if (!dateInput) return 'Unknown';
  const date = new Date(dateInput);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/**
 * Format a date to just the date portion
 * @param {string|Date} dateInput
 * @returns {string}
 */
export function formatDate(dateInput) {
  if (!dateInput) return 'Unknown';
  const date = new Date(dateInput);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Format personnel count
 * @param {number} count
 * @returns {string}
 */
export function formatPersonnel(count) {
  if (!count && count !== 0) return 'Unknown';
  return count.toLocaleString();
}

/**
 * Format wind speed
 * @param {number} speedMph
 * @returns {string}
 */
export function formatWindSpeed(speedMph) {
  if (!speedMph && speedMph !== 0) return 'Unknown';
  return `${speedMph} mph`;
}

/**
 * Format temperature
 * @param {number} tempF
 * @returns {string}
 */
export function formatTemp(tempF) {
  if (!tempF && tempF !== 0) return 'Unknown';
  return `${Math.round(tempF)}°F`;
}

/**
 * Format humidity
 * @param {number} pct
 * @returns {string}
 */
export function formatHumidity(pct) {
  if (!pct && pct !== 0) return 'Unknown';
  return `${Math.round(pct)}% RH`;
}

/**
 * Format containment percentage
 * @param {number} pct
 * @returns {string}
 */
export function formatContainment(pct) {
  if (pct === null || pct === undefined) return 'Unknown';
  return `${pct}%`;
}

/**
 * Returns a short status badge label
 * @param {string} status
 * @returns {string}
 */
export function formatStatus(status) {
  const map = {
    active: 'Active',
    containment: 'In Containment',
    controlled: 'Controlled',
    out: 'Out',
  };
  return map[status] || status;
}

/**
 * Abbreviate large numbers for cluster badges
 * @param {number} num
 * @returns {string}
 */
export function abbreviateNumber(num) {
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return String(num);
}
