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

// User's Time Format preference ('12h' | '24h'). Set via PreferencesContext
// and kept as module state so every formatter picks it up without threading a
// prop through each component. Components that show times call
// useTimeFormat() (hooks/useTimeFormat) to re-render when it changes.
let hour12Preference = true;
const timeFormatListeners = new Set();

/**
 * @param {'12h'|'24h'} format
 */
export function setTimeFormatPreference(format) {
  const next = format !== '24h';
  if (next === hour12Preference) return;
  hour12Preference = next;
  timeFormatListeners.forEach((listener) => listener());
}

/** True while the 12-hour clock is selected. */
export function isHour12() {
  return hour12Preference;
}

/** @param {() => void} listener  @returns {() => void} unsubscribe */
export function subscribeTimeFormat(listener) {
  timeFormatListeners.add(listener);
  return () => timeFormatListeners.delete(listener);
}

/**
 * Adds the Time Format preference to toLocaleString/toLocaleTimeString
 * options. hourCycle (not hour12: false) so midnight reads 00:05, not 24:05.
 * @param {Intl.DateTimeFormatOptions} [opts]
 */
export function withClock(opts = {}) {
  return { ...opts, hourCycle: hour12Preference ? 'h12' : 'h23' };
}

/**
 * Clock time ("3:12 PM"), prefixed with the date ("Oct 4, 3:12 PM") when it
 * isn't today. Honors the Time Format preference like formatDateTime.
 * @param {string|Date} dateInput
 * @returns {string}
 */
export function formatClockTime(dateInput) {
  const date = new Date(dateInput);
  if (!dateInput || Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString('en-US', withClock({ hour: 'numeric', minute: '2-digit' }));
  if (date.toDateString() === new Date().toDateString()) return time;
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}

/**
 * Format a date for display in the detail panel
 * @param {string|Date} dateInput
 * @returns {string}
 */
export function formatDateTime(dateInput) {
  if (!dateInput) return 'Unknown';
  const date = new Date(dateInput);
  return date.toLocaleString('en-US', withClock({
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }));
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
 * Parse the latest acreage value from a fire report description
 * @param {string} description
 * @returns {number|null}
 */
export function parseLatestAcreage(description) {
  if (!description) return null;

  const lines = description.split('\n').reverse();

  for (const line of lines) {
    const match =
      line.match(/acreage[:\s]+([0-9,.]+)/i) ||
      line.match(/size[:\s]+([0-9,.]+)\s*acres?/i);

    if (match) {
      const value = parseFloat(match[1].replace(/,/g, ''));
      if (Number.isFinite(value)) return value;
    }
  }

  return null;
}

/**
 * Parse the latest containment percentage from a fire report description
 * @param {string} description
 * @returns {number|null}
 */
export function parseLatestContainment(description) {
  if (!description) return null;

  const lines = description.split('\n').reverse();

  for (const line of lines) {
    const match =
      line.match(/containment[:\s]+([0-9]+)\s*%/i) ||
      line.match(/([0-9]+)\s*%\s*contained/i);

    if (match) {
      const value = parseInt(match[1], 10);
      if (Number.isFinite(value)) return Math.min(100, Math.max(0, value));
    }
  }

  return null;
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
