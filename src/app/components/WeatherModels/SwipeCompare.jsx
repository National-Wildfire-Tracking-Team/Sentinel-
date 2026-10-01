/**
 * SwipeCompare.jsx
 * Compare → Swipe: HRRR on the main map, GFS on a second map stacked over it
 * and clipped to the right of a draggable divider. The second map follows
 * the main map's camera on every move, so both fields stay geographically
 * aligned at the same valid time.
 *
 * The second map is non-interactive (the main map takes all gestures); only
 * the divider handle receives pointer events. It uses the same basemap
 * style, so its tiles come from the browser cache. Each swipe session is one
 * extra Mapbox map load.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Map, { useMap } from 'react-map-gl';
import { GripVertical } from 'lucide-react';

function camera(map) {
  const c = map.getCenter();
  return { longitude: c.lng, latitude: c.lat, zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
}

export default function SwipeCompare({ mapStyle, mapboxAccessToken, leftLabel, rightLabel, children }) {
  const { current } = useMap();
  const main = current?.getMap();
  const [view, setView] = useState(() => (main ? camera(main) : null));
  const [split, setSplit] = useState(0.5);
  const dragging = useRef(false);

  useEffect(() => {
    if (!main) return undefined;
    const sync = () => setView(camera(main));
    main.on('move', sync);
    sync();
    return () => main.off('move', sync);
  }, [main]);

  if (!main || !view) return null;
  const container = main.getContainer();

  const move = (e) => {
    if (!dragging.current) return;
    const rect = container.getBoundingClientRect();
    setSplit(Math.min(0.95, Math.max(0.05, (e.clientX - rect.left) / rect.width)));
  };
  const onKey = (e) => {
    if (e.key === 'ArrowLeft') setSplit((s) => Math.max(0.05, s - 0.05));
    if (e.key === 'ArrowRight') setSplit((s) => Math.min(0.95, s + 0.05));
  };

  return createPortal(
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
      <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${split * 100}%)` }}>
        <Map
          {...view}
          mapStyle={mapStyle}
          mapboxAccessToken={mapboxAccessToken}
          projection="mercator"
          interactive={false}
          attributionControl={false}
          style={{ width: '100%', height: '100%' }}
        >
          {children}
        </Map>
      </div>
      <div className="absolute top-0 bottom-0 w-px bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]" style={{ left: `${split * 100}%` }}>
        <button
          type="button"
          aria-label="Drag to compare HRRR (left) and GFS (right)"
          className="pointer-events-auto absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center justify-center w-7 h-12 rounded-md bg-white text-sentinel-900 shadow-lg cursor-ew-resize focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
          onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={move}
          onPointerUp={() => { dragging.current = false; }}
          onKeyDown={onKey}
        >
          <GripVertical size={16} aria-hidden />
        </button>
      </div>
      <span
        className="absolute top-20 rounded border border-dashed border-[#3987e5] bg-sentinel-900/85 px-1.5 py-0.5 text-[11px] font-semibold text-white"
        style={{ right: `calc(${(1 - split) * 100}% + 0.5rem)` }}
      >
        {leftLabel}
      </span>
      <span
        className="absolute top-20 rounded border border-dashed border-[#d55181] bg-sentinel-900/85 px-1.5 py-0.5 text-[11px] font-semibold text-white"
        style={{ left: `calc(${split * 100}% + 0.5rem)` }}
      >
        {rightLabel}
      </span>
    </div>,
    container,
  );
}
