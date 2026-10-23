/**
 * mapEdgeLayout.js
 * Where the live map's edge pieces sit around the centered bottom bar: the
 * distance scale (MapScaleBar), the left sidebars, and the large right-hand
 * panels. LiveTrackerPage turns the widths into CSS variables on the map
 * container (--left-panel-width, --right-panel-max-width, --right-panel-bottom).
 */

import { useEffect, useState } from 'react';

export const MAX_SCALE_WIDTH = 100;
export const MIN_SCALE_WIDTH = 40;
// Horizontal padding + borders of the styled scale (see .sentinel-scale in app-rules.css).
export const SCALE_CHROME = 18;
export const GAP_TO_BAR = 8;
// The bottom bar sits at bottom-4.
export const BAR_BOTTOM = 16;
// MapZoomControl: four stacked w-9/h-9 buttons (plus a 1px border) at right-4.
export const ZOOM_BUTTON = 36;
export const ZOOM_RIGHT = 16;
const ZOOM_HEIGHT = 4 * ZOOM_BUTTON + 2;

// Side panels keep this gap from the bottom bar, and the map's 1rem margin.
const PANEL_GAP = 16;
const PANEL_MARGIN = 16;

// The left sidebars (Sidebar, FutureFeaturesPanel) are never narrower than
// MIN (19rem) or wider than MAX.
const MIN_PANEL_WIDTH = 304;
const MAX_PANEL_WIDTH = 480;

// Large right-hand panels (incident, storm, alert, gauge and route details)
// end a small gap above the zoom buttons, and are never narrower than this.
export const RIGHT_PANEL_BOTTOM = BAR_BOTTOM + ZOOM_HEIGHT + GAP_TO_BAR;
const MIN_RIGHT_PANEL_WIDTH = 288;

export function useViewportWidth() {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1024 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

/**
 * Left sidebar layout from sm up. The sidebar always runs the map's full
 * height, its right edge a small gap short of the centered bottom bar's left
 * edge. Where that would make it narrower than MIN (smaller screens), it keeps
 * MIN and the bar overlaps its bottom corner (clearsBar false): the bar then
 * sits above it, and the sidebar's lists scroll under the bar. Null on phones,
 * where the sidebar is full width, and before the bar has been measured.
 */
export function leftPanelLayout(viewportWidth, bottomBarWidth) {
  if (viewportWidth < 640 || !bottomBarWidth) return null;
  const width = Math.floor((viewportWidth - bottomBarWidth) / 2 - PANEL_GAP);
  return {
    width: Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, width)),
    clearsBar: width >= MIN_PANEL_WIDTH,
  };
}

/**
 * Widest a right-hand panel (at the map's 1rem margin) can be and still sit
 * fully right of the centered bottom bar, with a small gap. On narrow screens
 * it keeps a usable minimum width; its bottom is above the bar regardless.
 */
export function rightPanelMaxWidth(viewportWidth, bottomBarWidth) {
  if (!bottomBarWidth) return null;
  const width = Math.floor((viewportWidth - bottomBarWidth) / 2 - PANEL_GAP - PANEL_MARGIN);
  return Math.max(MIN_RIGHT_PANEL_WIDTH, width);
}

/**
 * Scale length that fits between the centered bottom bar's right edge and the
 * zoom buttons; 0 when it doesn't fit (or on phones, where an open sidebar
 * covers the whole map anyway).
 */
export function scaleRoomRightOfBar(viewportWidth, bottomBarWidth) {
  if (viewportWidth < 640 || !bottomBarWidth) return 0;
  const room = (viewportWidth - bottomBarWidth) / 2
    - GAP_TO_BAR * 2 - ZOOM_BUTTON - ZOOM_RIGHT - SCALE_CHROME;
  return room >= MIN_SCALE_WIDTH ? Math.round(Math.min(MAX_SCALE_WIDTH, room)) : 0;
}
