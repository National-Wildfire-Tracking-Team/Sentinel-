/**
 * analytics.js
 * Thin wrapper around the gtag.js queue set up by DeferredAnalytics.
 * DeferredAnalytics defers loading the gtag script until first
 * interaction/idle/timeout, so window.gtag may not exist yet when an
 * engagement event fires. Rather than drop the event, queue it onto
 * window.dataLayer using the same stub shape DeferredAnalytics installs
 * (window.gtag = window.gtag || push-to-dataLayer) — once the real
 * scripts load, the queued event is processed like any other.
 *
 * Engagement events are sent only with third-party performance tracking on.
 * Before the visitor answers the cookie banner GA only counts the visit
 * (see DeferredAnalytics), and with tracking off it never loads at all.
 */

import { readCookieConsent } from './cookieConsent';

export function trackEvent(eventName, params = {}) {
  if (typeof window === 'undefined') return;
  if (readCookieConsent()?.analytics !== true) return;

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

/**
 * Fires the GA4 recommended `sign_up` conversion event. Sends only the
 * sign-up method — never the email or any other user data.
 */
export function trackSignUp(method = 'email') {
  trackEvent('sign_up', { method });
}

/**
 * Fires the `saved_location` conversion event after a location is saved.
 * Deliberately sends no parameters: no name, address, coordinates or user ID.
 */
export function trackSavedLocation() {
  trackEvent('saved_location');
}
