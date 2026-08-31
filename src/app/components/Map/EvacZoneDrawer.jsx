/**
 * EvacZoneDrawer.jsx
 * Interactive polygon-drawing widget for reporters to define evacuation zones.
 *
 * Uses @mapbox/mapbox-gl-draw (imperative API) wired into a react-map-gl <Map>
 * via the `onLoad` callback and the `useControl` hook pattern.
 *
 * Exports:
 *   EvacZoneDrawer  – full-page drawing UI (map + form)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import Map, { NavigationControl, Popup } from 'react-map-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  PenTool, Trash2, CheckCircle2, AlertCircle, RefreshCw,
  X, ChevronDown, MapPin, RotateCcw, Flame,
} from 'lucide-react';
import { useMergedFireData } from '../../hooks/useMergedFireData';
import FireIncidentsLayer from './layers/FireIncidentsLayer';
import FirePerimetersLayer from './layers/FirePerimetersLayer';

const FIRE_INTERACTIVE_LAYER_IDS = ['fire-incidents-circle', 'fire-perimeter-centroids-circle'];

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

const ZONE_TYPES = ['Evacuation Order', 'Evacuation Warning', 'Evacuation Watch'];

const ZONE_TYPE_COLORS = {
  'Evacuation Order':   '#ef4444',
  'Evacuation Warning': '#f97316',
  'Evacuation Watch':   '#eab308',
};

const INPUT_CLS =
  'w-full px-3 py-2.5 rounded-lg bg-[#0d1117] border border-[#30363d] text-white ' +
  'placeholder-[#484f58] focus:outline-none focus:border-[#0096ff] ' +
  'focus:ring-1 focus:ring-[#0096ff]/20 transition-colors text-sm';

const LABEL_CLS =
  'block text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-1.5';

const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
  'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
  'New Hampshire','New Jersey','New Mexico','New York','North Carolina',
  'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
  'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
  'Virginia','Washington','West Virginia','Wisconsin','Wyoming',
];

/**
 * Calculates an approximate area in acres for a GeoJSON Polygon coordinate ring.
 */
function polygonAcres(ring) {
  if (!ring || ring.length < 3) return null;
  const lat0 = ring[0][1] * Math.PI / 180;
  const R = 6371;
  const pts = ring.map(([lng, lat]) => [
    (lng - ring[0][0]) * (Math.PI / 180) * R * Math.cos(lat0),
    (lat - ring[0][1]) * (Math.PI / 180) * R,
  ]);
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return Math.abs(area / 2) * 247.105; // km² → acres
}

function formatAcres(acres) {
  if (acres == null) return null;
  if (acres < 1) return `${(acres * 43560).toFixed(0)} sq ft`;
  return `${acres.toLocaleString('en-US', { maximumFractionDigits: 1 })} acres`;
}

/* ── Draw style – uses zone-type color from feature properties ─────────────── */
function buildDrawStyles(zoneType) {
  const color = ZONE_TYPE_COLORS[zoneType] || '#ef4444';
  return [
    {
      id: 'gl-draw-polygon-fill',
      type: 'fill',
      filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
      paint: { 'fill-color': color, 'fill-opacity': 0.22 },
    },
    {
      id: 'gl-draw-polygon-stroke',
      type: 'line',
      filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': color, 'line-width': 2.5, 'line-opacity': 0.9 },
    },
    {
      id: 'gl-draw-polygon-midpoint',
      type: 'circle',
      filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
      paint: { 'circle-radius': 4, 'circle-color': color },
    },
    {
      id: 'gl-draw-polygon-and-line-vertex-halo-active',
      type: 'circle',
      filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
      paint: { 'circle-radius': 7, 'circle-color': '#fff' },
    },
    {
      id: 'gl-draw-polygon-and-line-vertex-active',
      type: 'circle',
      filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
      paint: { 'circle-radius': 5, 'circle-color': color },
    },
    {
      id: 'gl-draw-line',
      type: 'line',
      filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': color, 'line-width': 2.5, 'line-dasharray': [4, 2] },
    },
    {
      id: 'gl-draw-point',
      type: 'circle',
      filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'feature']],
      paint: { 'circle-radius': 6, 'circle-color': color, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
    },
  ];
}

/* ══════════════════════════════════════════════════════════
   EvacZoneDrawer
══════════════════════════════════════════════════════════ */

/**
 * @param {object}   props
 * @param {function} props.onSave     Called with a zone data object when the reporter submits
 * @param {function} props.onCancel   Called when the reporter dismisses without saving
 * @param {boolean}  props.saving     External busy/loading state while the parent persists the zone
 * @param {string|null} props.saveError  Error message to show from parent save attempt
 */
export default function EvacZoneDrawer({ onSave, onCancel, saving = false, saveError = null }) {
  // ── Map + Draw refs ────────────────────────────────────────────────────────
  const mapRef      = useRef(null);
  const drawRef     = useRef(null);

  // ── Drawing state ──────────────────────────────────────────────────────────
  const [drawnFeatures, setDrawnFeatures] = useState([]);
  const [isDrawingActive, setIsDrawingActive] = useState(false);

  // ── Active wildfires shown on the map so reporters can find fires to zone around ──
  const {
    perimetersGeoJSON,
    incidentDotsGeoJSON,
    loading: firesLoading,
    dotsCount,
    perimetersCount,
  } = useMergedFireData(0, true, true);
  const [selectedFire, setSelectedFire] = useState(null);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [title, setTitle]               = useState('');
  const [description, setDescription]  = useState('');
  const [zoneType, setZoneType]         = useState('Evacuation Order');
  const [incidentName, setIncidentName] = useState('');
  const [county, setCounty]             = useState('');
  const [usState, setUsState]           = useState('');
  const [expiresAt, setExpiresAt]       = useState('');
  const [formError, setFormError]       = useState(null);

  // ── Initialise MapboxDraw when map loads ───────────────────────────────────
  const handleMapLoad = useCallback((evt) => {
    const map = evt.target;
    mapRef.current = map;

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: false, trash: false },
      styles: buildDrawStyles(zoneType),
    });

    map.addControl(draw);
    drawRef.current = draw;

    // Listen for draw events to sync React state
    const sync = () => {
      const data = draw.getAll();
      setDrawnFeatures(data?.features ?? []);
    };

    map.on('draw.create', sync);
    map.on('draw.update', sync);
    map.on('draw.delete', sync);
    map.on('draw.selectionchange', sync);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update draw styles when zoneType changes (need to reinitialise draw)
  useEffect(() => {
    if (!drawRef.current || !mapRef.current) return;
    const map = mapRef.current;
    const prevData = drawRef.current.getAll();

    map.removeControl(drawRef.current);

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: false, trash: false },
      styles: buildDrawStyles(zoneType),
    });
    map.addControl(draw);
    drawRef.current = draw;

    // Restore any previously drawn features
    if (prevData?.features?.length > 0) {
      draw.set(prevData);
    }

    const sync = () => {
      const data = draw.getAll();
      setDrawnFeatures(data?.features ?? []);
    };
    map.on('draw.create', sync);
    map.on('draw.update', sync);
    map.on('draw.delete', sync);
    map.on('draw.selectionchange', sync);
  }, [zoneType]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (drawRef.current && mapRef.current) {
        try { mapRef.current.removeControl(drawRef.current); } catch { /* ignore */ }
      }
    };
  }, []);

  // ── Wildfire point/perimeter selection ─────────────────────────────────────
  const handleMapClick = useCallback((evt) => {
    if (isDrawingActive) return; // don't intercept clicks while placing polygon vertices
    const feature = evt.features?.[0];
    if (!feature) {
      setSelectedFire(null);
      return;
    }
    const props = feature.properties || {};
    const [lng, lat] = feature.geometry?.coordinates || [evt.lngLat.lng, evt.lngLat.lat];
    setSelectedFire({
      lng,
      lat,
      name: props.IncidentName || 'Unnamed Fire',
      acres: props.GISAcres != null && props.GISAcres !== '' ? Number(props.GISAcres) : null,
      contained: props.PercentContained != null && props.PercentContained !== '' ? Number(props.PercentContained) : null,
    });
  }, [isDrawingActive]);

  // ── Drawing controls ───────────────────────────────────────────────────────
  function startDrawing() {
    drawRef.current?.changeMode('draw_polygon');
    setIsDrawingActive(true);
  }

  function deleteSelected() {
    drawRef.current?.trash();
    const data = drawRef.current?.getAll();
    setDrawnFeatures(data?.features ?? []);
    setIsDrawingActive(false);
  }

  function clearAll() {
    drawRef.current?.deleteAll();
    setDrawnFeatures([]);
    setIsDrawingActive(false);
  }

  // ── Form submit ────────────────────────────────────────────────────────────
  function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError('Zone title is required.');
      return;
    }
    if (drawnFeatures.length === 0) {
      setFormError('Draw at least one polygon on the map before saving.');
      return;
    }

    // Build a combined geometry: single Polygon or MultiPolygon
    let geometry;
    if (drawnFeatures.length === 1) {
      geometry = drawnFeatures[0].geometry;
    } else {
      geometry = {
        type: 'MultiPolygon',
        coordinates: drawnFeatures
          .filter((f) => f.geometry?.type === 'Polygon')
          .map((f) => f.geometry.coordinates),
      };
    }

    onSave({
      title:        title.trim(),
      description:  description.trim(),
      zoneType,
      geometry,
      incidentName: incidentName.trim() || null,
      county:       county.trim() || null,
      state:        usState || null,
      expiresAt:    expiresAt ? new Date(expiresAt).toISOString() : null,
    });
  }

  // ── Computed area ──────────────────────────────────────────────────────────
  const totalAcres = drawnFeatures.reduce((sum, f) => {
    if (f.geometry?.type !== 'Polygon') return sum;
    const ring = f.geometry.coordinates[0];
    return sum + (polygonAcres(ring) || 0);
  }, 0);

  const acresLabel = drawnFeatures.length > 0 ? formatAcres(totalAcres) : null;

  const accentColor = ZONE_TYPE_COLORS[zoneType] || '#ef4444';

  return (
    <div className="flex flex-col gap-6">

      {/* ── Zone type selector ── */}
      <div className="flex gap-2 flex-wrap">
        {ZONE_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setZoneType(type)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              zoneType === type
                ? 'border-current text-white shadow-md'
                : 'border-[#30363d] text-[#8b949e] hover:border-[#484f58] hover:text-white'
            }`}
            style={zoneType === type ? { backgroundColor: ZONE_TYPE_COLORS[type] + '33', borderColor: ZONE_TYPE_COLORS[type], color: ZONE_TYPE_COLORS[type] } : {}}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: ZONE_TYPE_COLORS[type] }}
            />
            {type}
          </button>
        ))}
      </div>

      {/* ── Interactive map ── */}
      <div className="relative rounded-xl overflow-hidden border border-[#30363d]" style={{ height: 400 }}>
        <Map
          initialViewState={{ longitude: -114.5, latitude: 39.5, zoom: 5 }}
          style={{ width: '100%', height: '100%' }}
          mapStyle={
            MAPBOX_TOKEN
              ? 'mapbox://styles/mapbox/dark-v11'
              : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
          }
          mapboxAccessToken={MAPBOX_TOKEN || undefined}
          onLoad={handleMapLoad}
          onClick={handleMapClick}
          interactiveLayerIds={isDrawingActive ? [] : FIRE_INTERACTIVE_LAYER_IDS}
          cursor={isDrawingActive ? 'crosshair' : 'default'}
        >
          <FirePerimetersLayer geoJSON={perimetersGeoJSON} visible />
          <FireIncidentsLayer geoJSON={incidentDotsGeoJSON} visible />

          {selectedFire && (
            <Popup
              longitude={selectedFire.lng}
              latitude={selectedFire.lat}
              closeOnClick={false}
              onClose={() => setSelectedFire(null)}
              anchor="bottom"
              offset={12}
              className="sentinel-popup"
            >
              <div className="bg-sentinel-800 border border-sentinel-600 rounded-lg p-2.5 shadow-2xl text-sm min-w-[140px] text-white">
                <p className="font-semibold flex items-center gap-1.5">
                  <Flame size={12} className="text-orange-400 shrink-0" />
                  {selectedFire.name}
                </p>
                {(selectedFire.acres != null || selectedFire.contained != null) && (
                  <p className="text-xs text-[#8b949e] mt-0.5">
                    {selectedFire.acres != null ? `${selectedFire.acres.toLocaleString('en-US', { maximumFractionDigits: 0 })} acres` : ''}
                    {selectedFire.acres != null && selectedFire.contained != null ? ' · ' : ''}
                    {selectedFire.contained != null ? `${selectedFire.contained}% contained` : ''}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => { setIncidentName(selectedFire.name); setSelectedFire(null); }}
                  className="mt-2 text-xs font-semibold text-[#0096ff] hover:underline"
                >
                  Use as linked incident
                </button>
              </div>
            </Popup>
          )}

          <NavigationControl position="top-right" />
        </Map>

        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/10 text-[11px] text-[#c9d1d9] pointer-events-none">
          <Flame size={11} className="text-orange-400" />
          {firesLoading
            ? 'Loading active wildfires…'
            : `${perimetersCount + dotsCount} active wildfire${perimetersCount + dotsCount !== 1 ? 's' : ''} shown`}
        </div>
      </div>
      <p className="text-xs text-[#484f58] -mt-3">
        Click a wildfire marker on the map to see its name and link it to your zone.
      </p>

      {/* ── Map toolbar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={startDrawing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors border"
          style={{ backgroundColor: accentColor + '22', borderColor: accentColor + '55', color: accentColor }}
        >
          <PenTool size={14} />
          Draw Polygon
        </button>

        <button
          type="button"
          onClick={deleteSelected}
          disabled={drawnFeatures.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-[#8b949e] border border-[#30363d] hover:text-red-400 hover:border-red-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 size={14} />
          Delete Selected
        </button>

        {drawnFeatures.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-[#8b949e] border border-[#30363d] hover:text-orange-400 hover:border-orange-800 transition-colors"
          >
            <RotateCcw size={14} />
            Clear All
          </button>
        )}

        {acresLabel && (
          <span className="ml-auto text-xs text-[#8b949e] flex items-center gap-1">
            <MapPin size={11} />
            {drawnFeatures.length} polygon{drawnFeatures.length !== 1 ? 's' : ''} · {acresLabel}
          </span>
        )}
      </div>

      {drawnFeatures.length === 0 && (
        <p className="text-xs text-[#484f58] bg-[#0d1117] border border-[#21262d] rounded-lg px-4 py-3">
          Click <strong className="text-[#8b949e]">Draw Polygon</strong> then click on the map to place vertices.
          Double-click (or click the first point) to close the polygon.
          You can draw multiple polygons to create a multi-area zone.
        </p>
      )}

      {/* ── Zone metadata form ── */}
      <form onSubmit={handleSubmit} className="space-y-4">

        <div>
          <label className={LABEL_CLS}>Zone Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Riverside County Zone A Evacuation Order"
            className={INPUT_CLS}
            maxLength={150}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>Linked Incident (optional)</label>
            <input
              type="text"
              value={incidentName}
              onChange={(e) => setIncidentName(e.target.value)}
              placeholder="e.g. Thompson Fire"
              className={INPUT_CLS}
              maxLength={120}
            />
          </div>

          <div>
            <label className={LABEL_CLS}>County (optional)</label>
            <input
              type="text"
              value={county}
              onChange={(e) => setCounty(e.target.value)}
              placeholder="e.g. Riverside"
              className={INPUT_CLS}
              maxLength={80}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLS}>State (optional)</label>
            <div className="relative">
              <select
                value={usState}
                onChange={(e) => setUsState(e.target.value)}
                className={INPUT_CLS + ' appearance-none pr-8 cursor-pointer'}
              >
                <option value="">— Select state —</option>
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#484f58] pointer-events-none" />
            </div>
          </div>

          <div>
            <label className={LABEL_CLS}>Expires (optional)</label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className={INPUT_CLS + ' cursor-pointer'}
            />
          </div>
        </div>

        <div>
          <label className={LABEL_CLS}>Additional Details (optional)</label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            placeholder="Evacuation instructions, road closures, shelter locations…"
            className={INPUT_CLS + ' resize-y min-h-[80px]'}
          />
          <div className="text-right text-xs text-[#484f58] mt-0.5">{description.length} / 2000</div>
        </div>

        {(formError || saveError) && (
          <div className="flex items-start gap-2 p-3 rounded-lg text-xs border bg-red-950/40 border-red-800/60 text-red-300">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            <span>{formError || saveError}</span>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-[#8b949e] border border-[#30363d] hover:text-white hover:border-[#484f58] transition-colors disabled:opacity-50"
          >
            <X size={13} className="inline mr-1.5" />
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || drawnFeatures.length === 0}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: saving ? '#333' : accentColor }}
          >
            {saving
              ? <><RefreshCw size={13} className="animate-spin" /> Publishing…</>
              : <><CheckCircle2 size={13} /> Publish Zone</>}
          </button>
        </div>
      </form>
    </div>
  );
}
