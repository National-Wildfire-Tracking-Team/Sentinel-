/**
 * MapView.jsx
 * Main interactive map component.
 * Hosts all data layers and handles user interaction (click, hover).
 * Uses react-map-gl with MapLibre GL (free, no token required).
 */

import { useRef, useCallback, useState } from 'react';
import Map, { NavigationControl, ScaleControl, Popup } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import { useApp } from '../../context/AppContext';
import { formatAcres, formatContainment, formatFRP } from '../../utils/formatUtils';
import { frpToLabel } from '../../utils/colorUtils';

// Data layer components
import FireHotspotsLayer  from './layers/FireHotspotsLayer';
import FirePerimetersLayer from './layers/FirePerimetersLayer';
import AQILayer           from './layers/AQILayer';
import WeatherAlertsLayer from './layers/WeatherAlertsLayer';
import DroughtLayer       from './layers/DroughtLayer';
import SmokeLayer         from './layers/SmokeLayer';
import GOESLayer          from './layers/GOESLayer';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

// ─── Base map styles ──────────────────────────────────────────────────────────
// Satellite style using free ESRI World Imagery tiles (no token required)
const SATELLITE_STYLE = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: 'Esri, Maxar, Earthstar Geographics',
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'satellite', type: 'raster', source: 'satellite', minzoom: 0, maxzoom: 19 },
  ],
};

function getMapStyle(baseMap) {
  if (MAPBOX_TOKEN) {
    switch (baseMap) {
      case 'satellite': return 'mapbox://styles/mapbox/satellite-streets-v12';
      case 'streets':   return 'mapbox://styles/mapbox/streets-v12';
      case 'dark':
      default:          return 'mapbox://styles/mapbox/dark-v11';
    }
  }
  // Free tile sources (no Mapbox token)
  switch (baseMap) {
    case 'satellite': return SATELLITE_STYLE;
    case 'streets':   return 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
    case 'dark':
    default:          return 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
  }
}

// Layers that respond to click/hover events
const INTERACTIVE_LAYERS = [
  'fire-hotspots-circle',
  'fire-perimeters-fill',
  'aqi-stations-circle',
  'weather-alerts-fill',
];

/**
 * Tooltip shown on hover
 */
function HoverTooltip({ feature, lngLat }) {
  if (!feature || !lngLat) return null;
  const p = feature.properties;

  let content = null;
  switch (feature.layer.id) {
    case 'fire-hotspots-circle':
      content = (
        <>
          <div className="font-semibold text-orange-400">Fire Hotspot</div>
          <div className="text-gray-300 text-xs mt-0.5">
            FRP: <span className="text-white font-medium">{formatFRP(p.frp)}</span>
            {' '}· {frpToLabel(p.frp)} intensity
          </div>
          <div className="text-gray-400 text-xs">{p.satellite} · {p.acq_date}</div>
        </>
      );
      break;
    case 'fire-perimeters-fill':
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
    case 'aqi-stations-circle':
      content = (
        <>
          <div className="font-semibold text-blue-400">{p.reportingArea}</div>
          <div className="text-gray-300 text-xs mt-0.5">
            AQI: <span className="text-white font-medium">{p.aqi}</span>
            {' '}· {p.category}
          </div>
          <div className="text-gray-400 text-xs">PM2.5: {p.pm25} µg/m³</div>
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

/**
 * @param {object} props
 * @param {object|null} props.hotspotsGeoJSON
 * @param {object|null} props.perimetersGeoJSON
 * @param {object|null} props.aqiGeoJSON
 * @param {object|null} props.alertsGeoJSON
 * @param {object|null} props.droughtGeoJSON
 */
export default function MapView({
  hotspotsGeoJSON,
  perimetersGeoJSON,
  aqiGeoJSON,
  alertsGeoJSON,
  droughtGeoJSON,
}) {
  const { layers, baseMap, selectFire, viewport, setViewport } = useApp();
  const mapRef = useRef(null);

  // Hover tooltip state
  const [hoverFeature, setHoverFeature] = useState(null);
  const [hoverLngLat,  setHoverLngLat]  = useState(null);

  // Handle map click – select fire for detail panel
  const handleClick = useCallback((evt) => {
    const features = evt.features;
    if (!features?.length) {
      selectFire(null);
      return;
    }

    const feature = features[0];
    const p = feature.properties;

    // Build a unified "selectedFire" object from whichever layer was clicked
    if (feature.layer.id === 'fire-hotspots-circle') {
      selectFire({
        type: 'hotspot',
        id:   p.id,
        lat:  evt.lngLat.lat,
        lng:  evt.lngLat.lng,
        frp:  p.frp,
        brightness: p.brightness,
        confidence: p.confidence,
        satellite:  p.satellite,
        acq_date:   p.acq_date,
        acq_time:   p.acq_time,
      });
    } else if (feature.layer.id === 'fire-perimeters-fill') {
      selectFire({
        type:        'perimeter',
        id:          p.UniqueFireIdentifier,
        name:        p.IncidentName,
        lat:         evt.lngLat.lat,
        lng:         evt.lngLat.lng,
        acres:       p.GISAcres,
        contained:   p.PercentContained,
        state:       p.POOState,
        county:      p.POOCounty,
        personnel:   p.TotalIncidentPersonnel,
        destroyed:   p.StructuresDestroyed,
        damaged:     p.StructuresDamaged,
        discovered:  p.FireDiscoveryDateTime,
        updated:     p.ModifiedOnDateTime,
        orgType:     p.IncidentManagementOrganization,
      });
    } else if (feature.layer.id === 'aqi-stations-circle') {
      selectFire({
        type:    'aqi',
        id:      p.id,
        name:    p.reportingArea,
        lat:     evt.lngLat.lat,
        lng:     evt.lngLat.lng,
        aqi:     p.aqi,
        category: p.category,
        pm25:    p.pm25,
      });
    }
  }, [selectFire]);

  // Handle mouse move for hover tooltip
  const handleMouseMove = useCallback((evt) => {
    const features = evt.features;
    if (features?.length) {
      setHoverFeature(features[0]);
      setHoverLngLat(evt.lngLat);
      // Change cursor to pointer
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
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoverFeature(null);
    setHoverLngLat(null);
    if (mapRef.current) {
      mapRef.current.getCanvas().style.cursor = '';
    }
  }, []);

  // Sync viewport to context
  const handleMove = useCallback((evt) => {
    setViewport(evt.viewState);
  }, [setViewport]);

  return (
    <div className="absolute inset-0">
      <Map
        ref={mapRef}
        {...viewport}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={getMapStyle(baseMap)}
        style={{ width: '100%', height: '100%' }}
        interactiveLayerIds={INTERACTIVE_LAYERS}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMove={handleMove}
        attributionControl={false}
        // Performance optimizations
        maxTileCacheSize={150}
        fadeDuration={150}
      >
        {/* Navigation controls */}
        <NavigationControl position="bottom-right" style={{ marginBottom: '6rem' }} />
        <ScaleControl position="bottom-left" style={{ marginLeft: '1rem', marginBottom: '1rem' }} />

        {/* ── Data Layers (ordered back-to-front) ── */}

        {/* Drought layer – rendered first (bottom) */}
        <DroughtLayer
          geoJSON={droughtGeoJSON}
          visible={layers.drought}
        />

        {/* GOES satellite imagery */}
        <GOESLayer visible={layers.goes} />

        {/* Smoke forecast */}
        <SmokeLayer visible={layers.smoke} />

        {/* Weather alert zones */}
        <WeatherAlertsLayer
          geoJSON={alertsGeoJSON}
          visible={layers.weatherAlerts}
        />

        {/* Fire perimeter polygons */}
        <FirePerimetersLayer
          geoJSON={perimetersGeoJSON}
          visible={layers.firePerimeters}
        />

        {/* AQI monitoring stations */}
        <AQILayer
          geoJSON={aqiGeoJSON}
          visible={layers.aqi}
        />

        {/* Fire hotspot points – rendered last (top) */}
        <FireHotspotsLayer
          geoJSON={hotspotsGeoJSON}
          visible={layers.fireHotspots}
        />

        {/* Hover tooltip */}
        <HoverTooltip feature={hoverFeature} lngLat={hoverLngLat} />
      </Map>
    </div>
  );
}
