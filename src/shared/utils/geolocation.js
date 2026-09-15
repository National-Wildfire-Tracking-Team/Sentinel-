/**
 * geolocation.js
 * Drop-in replacement for the classic `navigator.geolocation` callback API
 * (getCurrentPosition/watchPosition/clearWatch) that routes through
 * @capacitor/geolocation on native, so location requests go through the
 * platform's native permission prompt (and don't rely on a WebView's
 * best-effort navigator.geolocation, which is unreliable on Android). On
 * web this is a pass-through to the real navigator.geolocation, unchanged.
 */
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

const isNative = Capacitor.isNativePlatform();

/** Maps a Capacitor GeolocationPluginError to the browser's numeric 1/2/3 codes. */
function toBrowserErrorCode(err) {
  const message = (err && err.message) || '';
  if (/denied|permission/i.test(message)) return 1; // PERMISSION_DENIED
  if (/timeout/i.test(message)) return 3; // TIMEOUT
  return 2; // POSITION_UNAVAILABLE
}

export function isGeolocationSupported() {
  return isNative || (typeof navigator !== 'undefined' && !!navigator.geolocation);
}

export function getCurrentPosition(onSuccess, onError, options) {
  if (!isNative) {
    navigator.geolocation.getCurrentPosition(onSuccess, onError, options);
    return;
  }
  Geolocation.getCurrentPosition(options)
    .then(onSuccess)
    .catch((err) => onError?.({ code: toBrowserErrorCode(err), message: err?.message }));
}

/** Returns a watch handle to pass to clearWatch (a plain id on web, a Promise<id> on native). */
export function watchPosition(onSuccess, onError, options) {
  if (!isNative) {
    return navigator.geolocation.watchPosition(onSuccess, onError, options);
  }
  return Geolocation.watchPosition(options, (position, err) => {
    if (err) {
      onError?.({ code: toBrowserErrorCode(err), message: err?.message });
      return;
    }
    if (position) onSuccess(position);
  });
}

export function clearWatch(watchId) {
  if (!isNative) {
    navigator.geolocation.clearWatch(watchId);
    return;
  }
  Promise.resolve(watchId)
    .then((id) => Geolocation.clearWatch({ id }))
    .catch(() => {});
}
