/**
 * analytics.js
 * Structured analytics events, pushed to window.dataLayer for GTM/GA4 to pick up.
 * No PII: never pass email, name, auth tokens, or precise coordinates as parameters.
 */

export const AnalyticsEvent = {
  // Acquisition / discovery
  PAGE_VIEW: 'page_view',
  FIRE_VIEW: 'fire_view',
  FIRE_SHARE: 'fire_share',
  OFFICIAL_SOURCE_CLICK: 'official_source_click',
  MAP_OPEN: 'map_open',

  // Auth funnel
  SIGNUP_START: 'signup_start',
  SIGNUP_COMPLETE: 'signup_complete',
  LOGIN: 'login',
  LOGOUT: 'logout',

  // Engagement
  FIRE_SEARCH: 'fire_search',
  FIRE_FILTER: 'fire_filter',
  SAVED_LOCATION: 'saved_location',
  ALERT_ENABLED: 'alert_enabled',
  EVACUATION_ZONE_VIEW: 'evacuation_zone_view',
  EVENT_REPORT_STARTED: 'event_report_started',
  EVENT_REPORT_SUBMITTED: 'event_report_submitted',

  // Retention
  RETURN_VISIT: 'return_visit',
};

/**
 * Drop undefined/null values so dataLayer pushes stay clean.
 * @param {Record<string, unknown>} parameters
 */
function sanitizeParameters(parameters) {
  const sanitized = {};
  for (const [key, value] of Object.entries(parameters)) {
    if (value === undefined || value === null) continue;
    sanitized[key] = value;
  }
  return sanitized;
}

/**
 * Push a structured event to window.dataLayer for GTM/GA4. Never throws.
 * @param {string} eventName
 * @param {Record<string, unknown>} [parameters]
 */
function trackEvent(eventName, parameters = {}) {
  try {
    if (typeof window === 'undefined') return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: eventName,
      ...sanitizeParameters(parameters),
    });
  } catch {
    // Analytics must never break the app.
  }
}

/**
 * Safe, non-PII fire parameters shared across fire-related events.
 * @param {{id?: string|number, name?: string, state?: string, source?: string, acres?: number, contained?: number}} fire
 */
function fireParams(fire) {
  if (!fire) return {};
  return {
    fire_id: fire.id,
    fire_name: fire.name,
    fire_state: fire.state,
    fire_source: fire.source,
    fire_acres: fire.acres,
    fire_containment: fire.contained,
  };
}

/** @param {object} fire */
function trackFireView(fire) {
  const { fire_id, fire_name, fire_state, fire_source } = fireParams(fire);
  trackEvent(AnalyticsEvent.FIRE_VIEW, { fire_id, fire_name, fire_state, fire_source });
}

/** @param {object} fire */
function trackFireShare(fire) {
  const { fire_id, fire_name, fire_state, fire_source } = fireParams(fire);
  trackEvent(AnalyticsEvent.FIRE_SHARE, { fire_id, fire_name, fire_state, fire_source });
}

/** @param {object} [fire] */
function trackMapOpen(fire) {
  const { fire_id, fire_name, fire_state } = fireParams(fire);
  trackEvent(AnalyticsEvent.MAP_OPEN, { fire_id, fire_name, fire_state });
}

/** @param {object} fire */
function trackOfficialSourceClick(fire) {
  const { fire_id, fire_name, fire_source } = fireParams(fire);
  trackEvent(AnalyticsEvent.OFFICIAL_SOURCE_CLICK, { fire_id, fire_name, fire_source });
}

const RETURN_VISIT_STORAGE_KEY = 'nwtt_last_visit_day';

/**
 * Emit return_visit once per calendar day after the first recorded visit.
 * No-ops silently if localStorage is unavailable.
 */
function trackReturnVisit() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;

    const today = new Date().toISOString().slice(0, 10);
    const lastVisitDay = window.localStorage.getItem(RETURN_VISIT_STORAGE_KEY);

    if (!lastVisitDay) {
      window.localStorage.setItem(RETURN_VISIT_STORAGE_KEY, today);
      return;
    }

    if (lastVisitDay !== today) {
      window.localStorage.setItem(RETURN_VISIT_STORAGE_KEY, today);
      trackEvent(AnalyticsEvent.RETURN_VISIT);
    }
  } catch {
    // Analytics must never break the app.
  }
}

export const Analytics = {
  trackEvent,
  trackFireView,
  trackFireShare,
  trackMapOpen,
  trackOfficialSourceClick,
  trackReturnVisit,
};
