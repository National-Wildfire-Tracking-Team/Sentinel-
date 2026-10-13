/**
 * incidentFeedFilter.js
 * The one rule for which fires the sidebar lists and counts, so the feed and
 * the stat pills always agree with each other and with the map (whose
 * "Active Fires" filter in LiveTrackerPage also cuts at 95% contained).
 */

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/** Still burning: under 95% contained and not marked controlled. */
export function isActiveFire(inc) {
  return (inc.contained ?? 0) < 95 && inc.status !== 'controlled';
}

/**
 * Fires shown for a feed filter: 'all' lists every fire updated in the last
 * three days, contained or not; 'focused' (Active Fires) keeps only active ones.
 */
export function filterFeedIncidents(incidents, feedFilter, now = Date.now()) {
  return incidents.filter(inc => {
    if (inc.updated && (now - new Date(inc.updated).getTime()) > THREE_DAYS_MS) return false;
    if (feedFilter === 'focused' && !isActiveFire(inc)) return false;
    return true;
  });
}
