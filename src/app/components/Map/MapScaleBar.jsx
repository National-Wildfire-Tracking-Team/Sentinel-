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
 */

import { useEffect, useRef, useState } from 'react';

const MAX_SCALE_WIDTH = 100;
const MIN_SCALE_WIDTH = 40;
// Horizontal padding + borders of the styled scale (see .sentinel-scale in index.css).
const SCALE_CHROME = 18;
const GAP_TO_BAR = 8;
// The bottom bar sits at bottom-4.
const BAR_BOTTOM = 16;

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

function useViewportWidth() {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1024 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

export function MapScaleDock({ map, bottomBarWidth = 0, bottomBarHeight = 0 }) {
  const viewportWidth = useViewportWidth();
  const left = viewportWidth < 640 ? 8 : 16;

  // Room between the screen edge and the centered bottom bar.
  const room = bottomBarWidth
    ? (viewportWidth - bottomBarWidth) / 2 - left - GAP_TO_BAR - SCALE_CHROME
    : MAX_SCALE_WIDTH;
  const maxWidth = Math.round(Math.min(MAX_SCALE_WIDTH, Math.max(MIN_SCALE_WIDTH, room)));

  return (
    <div
      className="absolute z-20 translate-y-full pointer-events-none animate-fade-in"
      style={{ left, bottom: BAR_BOTTOM + bottomBarHeight }}
    >
      <MapScaleBar map={map} maxWidth={maxWidth} />
    </div>
  );
}
