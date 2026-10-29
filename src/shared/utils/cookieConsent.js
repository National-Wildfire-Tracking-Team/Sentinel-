/**
 * cookieConsent.js
 * The visitor's cookie choices, or null while they haven't made any:
 *   - savedToggles: the tracker remembers each map tab's layer toggles
 *   - analytics:    third-party performance tracking (Google Analytics, see
 *                   DeferredAnalytics), which loads only once this is on
 * The cookie banner sets both at once (Accept / Decline); Cookie Settings
 * sets each on its own.
 *
 * Stored like the site theme (see sharedTheme.js): a cookie scoped to the
 * parent domain so one answer covers the marketing site, the app.* tracker
 * and the reporter.* portal, mirrored into localStorage for hosts where the
 * cookie can't be shared (localhost).
 */

import { sharedCookieDomain } from './getAppOrigin';

export const CONSENT_KEY = 'nwtt-cookie-consent';
export const ACCEPT_ALL = { savedToggles: true, analytics: true };
export const DECLINE_ALL = { savedToggles: false, analytics: false };

const CONSENT_EVENT = 'nwtt:cookie-consent';
const SETTINGS_EVENT = 'nwtt:cookie-settings';
const ONE_YEAR = 60 * 60 * 24 * 365;

/** 'toggles=1&analytics=0' ⇄ { savedToggles: true, analytics: false } */
function parseConsent(raw) {
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const toggles = params.get('toggles');
  const analytics = params.get('analytics');
  if (!/^[01]$/.test(toggles ?? '') || !/^[01]$/.test(analytics ?? '')) return null;
  return { savedToggles: toggles === '1', analytics: analytics === '1' };
}

function serializeConsent({ savedToggles, analytics }) {
  return `toggles=${savedToggles ? 1 : 0}&analytics=${analytics ? 1 : 0}`;
}

function readRawConsent() {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_KEY}=([^;]*)`));
    const fromCookie = match && decodeURIComponent(match[1]);
    if (parseConsent(fromCookie)) return fromCookie;
  } catch {
    // cookies unavailable — fall through to localStorage
  }
  try {
    return window.localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
}

// The same object for as long as the stored value is unchanged, so React's
// useSyncExternalStore (useCookieConsent) sees a stable snapshot.
let cached = { raw: undefined, consent: null };

/** { savedToggles, analytics }, or null while the visitor hasn't chosen. */
export function readCookieConsent() {
  const raw = readRawConsent();
  if (raw !== cached.raw) cached = { raw, consent: parseConsent(raw) };
  return cached.consent;
}

/** Stores the visitor's choices and tells every subscriber on this page. */
export function writeCookieConsent(consent) {
  const value = serializeConsent(consent);
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // localStorage unavailable — the cookie below still carries it
  }
  try {
    const domain = sharedCookieDomain();
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie =
      `${CONSENT_KEY}=${encodeURIComponent(value)}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax` +
      (domain ? `; Domain=${domain}` : '') +
      secure;
  } catch {
    // cookies unavailable — the choice still applies on this origin
  }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

/**
 * Calls onChange() whenever the choices may have changed: made on this
 * page, or — since the cookie is shared — on another subdomain's tab, which
 * is picked up when the visitor comes back to this one. Returns the unsubscribe.
 */
export function subscribeCookieConsent(onChange) {
  const onVisible = () => {
    if (document.visibilityState === 'visible') onChange();
  };
  window.addEventListener(CONSENT_EVENT, onChange);
  window.addEventListener('focus', onChange);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener(CONSENT_EVENT, onChange);
    window.removeEventListener('focus', onChange);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** Opens the Cookie Settings popup. */
export function openCookieSettings() {
  window.dispatchEvent(new Event(SETTINGS_EVENT));
}

/** Calls onOpen() when something asks for Cookie Settings; returns the unsubscribe. */
export function onCookieSettingsOpen(onOpen) {
  window.addEventListener(SETTINGS_EVENT, onOpen);
  return () => window.removeEventListener(SETTINGS_EVENT, onOpen);
}
