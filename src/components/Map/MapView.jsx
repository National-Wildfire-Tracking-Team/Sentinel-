/**
 * MapView.jsx
 * Main interactive map component.
 * Hosts all data layers and handles user interaction (click, hover).
 * Uses react-map-gl with Mapbox GL JS and satellite imagery.
 */

import { useRef, useCallback, useMemo, useState } from 'react';
import Map, { NavigationControl, ScaleControl, Popup, Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import { useApp } from '../../context/AppContext';
import { formatAcres, formatContainment, formatFRP } from '../../utils/formatUtils';
import { frpToLabel } from '../../utils/colorUtils';

// Data layer components
import FireHotspotsLayer  from './layers/FireHotspotsLayer';
import FirePerimetersLayer from './layers/FirePerimetersLayer';
import FireIncidentsLayer  from './layers/FireIncidentsLayer';
import IncidentLocationsLayer from './layers/IncidentLocationsLayer'; // Added missing import
import AQILayer           from './layers/AQILayer';
import WeatherAlertsLayer from './layers/WeatherAlertsLayer';
import DroughtLayer       from './layers/DroughtLayer';
import SmokeLayer         from './layers/SmokeLayer';
import GOESLayer          from './layers/GOESLayer';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

// Quick helper if you don't already have one exported from utils
const num = (val) => Number(val); 

// ─── Base map style ───────────────────────────────────────────────────────────
const MAP_STYLE = 'mapbox://styles/mapbox/satellite-streets-v12';

// Layers that respond to click/hover events
const INTERACTIVE_LAYERS = [
  'fire-hotspots-circle',
  'fire-perimeters-fill',
  'fire-incidents-circle',
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
            FRP: <span className="text-white font-medium">{formatFRP(num(p.frp))}</span>
            {' '}· {frpToLabel(num(p.frp))} intensity
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
 * @param {object|null} props.incidentsGeoJSON // Fixed naming mismatch
 * @param {object|null} props.incidentDotsGeoJSON 
 * @param {object|null} props.aqiGeoJSON
 * @param {object|null} props.alertsGeoJSON
 * @param {object|null} props.droughtGeoJSON
 */
export default function MapView({
  hotspotsGeoJSON,
  perimetersGeoJSON,
  incidentsGeoJSON, // Renamed to match usage inside
  incidentDotsGeoJSON,
  aqiGeoJSON,
  alertsGeoJSON,
  droughtGeoJSON,
}) {
  const { layers, selectFire, viewport, setViewport } = useApp();
  const mapRef = useRef(null);

  // Hover tooltip state
  const [hoverFeature, setHoverFeature] = useState(null);
  const [hoverLngLat,  setHoverLngLat]  = useState(null);

  // Only include interactive layer IDs for layers that are currently visible
  const interactiveLayerIds = useMemo(() => {
    const ids = [];
    if (layers.fireHotspots && hotspotsGeoJSON)        ids.push('fire-hotspots-circle');
    if (layers.firePerimeters && perimetersGeoJSON)     ids.push('fire-perimeters-fill');
    if (layers.incidentLocations && incidentsGeoJSON)   ids.push('incident-locations-circle');
    if (layers.aqi && aqiGeoJSON)                       ids.push('aqi-stations-circle');
    if (layers.weatherAlerts && alertsGeoJSON)          ids.push('weather-alerts-fill');
    return ids;
  }, [layers.fireHotspots, layers.firePerimeters, layers.incidentLocations, layers.aqi, layers.weatherAlerts,
      hotspotsGeoJSON, perimetersGeoJSON, incidentsGeoJSON, aqiGeoJSON, alertsGeoJSON]);

  // Clear stale hover when layers change
  const prevLayersRef = useRef(layers);
  if (prevLayersRef.current !== layers) {
    prevLayersRef.current = layers;
    if (hoverFeature) {
      setHoverFeature(null);
      setHoverLngLat(null);
    }
  }

  // Handle map click – select fire for detail panel
  const handleClick = useCallback((evt) => {
    const features = evt.features;
    if (!features?.length) {
      selectFire(null);
      return;
    }

    const feature = features[0];
    const p = feature.properties;

    if (feature.layer.id === 'fire-hotspots-circle') {
      selectFire({
        type: 'hotspot',
        id:   p.id,
        lat:  evt.lngLat.lat,
        lng:  evt.lngLat.lng,
        frp:  num(p.frp),
        brightness: num(p.brightness),
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
    }
  }, [selectFire]);

  // Handle mouse move for hover tooltip
  const handleMouseMove = useCallback((evt) => {
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
        mapStyle={MAP_STYLE}
        style={{ width: '100%', height: '100%' }}
        interactiveLayerIds={interactiveLayerIds}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMove={handleMove}
        attributionControl={false}
        maxTileCacheSize={150}
        fadeDuration={150}
        projection="mercator"
      >
        {/* Navigation controls */}
        <NavigationControl position="bottom-right" style={{ marginBottom: '6rem' }} />
        <ScaleControl position="bottom-left" style={{ marginLeft: '1rem', marginBottom: '1rem' }} />

        {/* ── Data Layers (ordered back-to-front, each independently controlled via visibility) ── */}



        {/* Drought layer – rendered first (bottom) */}
        <DroughtLayer
          geoJSON={droughtGeoJSON}
          visible={false}
        />

        {/* GOES satellite imagery */}
        <GOESLayer eastVisible={layers.goesEast} westVisible={layers.goesWest} />

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

        {/* WFIGS incident location markers */}
        <IncidentLocationsLayer
          geoJSON={incidentsGeoJSON}
          visible={layers.incidentLocations}
        /> {/* <-- FIXED CLOSING TAG */}

        {/* Incident dot markers – fires with no matching perimeter */}
        <FireIncidentsLayer
          geoJSON={incidentDotsGeoJSON}
          visible={layers.incidentLocations}
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
