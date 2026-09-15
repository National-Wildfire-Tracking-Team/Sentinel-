/**
 * openExternalUrl.js
 * Opens an external URL (Stripe Checkout/Portal, an SPC page linked from a
 * map popup, ...). On native this uses @capacitor/browser so the page opens
 * in an in-app SFSafariViewController/Custom Tab instead of navigating the
 * app's own WebView away to it; on web this is unchanged (a normal top-level
 * navigation, or a new tab, exactly as before).
 */
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

const isNative = Capacitor.isNativePlatform();

/** For links meant to replace the current page (e.g. Stripe redirects). */
export function openExternalUrl(url) {
  if (isNative) {
    Browser.open({ url });
    return;
  }
  window.location.href = url;
}

/** For links meant to open in a new tab (e.g. a map popup's "view source" link). */
export function openExternalUrlInNewTab(url) {
  if (isNative) {
    Browser.open({ url });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
