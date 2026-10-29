/**
 * useCookieConsent.js
 * The visitor's cookie choices ({ savedToggles, analytics }, or null before
 * they've made any), kept current as they change them from the banner or
 * Cookie Settings.
 */

import { useSyncExternalStore } from 'react';
import { readCookieConsent, subscribeCookieConsent } from '../utils/cookieConsent';

export function useCookieConsent() {
  return useSyncExternalStore(subscribeCookieConsent, readCookieConsent, () => null);
}
