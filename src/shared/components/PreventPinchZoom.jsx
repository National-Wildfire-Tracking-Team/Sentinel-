import { useEffect } from 'react';

/**
 * Trackpad pinch gestures fire as `wheel` events with `ctrlKey: true`.
 * Mapbox's own scroll-zoom handler intercepts and stops these when the
 * cursor is over the map canvas, but the page has several floating panels
 * (sidebar, fire detail panel, camera/radar panels, control bars) stacked
 * as DOM siblings on top of the map. A pinch gesture over any of those
 * never reaches Mapbox, so the browser falls back to zooming the whole
 * page. This listener is a global safety net: it blocks the native
 * page-zoom for any ctrl+wheel event that isn't already handled/stopped
 * by the map, without affecting normal (non-ctrl) scrolling anywhere.
 */
function PreventPinchZoom() {
  useEffect(() => {
    const handleWheel = (e) => {
      if (e.ctrlKey) e.preventDefault();
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  return null;
}

export default PreventPinchZoom;
