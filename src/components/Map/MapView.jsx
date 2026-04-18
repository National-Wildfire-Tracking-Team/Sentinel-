/**
 * MapView.jsx
 * Main interactive map component.
 * Hosts all data layers and handles user interaction (click, hover).
 * Uses react-map-gl with Mapbox GL JS and satellite imagery.
 */

import { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import Map, { NavigationControl, ScaleControl, Popup } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import { useApp } from '../../context/AppContext';
import { formatAcres, formatContainment, formatFRP } from '../../utils/formatUtils';
import { frpToLabel } from '../../utils/colorUtils';
import * as hrrRateLimiter from '../../utils/hrrRateLimiter';

// Data layer components
import FireHotspotsLayer  from './layers/FireHotspotsLayer';
import FirePerimetersLayer from './layers/FirePerimetersLayer';
import FireIncidentsLayer  from './layers/FireIncidentsLayer';
import IncidentLocationsLayer from './layers/IncidentLocationsLayer';
import AQILayer           from './layers/AQILayer';
import WeatherAlertsLayer from './layers/WeatherAlertsLayer';
import SmokeLayer         from './layers/SmokeLayer';
import GOESLayer          from './layers/GOESLayer';
import StormReportsLayer  from './layers/StormReportsLayer';
import UserReportsLayer   from './layers/UserReportsLayer';
import SPCOutlookLayer from './layers/SPCOutlookLayer';
import RadarLayer from './layers/RadarLayer';
import EvacZonesLayer from './layers/EvacZonesLayer';
import { MeasurementLayer, MeasurementPanel } from './MeasurementTool';
import FlightLayer from './layers/FlightLayer';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';
const HAS_MAPBOX_TOKEN = Boolean(MAPBOX_TOKEN.trim());

// Quick helper if you don't already have one exported from utils
const num = (val) => Number(val);

// ─── Base map style ───────────────────────────────────────────────────────────
const MAP_STYLE = HAS_MAPBOX_TOKEN
  ? 'mapbox://styles/mapbox/satellite-streets-v12'
  : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

/**
 * Tooltip shown on hover
 */
function HoverTooltip({ feature, lngLat }) {
  if (!feature || !lngLat) return null;
  const p = feature.properties;

  let content = null;
  switch (feature.layer.id) {
    case 'fire-hotspots-circle': {
      const detections = num(p.detection_count) || 1;
      const isConsolidated = detections > 1;
      content = (
        <>
          <div className="font-semibold text-orange-400">
            {isConsolidated ? `FIRMS Detection (${detections} sensors)` : 'FIRMS Detection'}
          </div>
          <div className="text-gray-300 text-xs mt-0.5">
            FRP: <span className="text-white font-medium">{formatFRP(num(p.frp))}</span>
            {' '}· {frpToLabel(num(p.frp))} intensity
            {isConsolidated && (
              <span className="text-gray-400"> · Combined: {formatFRP(num(p.total_frp))}</span>
            )}
          </div>
          <div className="text-gray-400 text-xs">{p.satellite} · {p.acq_date}</div>
          <div className="text-gray-500 text-[10px] mt-1">
            ({num(p.latitude).toFixed(4)}, {num(p.longitude).toFixed(4)})
          </div>
        </>
      );
      break;
    }
    case 'fire-perimeters-fill':
    case 'fire-perimeter-centroids-circle':
      content = (
        <>
          <div className="font-semibold text-orange-400">
            {p.IncidentName}
          </div>
          <div className="text-gray-300 text-xs mt-0.5">
            {formatAcres(num(p.GISAcres))} · {formatContainment(num(p.PercentContained))} contained
          </div>
          <div className="text-gray-400 text-xs">{p.POOState} · {p.POOCounty} County</div>
        </>
      );
      break;
    case 'aqi-stations-circle':
      content = (
        <>
          <div className="font-semibold text-blue-400">{p.reportingArea}</div>
          <div className="text-gray-300 text-xs mt-0.5">
            AQI: <span className="text-white font-medium">{num(p.aqi)}</span>
            {' '}· {p.category}
          </div>
          <div className="text-gray-400 text-xs">PM2.5: {num(p.pm25)} µg/m³</div>
        </>
      );
      break;
    case 'fire-incidents-circle':
      content = (
        <>
          <div className="font-semibold text-orange-400">{p.IncidentName}</div>
          <div className="text-gray-300 text-xs mt-0.5">
            {formatAcres(p.GISAcres)} · {formatContainment(p.PercentContained)} contained
          </div>
          <div className="text-gray-400 text-xs">{p.POOState} · {p.POOCounty} County</div>
        </>
      );
      break;
    case 'weather-alerts-fill':
      content = (
        <>
          <div className="font-semibold text-red-400">{p.type}</div>
          <div className="text-gray-300 text-xs mt-0.5 max-w-[200px] line-clamp-2">{p.headline}</div>
        </>
      );
      break;
    case 'spc-reports-circle':
    case 'iem-reports-circle':
      content = (
        <>
          <div className="font-semibold text-sky-300">
            {p.reportType} Report <span className="text-sentinel-300">({p.source})</span>
          </div>
          <div className="text-gray-300 text-xs mt-0.5">
            {p.city ? `${p.city}, ` : ''}{p.state}
            {p.county ? ` · ${p.county} County` : ''}
          </div>
          {p.magnitude && <div className="text-gray-300 text-xs">Magnitude: {p.magnitude}</div>}
          {p.reportedAt && (
            <div className="text-gray-400 text-xs">
              {new Date(p.reportedAt).toLocaleString()}
            </div>
          )}
          {p.comments && (
            <div className="text-gray-400 text-xs mt-1 max-w-[220px] line-clamp-2">{p.comments}</div>
          )}
        </>
      );
      break;
    case 'spc-outlook-fill':
      content = (
        <>
          <div className="font-semibold text-fuchsia-300">
            SPC {String(p.day || '').toUpperCase()} Outlook
          </div>
          <div className="text-gray-300 text-xs mt-0.5">
            Risk: <span className="text-white font-medium">{p.riskCategory || 'TSTM'}</span>
          </div>
          {p.outlookLabel && (
            <div className="text-gray-400 text-xs">{p.outlookLabel}</div>
          )}
          {p.DESC && (
            <div className="text-gray-400 text-xs mt-1 max-w-[220px] line-clamp-3">{p.DESC}</div>
          )}
        </>
      );
      break;
    case 'user-reports-circle':
      content = (
        <>
          <div className="font-semibold text-cyan-300">{p.title}</div>
          <div className="text-gray-300 text-xs mt-0.5">Community report</div>
          {p.created_at && (
            <div className="text-gray-400 text-xs">
              {new Date(p.created_at).toLocaleString()}
            </div>
          )}
        </>
      );
      break;
    case 'incident-locations-circle':
      content = (
        <>
          <div className="font-semibold text-orange-400">{p.name}</div>
          <div className="text-gray-300 text-xs mt-0.5">
            {formatAcres(num(p.acres))} · {formatContainment(num(p.contained))} contained
          </div>
          <div className="text-gray-400 text-xs">{p.county} Co., {p.state}</div>
        </>
      );
      break;
    case 'flights-symbol': {
      const alt   = p.baro_altitude != null ? `${Math.round(p.baro_altitude).toLocaleString()} m` : 'N/A';
      const spd   = p.velocity      != null ? `${Math.round(p.velocity * 1.94384)} kts` : 'N/A';
      const hdg   = p.true_track    != null ? `${Math.round(p.true_track)}°` : 'N/A';
      content = (
        <>
          <div className="font-semibold text-orange-400">{p.callsign || p.icao24}</div>
          <div className="text-gray-300 text-xs mt-0.5">
            Alt: <span className="text-white font-medium">{alt}</span>
            {' '}· Spd: <span className="text-white font-medium">{spd}</span>
          </div>
          <div className="text-gray-400 text-xs">Hdg: {hdg} · {p.origin_country}</div>
          <div className="text-gray-500 text-[10px] mt-0.5">Click for full details</div>
        </>
      );
      break;
    }
    case 'evac-zones-fill': {
      const statusColors = {
        'evacuation order':   'text-red-400',
        'evacuation warning': 'text-orange-400',
        'evacuation watch':   'text-yellow-400',
      };
      const statusKey = (p.warningType || '').toLowerCase();
      const statusClass = statusColors[statusKey] || 'text-red-400';
      content = (
        <>
          <div className={`font-semibold ${statusClass}`}>{p.warningType || 'Evacuation Zone'}</div>
          {p.zoneName && <div className="text-white text-xs mt-0.5 font-medium">{p.zoneName}</div>}
          {p.county && <div className="text-gray-300 text-xs">{p.county} County</div>}
          {p.effectiveDate && (
            <div className="text-gray-400 text-xs">
              Effective: {new Date(p.effectiveDate).toLocaleString()}
            </div>
          )}
        </>
      );
      break;
    }
    default:
      return null;
  }

  return (
    <Popup
      longitude={lngLat.lng}
      latitude={lngLat.lat}
      closeButton={false}
      closeOnClick={false}
      anchor="bottom"
      offset={[0, -8]}
      className="sentinel-popup"
    >
      <div className="bg-sentinel-800 border border-sentinel-600 rounded-lg p-2.5 shadow-2xl text-sm min-w-[140px]">
        {content}
      </div>
    </Popup>
  );
}

const FLIGHT_FIELDS = [
  { key: 'icao24',        label: 'ICAO24' },
  { key: 'callsign',      label: 'Callsign' },
  { key: 'squawk',        label: 'Squawk' },
  { key: 'true_track',    label: 'Heading', fmt: v => v != null ? `${Math.round(v)}°` : '—' },
  { key: 'baro_altitude', label: 'Altitude', fmt: v => v != null ? `${Math.round(v).toLocaleString()} m` : '—' },
  { key: 'velocity',      label: 'Speed', fmt: v => v != null ? `${Math.round(v * 1.94384)} kts` : '—' },
  { key: 'vertical_rate', label: 'Vert. Rate', fmt: v => v != null ? `${v > 0 ? '+' : ''}${v.toFixed(1)} m/s` : '—' },
  { key: 'category',      label: 'Category' },
];

function FlightDetailPopup({ flight, lngLat, onClose }) {
  return (
    <Popup
      longitude={lngLat.lng}
      latitude={lngLat.lat}
      closeButton={false}
      closeOnClick={false}
      anchor="top"
      offset={[0, 8]}
      className="sentinel-popup"
    >
      <div className="bg-sentinel-800 border border-sentinel-600 rounded-lg shadow-2xl text-sm min-w-[200px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-sentinel-600 bg-sentinel-700/50">
          <div className="flex items-center gap-2">
            <span className="text-[10px]" style={{ color: '#ff5a00' }}>✈</span>
            <span className="font-semibold text-orange-400">
              {flight.callsign || flight.icao24}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-sentinel-300 hover:text-white transition-colors text-xs leading-none ml-3"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {/* Fields */}
        <div className="px-3 py-2 space-y-1">
          {FLIGHT_FIELDS.map(({ key, label, fmt }) => {
            const raw = flight[key];
            const display = fmt ? fmt(raw) : (raw != null && raw !== '' ? String(raw) : '—');
            return (
              <div key={key} className="flex items-baseline justify-between gap-4">
                <span className="text-sentinel-300 text-[10px] uppercase tracking-wide shrink-0">{label}</span>
                <span className="text-white text-xs font-mono text-right">{display}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Popup>
  );
}

/**
 * @param {object} props
 * @param {object|null} props.hotspotsGeoJSON
 * @param {object|null} props.perimetersGeoJSON
 * @param {object|null} props.incidentsGeoJSON // Fixed naming mismatch
 * @param {object|null} props.incidentDotsGeoJSON 
 * @param {object|null} props.aqiGeoJSON
 * @param {object|null} props.alertsGeoJSON
 * @param {object|null} props.spcReportsGeoJSON
 * @param {object|null} props.iemReportsGeoJSON
 * @param {object|null} props.spcOutlooksGeoJSON
 * @param {object|null} props.userReportsGeoJSON
 * @param {object|null} props.evacZonesGeoJSON
 * @param {object|null} props.flightsGeoJSON
 * @param {'wildfire'|'weather'} [props.activeMapTab]
 */
export default function MapView({
  activeMapTab = 'wildfire',
  hotspotsGeoJSON,
  perimetersGeoJSON,
  incidentsGeoJSON, // Renamed to match usage inside
  incidentDotsGeoJSON,
  aqiGeoJSON,
  alertsGeoJSON,
  spcReportsGeoJSON,
  iemReportsGeoJSON,
  spcOutlooksGeoJSON,
  userReportsGeoJSON,
  evacZonesGeoJSON,
  flightsGeoJSON,
  measureActive = false,
  measureMode = 'distance',
  onMeasureActivate,
  onMeasureClose,
}) {
  const { layers, alerts, selectFire, viewport, setViewport } = useApp();
  const mapRef = useRef(null);
  const isWildfireTab = activeMapTab === 'wildfire';
  const isWeatherTab  = activeMapTab === 'weather';

  // Hover tooltip state
  const [hoverFeature, setHoverFeature] = useState(null);
  const [hoverLngLat,  setHoverLngLat]  = useState(null);

  // Selected aircraft popup state
  const [selectedFlight,       setSelectedFlight]       = useState(null);
  const [selectedFlightLngLat, setSelectedFlightLngLat] = useState(null);

  // Measurement tool state (active/mode lifted to LiveTrackerPage; points/preview stay local)
  const [measurePoints,  setMeasurePoints]  = useState([]);   // [{lng, lat}, ...]
  const [measurePreview, setMeasurePreview] = useState(null); // {lng, lat} – live cursor

  const activateMeasure = useCallback((mode) => {
    onMeasureActivate?.(mode);
    setMeasurePoints([]);
    setMeasurePreview(null);
  }, [onMeasureActivate]);

  const closeMeasure = useCallback(() => {
    onMeasureClose?.();
    setMeasurePoints([]);
    setMeasurePreview(null);
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = '';
  }, [onMeasureClose]);

  const clearMeasure = useCallback(() => {
    setMeasurePoints([]);
    setMeasurePreview(null);
  }, []);

  // ESC key closes measurement mode
  useEffect(() => {
    if (!measureActive) return;
    const onKey = (e) => { if (e.key === 'Escape') closeMeasure(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [measureActive, closeMeasure]);

  // Only include interactive layer IDs for layers that are currently visible.
  // When the measurement tool is active, disable all layer interactions so
  // clicks and hover tooltips don't compete with the measurement workflow.
  const interactiveLayerIds = useMemo(() => {
    if (measureActive) return [];
    const ids = [];
    if (isWildfireTab && layers.fireHotspots && hotspotsGeoJSON)        ids.push('fire-hotspots-circle');
    if (isWildfireTab && layers.firePerimeters && perimetersGeoJSON) {
      ids.push('fire-perimeters-fill');
      ids.push('fire-perimeter-centroids-circle');
    }
    if (isWildfireTab && layers.incidentLocations && incidentsGeoJSON)   ids.push('incident-locations-circle');
    if (isWildfireTab && layers.userReports && userReportsGeoJSON)       ids.push('user-reports-circle');
    if (isWeatherTab && layers.aqi && aqiGeoJSON)                        ids.push('aqi-stations-circle');
    if (isWeatherTab && layers.weatherAlerts && alertsGeoJSON) ids.push('weather-alerts-fill');
    if (isWeatherTab && layers.spcOutlooks && spcOutlooksGeoJSON)        ids.push('spc-outlook-fill');
    if (isWeatherTab && layers.spcReports && spcReportsGeoJSON)          ids.push('spc-reports-circle');
    if (isWeatherTab && layers.iemReports && iemReportsGeoJSON)          ids.push('iem-reports-circle');
    if (isWildfireTab && layers.evacZones && evacZonesGeoJSON)            ids.push('evac-zones-fill');
    if (layers.flights && flightsGeoJSON)                                 ids.push('flights-symbol');
    return ids;
  }, [measureActive, isWildfireTab, isWeatherTab, layers.fireHotspots, layers.firePerimeters, layers.incidentLocations, layers.aqi,
      layers.weatherAlerts, layers.spcOutlooks, layers.spcReports, layers.iemReports, layers.userReports, layers.evacZones, layers.flights,
      hotspotsGeoJSON, perimetersGeoJSON, incidentsGeoJSON, aqiGeoJSON, alertsGeoJSON, spcOutlooksGeoJSON,
      spcReportsGeoJSON, iemReportsGeoJSON, userReportsGeoJSON, evacZonesGeoJSON, flightsGeoJSON]);

  // Clear stale hover when layers change
  const prevLayersRef = useRef(layers);
  if (prevLayersRef.current !== layers) {
    prevLayersRef.current = layers;
    if (hoverFeature) {
      setHoverFeature(null);
      setHoverLngLat(null);
    }
  }

  // Handle map click – add measurement point OR select fire for detail panel
  const handleClick = useCallback((evt) => {
    if (measureActive) {
      const { lng, lat } = evt.lngLat;
      setMeasurePoints(prev => [...prev, { lng, lat }]);
      return;
    }

    const features = evt.features;
    if (!features?.length) {
      selectFire(null);
      setSelectedFlight(null);
      setSelectedFlightLngLat(null);
      return;
    }

    const feature = features[0];
    const p = feature.properties;

    if (feature.layer.id === 'flights-symbol') {
      setSelectedFlight(feature.properties);
      setSelectedFlightLngLat(evt.lngLat);
      return;
    }

    // Clicking any non-flight feature closes the flight popup
    setSelectedFlight(null);
    setSelectedFlightLngLat(null);

    if (feature.layer.id === 'fire-hotspots-circle') {
      selectFire({
        type: 'hotspot',
        id:   p.id,
        lat:  num(p.latitude) || evt.lngLat.lat,
        lng:  num(p.longitude) || evt.lngLat.lng,
        frp:  num(p.frp),
        total_frp:       num(p.total_frp) || num(p.frp),
        brightness:      num(p.brightness),
        confidence:      p.confidence,
        satellite:       p.satellite,
        source:          p.source,
        acq_date:        p.acq_date,
        acq_time:        p.acq_time,
        detection_count: num(p.detection_count) || 1,
      });
    } else if (feature.layer.id === 'fire-perimeters-fill' || feature.layer.id === 'fire-perimeter-centroids-circle') {
      selectFire({
        type:        'perimeter',
        id:          p.UniqueFireIdentifier,
        name:        p.IncidentName,
        lat:         evt.lngLat.lat,
        lng:         evt.lngLat.lng,
        acres:       num(p.GISAcres),
        contained:   num(p.PercentContained),
        state:       p.POOState,
        county:      p.POOCounty,
        personnel:   num(p.TotalIncidentPersonnel),
        destroyed:   num(p.StructuresDestroyed),
        damaged:     num(p.StructuresDamaged),
        discovered:  p.FireDiscoveryDateTime,
        updated:     p.ModifiedOnDateTime,
        orgType:     p.IncidentManagementOrganization,
        cause:       p.FireCause || null,
        source:      p.Source || null,
      });
    } else if (feature.layer.id === 'fire-incidents-circle') {
      selectFire({
        type:       'incident',
        id:         p.UniqueFireIdentifier,
        name:       p.IncidentName,
        lat:        evt.lngLat.lat,
        lng:        evt.lngLat.lng,
        acres:      p.GISAcres,
        contained:  p.PercentContained,
        state:      p.POOState,
        county:     p.POOCounty,
        personnel:  p.TotalIncidentPersonnel,
        cause:      p.FireCause,
        started:    p.FireDiscoveryDateTime
                      ? new Date(p.FireDiscoveryDateTime).toISOString()
                      : null,
        updated:    p.ModifiedOnDateTime
                      ? new Date(p.ModifiedOnDateTime).toISOString()
                      : null,
      });
    } else if (feature.layer.id === 'incident-locations-circle') {
      let updates = [];
      let evacuationLines = [];
      try {
        updates = p.updates_json ? JSON.parse(p.updates_json) : [];
      } catch {
        updates = [];
      }
      try {
        evacuationLines = p.evacuation_order_lines_json ? JSON.parse(p.evacuation_order_lines_json) : [];
      } catch {
        evacuationLines = [];
      }
      selectFire({
        type:      'incident',
        id:        p.id,
        name:      p.name,
        lat:       evt.lngLat.lat,
        lng:       evt.lngLat.lng,
        acres:     num(p.acres),
        contained: num(p.contained),
        state:     p.state,
        county:    p.county,
        personnel: num(p.personnel),
        status:    p.status,
        cause:     p.cause || 'Under Investigation',
        started:   p.started,
        updated:   p.updated,
        url:       p.url,
        created_by: p.created_by,
        createdAt: p.createdAt,
        location_description: p.location_description,
        evacuation_title: p.evacuation_title,
        evacuation_summary: p.evacuation_summary,
        evacuation_orders: num(p.evacuation_orders) || 0,
        evacuation_warnings: num(p.evacuation_warnings) || 0,
        evacuation_order_lines: evacuationLines,
        updates,
      });
    } else if (feature.layer.id === 'user-reports-circle') {
      selectFire({
        type:        'user-report',
        id:          p.id,
        name:        p.title,
        title:       p.title,
        description: p.description,
        lat:         evt.lngLat.lat,
        lng:         evt.lngLat.lng,
        created_at:  p.created_at,
        user_id:     p.user_id,
      });
    } else if (feature.layer.id === 'evac-zones-fill') {
      selectFire({
        type:           'evacuation-zone',
        id:             p.id || null,
        name:           p.zoneName || 'Evacuation Zone',
        warningType:    p.warningType,
        zoneName:       p.zoneName,
        county:         p.county,
        externalURL:    p.externalURL,
        effectiveDate:  p.effectiveDate,
        expirationDate: p.expirationDate,
        lat:            evt.lngLat.lat,
        lng:            evt.lngLat.lng,
      });
    } else if (feature.layer.id === 'aqi-stations-circle') {
      selectFire({
        type:    'aqi',
        id:      p.id,
        name:    p.reportingArea,
        lat:     evt.lngLat.lat,
        lng:     evt.lngLat.lng,
        aqi:     num(p.aqi),
        category: p.category,
        pm25:    num(p.pm25),
      });
    } else if (feature.layer.id === 'weather-alerts-fill') {
      // Look up the full alert object from context so we get description, instruction, etc.
      // We spread full alert but override `type` with the routing key 'weather-alert',
      // preserving the NOAA event name as `eventType` (e.g. "Flood Advisory").
      const full = alerts?.find(a => a.id === p.id);
      if (full) {
        selectFire({ ...full, type: 'weather-alert', eventType: full.type });
      } else {
        selectFire({
          type:      'weather-alert',
          eventType: p.type,
          id:        p.id,
          headline:  p.headline,
          severity:  p.severity,
          expires:   p.expires,
        });
      }
    }
  }, [measureActive, alerts, selectFire]);

  // Handle mouse move – update hover tooltip OR measurement preview
  const handleMouseMove = useCallback((evt) => {
    if (measureActive) {
      setMeasurePreview({ lng: evt.lngLat.lng, lat: evt.lngLat.lat });
      if (mapRef.current) mapRef.current.getCanvas().style.cursor = 'crosshair';
      return;
    }
    const features = evt.features;
    if (features?.length) {
      setHoverFeature(features[0]);
      setHoverLngLat(evt.lngLat);
      if (mapRef.current) {
        mapRef.current.getCanvas().style.cursor = 'pointer';
      }
    } else {
      setHoverFeature(null);
      setHoverLngLat(null);
      if (mapRef.current) {
        mapRef.current.getCanvas().style.cursor = '';
      }
    }
  }, [measureActive]);

  const handleMouseLeave = useCallback(() => {
    setMeasurePreview(null);
    setHoverFeature(null);
    setHoverLngLat(null);
    if (mapRef.current) {
      mapRef.current.getCanvas().style.cursor = '';
    }
  }, []);

  // Rate-limit HRRR WMS tile requests (9 999 / day)
  const TRANSPARENT_TILE =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  const transformRequest = useCallback((url, resourceType) => {
    if (resourceType === 'Tile' && url.includes('nomads.ncep.noaa.gov')) {
      if (hrrRateLimiter.tryAcquire()) {
        return { url };
      }
      console.warn('[HRRR rate-limiter] 9 999 daily requests reached – serving blank tile');
      return { url: TRANSPARENT_TILE };
    }
  }, []);

  // Sync viewport to context
  const handleMove = useCallback((evt) => {
    setViewport(evt.viewState);
  }, [setViewport]);

  return (
    <div className="absolute inset-0 bg-sentinel-900">
      <Map
        ref={mapRef}
        {...viewport}
        mapboxAccessToken={HAS_MAPBOX_TOKEN ? MAPBOX_TOKEN : undefined}
        mapStyle={MAP_STYLE}
        style={{ width: '100%', height: '100%', background: '#0a0c0e' }}
        interactiveLayerIds={interactiveLayerIds}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMove={handleMove}
        transformRequest={transformRequest}
        attributionControl={false}
        maxTileCacheSize={150}
        fadeDuration={150}
        projection="mercator"
      >
        {/* Navigation controls */}
        <NavigationControl position="bottom-right" style={{ marginBottom: '6rem' }} />
        <ScaleControl position="bottom-left" style={{ marginLeft: '1rem', marginBottom: '1rem' }} />

        {/* ── Data Layers (ordered back-to-front, each independently controlled via visibility) ── */}



        {/* GOES satellite imagery */}
        <GOESLayer
          eastVisible={isWeatherTab && layers.goesEast}
          westVisible={isWeatherTab && layers.goesWest}
        />

        {/* NEXRAD radar reflectivity */}
        <RadarLayer visible={isWeatherTab && layers.radar} />

        {/* Smoke forecast */}
        <SmokeLayer visible={isWeatherTab && layers.smoke} />

        {/* Weather alert zones */}
        <WeatherAlertsLayer
          geoJSON={alertsGeoJSON}
          visible={isWeatherTab && layers.weatherAlerts}
        />

        {/* SPC convective outlook polygons */}
        <SPCOutlookLayer
          geoJSON={spcOutlooksGeoJSON}
          visible={isWeatherTab && layers.spcOutlooks}
        />

        {/* Fire perimeter polygons */}
        <FirePerimetersLayer
          geoJSON={perimetersGeoJSON}
          visible={isWildfireTab && layers.firePerimeters}
        />

        {/* WFIGS incident location markers */}
        <IncidentLocationsLayer
          geoJSON={incidentsGeoJSON}
          visible={isWildfireTab && layers.incidentLocations}
        />

        {/* Incident dot markers – fires with no matching perimeter */}
        <FireIncidentsLayer
          geoJSON={incidentDotsGeoJSON}
          visible={isWildfireTab && layers.incidentLocations}
        />

        {/* AQI monitoring stations */}
        <AQILayer
          geoJSON={aqiGeoJSON}
          visible={isWeatherTab && layers.aqi}
        />

        {/* SPC storm reports */}
        <StormReportsLayer
          idPrefix="spc"
          geoJSON={spcReportsGeoJSON}
          visible={isWeatherTab && layers.spcReports}
          opacity={0.95}
        />

        {/* IEM storm reports */}
        <StormReportsLayer
          idPrefix="iem"
          geoJSON={iemReportsGeoJSON}
          visible={isWeatherTab && layers.iemReports}
          opacity={0.75}
        />

        {/* California evacuation zones */}
        <EvacZonesLayer
          geoJSON={evacZonesGeoJSON}
          visible={isWildfireTab && layers.evacZones}
        />

        {/* Fire hotspot points – rendered last (top) */}
        <FireHotspotsLayer
          geoJSON={hotspotsGeoJSON}
          visible={isWildfireTab && layers.fireHotspots}
        />

        {/* Community-submitted reports (rendered on top of official data) */}
        <UserReportsLayer
          geoJSON={userReportsGeoJSON}
          visible={isWildfireTab && layers.userReports}
        />

        {/* Live flight tracking – always on top of all fire/weather layers */}
        <FlightLayer
          geoJSON={flightsGeoJSON}
          visible={layers.flights}
        />

        {/* Measurement geometry – rendered last so it's always on top */}
        {measureActive && (
          <MeasurementLayer
            points={measurePoints}
            previewPoint={measurePoints.length > 0 ? measurePreview : null}
            mode={measureMode}
          />
        )}

        {/* Hover tooltip */}
        <HoverTooltip feature={hoverFeature} lngLat={hoverLngLat} />

        {/* Flight detail popup – shown on aircraft click */}
        {selectedFlight && selectedFlightLngLat && (
          <FlightDetailPopup
            flight={selectedFlight}
            lngLat={selectedFlightLngLat}
            onClose={() => { setSelectedFlight(null); setSelectedFlightLngLat(null); }}
          />
        )}
      </Map>

      {/* Measurement results panel – visible while tool is active */}
      {measureActive && (
        <MeasurementPanel
          mode={measureMode}
          points={measurePoints}
          onClear={clearMeasure}
          onClose={closeMeasure}
        />
      )}
    </div>
  );
}
