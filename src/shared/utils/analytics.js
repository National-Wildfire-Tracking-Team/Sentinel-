/**
 * analytics.js
 * Thin wrapper around the gtag.js queue set up by DeferredAnalytics.
 * DeferredAnalytics defers loading the GTM/gtag scripts until first
 * interaction/idle/timeout, so window.gtag may not exist yet when an
 * engagement event fires. Rather than drop the event, queue it onto
 * window.dataLayer using the same stub shape DeferredAnalytics installs
 * (window.gtag = window.gtag || push-to-dataLayer) — once the real
 * scripts load, the queued event is processed like any other.
 */

export function trackEvent(eventName, params = {}) {
  if (typeof window === 'undefined') return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag('event', eventName, params);
}

/**
 * Fires the `sentinel_use` GA4 event for a single meaningful engagement
 * with the app (map search, incident open, layer toggle, etc).
 * Do not call this for pageviews or passive renders.
 */
export function trackSentinelUse(action, params = {}) {
  trackEvent('sentinel_use', { engagement_action: action, ...params });
}
