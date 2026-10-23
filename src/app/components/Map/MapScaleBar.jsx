/**
 * MapScaleBar.jsx
 * Mapbox's native ScaleControl mounted into our own markup, so the map's
 * distance scale can sit beside the bottom bar instead of in a map corner.
 * The bar resizes and relabels as the map zooms; it re-mounts when the map
 * (or its maximum width) does.
 *
 * MapScaleDock places it bottom-left, its top level with the bottom bar's top
 * edge (high enough to clear the Mapbox logo in the corner). On phones the
 * centered bottom bar leaves only a narrow strip to its left, so the scale's
 * maximum length shrinks to fit that strip rather than running under the bar.
 *
 * While a left sidebar is open (covering that corner), the scale moves to the
 * right of the bar, beside the zoom / bug-report buttons — when there's room
 * for it there (scaleRoomRightOfBar).
 */

import { useEffect, useRef } from 'react';
import {
  BAR_BOTTOM, GAP_TO_BAR, MAX_SCALE_WIDTH, MIN_SCALE_WIDTH, SCALE_CHROME, ZOOM_BUTTON, ZOOM_RIGHT,
  scaleRoomRightOfBar, useViewportWidth,
} from './mapEdgeLayout';

export default function MapScaleBar({ map, maxWidth = MAX_SCALE_WIDTH, className = '' }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!map || !host) return undefined;

    let control;
    let cancelled = false;
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (cancelled) return;
      control = new mapboxgl.ScaleControl({ maxWidth, unit: 'imperial' });
      host.appendChild(control.onAdd(map));
    });

    return () => {
      cancelled = true;
      control?.onRemove();
    };
  }, [map, maxWidth]);

  return <div ref={hostRef} className={`sentinel-scale flex ${className}`} />;
}

export function MapScaleDock({ map, bottomBarWidth = 0, bottomBarHeight = 0, besidePanel = false }) {
  const viewportWidth = useViewportWidth();
  const roomOnRight = besidePanel ? scaleRoomRightOfBar(viewportWidth, bottomBarWidth) : 0;

  // Beside an open left sidebar: just left of the zoom buttons, centered on
  // the bug-report button (the bottom one). Re-keyed so it fades in at its
  // new spot instead of jumping across the map.
  if (roomOnRight) {
    return (
      <div
        key="beside-panel"
        className="absolute z-20 flex h-9 items-center pointer-events-none animate-fade-in"
        style={{ right: ZOOM_RIGHT + ZOOM_BUTTON + GAP_TO_BAR, bottom: BAR_BOTTOM }}
      >
        <MapScaleBar map={map} maxWidth={roomOnRight} />
      </div>
    );
  }

  const left = viewportWidth < 640 ? 8 : 16;

  // Room between the screen edge and the centered bottom bar.
  const room = bottomBarWidth
    ? (viewportWidth - bottomBarWidth) / 2 - left - GAP_TO_BAR - SCALE_CHROME
    : MAX_SCALE_WIDTH;
  const maxWidth = Math.round(Math.min(MAX_SCALE_WIDTH, Math.max(MIN_SCALE_WIDTH, room)));

  return (
    <div
      key="beside-bar"
      className="absolute z-20 translate-y-full pointer-events-none animate-fade-in"
      style={{ left, bottom: BAR_BOTTOM + bottomBarHeight }}
    >
      <MapScaleBar map={map} maxWidth={maxWidth} />
    </div>
  );
}
