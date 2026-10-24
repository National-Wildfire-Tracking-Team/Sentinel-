/**
 * useSharedThemeSync.js
 * Keeps <html> on the site-wide theme on the sites without a theme menu of
 * their own (the marketing and reporter sites). index.html applies it before
 * first paint; this applies it again on load (a prerendered page carries the
 * theme it was saved with), follows the device's light/dark setting live
 * while nothing is picked, and re-reads the app's pick when the visitor comes
 * back to this tab, in case they changed it in the app meanwhile.
 */

import { useEffect } from 'react';
import { applyThemeClass, resolveSharedTheme, watchDeviceTheme } from '../utils/sharedTheme';

export function useSharedThemeSync() {
  useEffect(() => {
    const sync = () => applyThemeClass(resolveSharedTheme());
    const syncIfVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    sync();
    const unwatch = watchDeviceTheme(sync);
    document.addEventListener('visibilitychange', syncIfVisible);
    window.addEventListener('focus', sync);
    return () => {
      unwatch();
      document.removeEventListener('visibilitychange', syncIfVisible);
      window.removeEventListener('focus', sync);
    };
  }, []);
}
