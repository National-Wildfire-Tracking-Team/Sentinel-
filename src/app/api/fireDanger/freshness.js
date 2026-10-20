/**
 * freshness.js
 * Decides whether fire danger data is current, partly issued or stale, so
 * the UI can say so instead of presenting an old product as today's.
 */

// NWCG publishes the 7-day product on Mountain Time ("fully updated by 12:00 MDT daily").
const PRODUCT_TZ = 'America/Denver';

/** YYYY-MM-DD of `now` in the product's time zone, plus `addDays`. */
export function productDate(now = new Date(), addDays = 0, timeZone = PRODUCT_TZ) {
  const local = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [y, m, d] = local.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + addDays)).toISOString().slice(0, 10);
}

/**
 * @param {{ forecastDate: string|null, areas: number, issued: number, notUpdated: number }|null} summary
 * @param {number} day  forecast day 1-7
 * @returns {{ status: 'current'|'partial'|'pending'|'stale'|'unknown', expectedDate: string, forecastDate: string|null }|null}
 *   current: every area issued for the expected date
 *   partial: the date is right but some areas are not yet updated
 *   pending: the date is right but no area is issued yet
 *   stale:   the newest forecast is for an earlier date than expected
 */
export function sfpFreshness(summary, day, now = new Date()) {
  if (!summary) return null;
  const expectedDate = productDate(now, day - 1);
  const { forecastDate } = summary;
  if (!forecastDate) return { status: 'unknown', expectedDate, forecastDate };
  if (forecastDate < expectedDate) return { status: 'stale', expectedDate, forecastDate };
  if (summary.issued === 0) return { status: 'pending', expectedDate, forecastDate };
  if (summary.notUpdated > 0) return { status: 'partial', expectedDate, forecastDate };
  return { status: 'current', expectedDate, forecastDate };
}
