/**
 * MapView.jsx
 * Main interactive map component.
 * Hosts all data layers and handles user interaction (click, hover).
 * Uses react-map-gl with Mapbox GL JS and satellite imagery.
 */

import { useRef, useCallback, useMemo, useState } from 'react';
import Map, { NavigationControl, ScaleControl, Popup } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import { useApp } from '../../context/AppContext';
import { formatAcres, formatContainment, formatFRP } from '../../utils/formatUtils';
import { frpToLabel } from '../../utils/colorUtils';

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
    case 'fire-hotspots-box':
      content = (
        <>
          <div className="font-semibold text-orange-400">Raw FIRMS Record</div>
          <div className="text-gray-300 text-xs mt-0.5">
            FRP: <span className="text-white font-medium">{formatFRP(num(p.frp))}</span>
            {' '}· {frpToLabel(num(p.frp))} intensity
          </div>
          <div className="text-gray-400 text-xs">{p.satellite} · {p.source} · {p.acq_date}</div>
          <div className="text-gray-500 text-[10px] mt-1">
            ({num(p.latitude).toFixed(4)}, {num(p.longitude).toFixed(4)})
          </div>
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
 * @param {object|null} props.spcReportsGeoJSON
 * @param {object|null} props.iemReportsGeoJSON
 * @param {object|null} props.userReportsGeoJSON
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
  userReportsGeoJSON,
}) {
  const { layers, alerts, selectFire, viewport, setViewport } = useApp();
  const mapRef = useRef(null);
  const isWildfireTab = activeMapTab === 'wildfire';
  const isWeatherTab = activeMapTab === 'weather';

  // Hover tooltip state
  const [hoverFeature, setHoverFeature] = useState(null);
  const [hoverLngLat,  setHoverLngLat]  = useState(null);

  // Only include interactive layer IDs for layers that are currently visible
  const interactiveLayerIds = useMemo(() => {
    const ids = [];
    if (isWildfireTab && layers.fireHotspots && hotspotsGeoJSON)        ids.push('fire-hotspots-box');
    if (isWildfireTab && layers.firePerimeters && perimetersGeoJSON)     ids.push('fire-perimeters-fill');
    if (isWildfireTab && layers.incidentLocations && incidentsGeoJSON)   ids.push('incident-locations-circle');
    if (isWildfireTab && layers.userReports && userReportsGeoJSON)       ids.push('user-reports-circle');
    if (isWeatherTab && layers.aqi && aqiGeoJSON)                        ids.push('aqi-stations-circle');
    if (isWeatherTab && layers.weatherAlerts && alertsGeoJSON)           ids.push('weather-alerts-fill');
    if (isWeatherTab && layers.spcReports && spcReportsGeoJSON)          ids.push('spc-reports-circle');
    if (isWeatherTab && layers.iemReports && iemReportsGeoJSON)          ids.push('iem-reports-circle');
    return ids;
  }, [isWildfireTab, isWeatherTab, layers.fireHotspots, layers.firePerimeters, layers.incidentLocations, layers.aqi,
      layers.weatherAlerts, layers.spcReports, layers.iemReports, layers.userReports, hotspotsGeoJSON, perimetersGeoJSON,
      incidentsGeoJSON, aqiGeoJSON, alertsGeoJSON, spcReportsGeoJSON, iemReportsGeoJSON, userReportsGeoJSON]);

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

    if (feature.layer.id === 'fire-hotspots-box') {
      selectFire({
        type: 'hotspot',
        id:   p.id,
        lat:  num(p.latitude) || evt.lngLat.lat,
        lng:  num(p.longitude) || evt.lngLat.lng,
        frp:  num(p.frp),
        brightness: num(p.brightness),
        confidence: p.confidence,
        satellite:  p.satellite,
        source:     p.source,
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
    } else if (feature.layer.id === 'incident-locations-circle') {
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
        cause:     p.cause || 'Under Investigation',
        started:   p.started,
        updated:   p.updated,
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
  }, [alerts, selectFire]);

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

        {/* Smoke forecast */}
        <SmokeLayer visible={isWeatherTab && layers.smoke} />

        {/* Weather alert zones */}
        <WeatherAlertsLayer
          geoJSON={alertsGeoJSON}
          visible={isWeatherTab && layers.weatherAlerts}
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

        {/* Hover tooltip */}
        <HoverTooltip feature={hoverFeature} lngLat={hoverLngLat} />
      </Map>
    </div>
  );
}
