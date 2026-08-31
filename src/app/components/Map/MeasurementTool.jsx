/**
 * MeasurementTool.jsx
 * Distance and polygon/area measurement tool for the Sentinel map.
 *
 * Exports:
 *   MeasurementLayer   – renders inside <Map> (Source + Layer components)
 *   MeasurementPanel   – floating results panel (absolute-positioned)
 *   MeasurementToolbar – toolbar buttons to activate/deactivate modes
 */

import { useMemo, useState } from 'react';
import { Source, Layer } from 'react-map-gl';
import { Ruler, Hexagon, X, Trash2 } from 'lucide-react';

// ── Math Utilities ────────────────────────────────────────────────────────────

/** Haversine great-circle distance between two [lng, lat] points, returns km. */
function haversineKm([lng1, lat1], [lng2, lat2]) {
  const R = 6371;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function kmToMiles(km) { return km * 0.621371; }
function km2ToAcres(km2) { return km2 * 247.105; }
function km2ToSqMi(km2) { return km2 * 0.386102; }

/**
 * Approximate polygon area in km² via local equirectangular projection +
 * the Shoelace / Gauss-Green formula. Accurate enough for wildfire-scale areas.
 */
function polygonAreaKm2(coords) {
  if (coords.length < 3) return 0;
  const lat0 = coords[0][1] * Math.PI / 180;
  const R = 6371;
  const pts = coords.map(([lng, lat]) => {
    const φ = lat * Math.PI / 180;
    const λ = lng * Math.PI / 180;
    return [
      (λ - coords[0][0] * Math.PI / 180) * R * Math.cos(lat0),
      (φ - lat0) * R,
    ];
  });
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i][0] * pts[j][1];
    area -= pts[j][0] * pts[i][1];
  }
  return Math.abs(area / 2);
}

/** Format a distance (km) into a human-readable string. */
function formatDistance(km) {
  const mi = kmToMiles(km);
  if (mi < 0.1) {
    return `${(mi * 5280).toFixed(0)} ft  /  ${(km * 1000).toFixed(0)} m`;
  }
  return `${mi.toFixed(2)} mi  /  ${km.toFixed(2)} km`;
}

// ── MeasurementLayer ──────────────────────────────────────────────────────────

/**
 * Renders the measurement geometry inside <Map>.
 * Must be a direct child of the react-map-gl <Map> component.
 *
 * @param {{ points: {lng: number, lat: number}[], previewPoint: {lng, lat}|null, mode: 'distance'|'polygon' }} props
 */
export function MeasurementLayer({ points, previewPoint, mode }) {
  const coords = points.map(p => [p.lng, p.lat]);

  // Line / polyline: committed points + live preview endpoint
  const lineCoords = useMemo(() => {
    if (previewPoint && coords.length > 0) {
      return [...coords, [previewPoint.lng, previewPoint.lat]];
    }
    return coords;
  }, [coords, previewPoint]);

  // Closed polygon ring (only when >= 3 committed points)
  const polygonRing = useMemo(() => {
    if (mode === 'polygon' && coords.length >= 3) {
      return [...coords, coords[0]];
    }
    return null;
  }, [mode, coords]);

  const lineGeoJSON = useMemo(() => ({
    type: 'FeatureCollection',
    features: lineCoords.length >= 2 ? [{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: lineCoords },
    }] : [],
  }), [lineCoords]);

  const polygonGeoJSON = useMemo(() => ({
    type: 'FeatureCollection',
    features: polygonRing ? [{
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [polygonRing] },
    }] : [],
  }), [polygonRing]);

  const pointsGeoJSON = useMemo(() => ({
    type: 'FeatureCollection',
    features: coords.map((c, i) => ({
      type: 'Feature',
      properties: { index: i, isFirst: i === 0 },
      geometry: { type: 'Point', coordinates: c },
    })),
  }), [coords]);

  return (
    <>
      {/* Polygon fill (behind outline) */}
      <Source id="measure-polygon" type="geojson" data={polygonGeoJSON}>
        <Layer
          id="measure-polygon-fill"
          type="fill"
          paint={{ 'fill-color': '#f97316', 'fill-opacity': 0.18 }}
        />
      </Source>

      {/* Line / polygon outline */}
      <Source id="measure-line" type="geojson" data={lineGeoJSON}>
        <Layer
          id="measure-line-layer"
          type="line"
          paint={{
            'line-color': '#f97316',
            'line-width': 2.5,
            'line-dasharray': [3, 1.5],
          }}
        />
      </Source>

      {/* Vertex circles */}
      <Source id="measure-points" type="geojson" data={pointsGeoJSON}>
        {/* White halo */}
        <Layer
          id="measure-points-halo"
          type="circle"
          paint={{
            'circle-radius': 8,
            'circle-color': '#ffffff',
            'circle-opacity': 0.25,
          }}
        />
        {/* Orange fill with white stroke */}
        <Layer
          id="measure-points-fill"
          type="circle"
          paint={{
            'circle-radius': 5,
            'circle-color': '#f97316',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
          }}
        />
      </Source>
    </>
  );
}

// ── MeasurementPanel ──────────────────────────────────────────────────────────

/**
 * Floating results panel; rendered as a sibling of <Map> inside the map
 * container div (absolute positioning relative to that container).
 */
export function MeasurementPanel({ mode, points, onClear, onClose }) {
  const coords = points.map(p => [p.lng, p.lat]);

  const totalKm = useMemo(() => {
    if (coords.length < 2) return 0;
    let d = 0;
    for (let i = 1; i < coords.length; i++) {
      d += haversineKm(coords[i - 1], coords[i]);
    }
    return d;
  }, [coords]);

  const areaKm2 = useMemo(() => {
    if (mode !== 'polygon' || coords.length < 3) return 0;
    return polygonAreaKm2(coords);
  }, [mode, coords]);

  const perimeterKm = useMemo(() => {
    if (mode !== 'polygon' || coords.length < 3) return 0;
    // total path length + closing segment
    return totalKm + haversineKm(coords[coords.length - 1], coords[0]);
  }, [mode, coords, totalKm]);

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto
                    bg-sentinel-900/95 border border-sentinel-600 rounded-xl shadow-2xl
                    p-4 min-w-[280px] max-w-[340px] text-sm backdrop-blur-sm">

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-orange-400 font-semibold">
          {mode === 'polygon'
            ? <Hexagon size={15} />
            : <Ruler size={15} />
          }
          {mode === 'polygon' ? 'Area Measurement' : 'Distance Measurement'}
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors rounded p-0.5"
          title="Close measurement tool"
        >
          <X size={15} />
        </button>
      </div>

      {/* Body */}
      {points.length === 0 && (
        <p className="text-gray-400 text-xs">Click the map to place points.</p>
      )}

      {mode === 'distance' && points.length === 1 && (
        <p className="text-gray-400 text-xs">Click to add another point.</p>
      )}

      {mode === 'distance' && points.length >= 2 && (
        <div>
          <div className="text-white font-medium text-base">{formatDistance(totalKm)}</div>
          <div className="text-gray-400 text-xs mt-1">
            {points.length} point{points.length !== 1 ? 's' : ''} · {points.length - 1} segment{points.length > 2 ? 's' : ''}
          </div>
        </div>
      )}

      {mode === 'polygon' && points.length > 0 && points.length < 3 && (
        <p className="text-gray-400 text-xs">
          Add {3 - points.length} more point{3 - points.length > 1 ? 's' : ''} to measure area.
        </p>
      )}

      {mode === 'polygon' && points.length >= 3 && (
        <div className="space-y-2">
          <div>
            <div className="text-gray-400 text-xs uppercase tracking-wider mb-0.5">Area</div>
            <div className="text-white font-medium text-base">
              {km2ToAcres(areaKm2).toLocaleString(undefined, { maximumFractionDigits: 1 })} acres
            </div>
            <div className="text-gray-400 text-xs">
              {km2ToSqMi(areaKm2).toFixed(3)} mi²  ·  {areaKm2.toFixed(4)} km²
            </div>
          </div>
          <div className="border-t border-sentinel-700 pt-2">
            <div className="text-gray-400 text-xs uppercase tracking-wider mb-0.5">Perimeter</div>
            <div className="text-white">{formatDistance(perimeterKm)}</div>
          </div>
          <div className="text-gray-500 text-xs">{points.length} vertices</div>
        </div>
      )}

      {/* Footer actions */}
      {points.length > 0 && (
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-sentinel-700">
          <button
            onClick={onClear}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
          >
            <Trash2 size={12} /> Clear
          </button>
          <span className="text-gray-600 text-xs">·</span>
          <span className="text-gray-600 text-xs">ESC to close</span>
        </div>
      )}
    </div>
  );
}

// ── MeasurementToolbar ────────────────────────────────────────────────────────

/**
 * Two small icon buttons to activate distance or polygon measurement mode.
 * Rendered at bottom-right of the map container, above the NavigationControl.
 */
export function MeasurementToolbar({ active, mode, onActivate, onClose }) {
  const [hovered, setHovered] = useState(null);
  const baseBtn = 'w-9 h-9 flex items-center justify-center rounded-lg shadow-lg transition-all';
  const inactiveBtn = `${baseBtn} bg-sentinel-800 text-gray-300 hover:bg-sentinel-700 hover:text-white border border-sentinel-600`;
  const activeBtn = `${baseBtn} bg-orange-500 text-white ring-2 ring-orange-400/50 border border-orange-400`;
  const tooltip = 'absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium bg-gray-900 text-gray-100 shadow pointer-events-none z-50';

  return (
    <div className="absolute bottom-32 right-3 z-40 flex flex-col gap-1.5 pointer-events-auto">
      <div className="relative" onMouseEnter={() => setHovered('distance')} onMouseLeave={() => setHovered(null)}>
        <button
          onClick={() => (active && mode === 'distance') ? onClose() : onActivate('distance')}
          className={active && mode === 'distance' ? activeBtn : inactiveBtn}
        >
          <Ruler size={16} />
        </button>
        {hovered === 'distance' && <span className={tooltip}>Distance</span>}
      </div>
      <div className="relative" onMouseEnter={() => setHovered('area')} onMouseLeave={() => setHovered(null)}>
        <button
          onClick={() => (active && mode === 'polygon') ? onClose() : onActivate('polygon')}
          className={active && mode === 'polygon' ? activeBtn : inactiveBtn}
        >
          <Hexagon size={16} />
        </button>
        {hovered === 'area' && <span className={tooltip}>Area</span>}
      </div>
    </div>
  );
}
