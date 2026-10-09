/**
 * MapView.jsx
 * Main interactive map component.
 * Hosts all data layers and handles user interaction (click, hover).
 * Uses react-map-gl with Mapbox GL JS and satellite imagery.
 */

import { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import Map, { Popup, Marker, Source, Layer } from 'react-map-gl';
import { Navigation } from 'lucide-react';
import 'mapbox-gl/dist/mapbox-gl.css';
import MapZoomControl from './MapZoomControl';

import { useApp } from '../../context/AppContext';
import { useAppStatus } from '../../context/AppStatusContext';
import { useViewport } from '../../context/ViewportContext';
import { usePreferences } from '../../context/PreferencesContext';
import { useWeatherModelsContext } from '../../context/WeatherModelsContext';
import { formatAcres, formatContainment, formatFRP, withClock } from '../../utils/formatUtils';
import MapFeaturePopup from './MapFeaturePopup';
import StormMapPopup from './StormMapPopup';
import NhcModelTracksLayer from './layers/NhcModelTracksLayer';
import { useSatelliteContext } from '../../context/SatelliteContext';
import { useNhcModelTracks } from '../../hooks/useNhcModelTracks';
import { buildCyclones, buildOutlookSystems } from '../../api/nhcTropicalWeather';
import SpotlightMaskLayer from './layers/SpotlightMaskLayer';
import { frpToLabel } from '../../utils/colorUtils';
import * as hrrRateLimiter from '../../utils/hrrRateLimiter';
import { FLOOD_CATEGORY_META, floodCategoryLabel } from '../../api/noaaWaterGauge';

// Data layer components
import FireHotspotsLayer  from './layers/FireHotspotsLayer';
import NgfsDetectionsLayer from './layers/NgfsDetectionsLayer';
import FirePerimetersLayer from './layers/FirePerimetersLayer';
import { perimeterCentroids } from './layers/perimeterCentroids';
import FireBehaviorModelingLayer from './layers/FireBehaviorModelingLayer';
import IncidentLocationsLayer from './layers/IncidentLocationsLayer';
import StateBoundariesLayer from './layers/StateBoundariesLayer';
import AQILayer           from './layers/AQILayer';
import WeatherAlertsLayer from './layers/WeatherAlertsLayer';
import SmokeLayer         from './layers/SmokeLayer';
import GOESLayer          from './layers/GOESLayer';
import StormReportsLayer  from './layers/StormReportsLayer';
import UserReportsLayer   from './layers/UserReportsLayer';
import SPCOutlookLayer from './layers/SPCOutlookLayer';
import StormMotionVectorLayer from './layers/StormMotionVectorLayer';
import EvacuationZonesLayer from './layers/EvacuationZonesLayer';
import { MeasurementLayer, MeasurementPanel } from './MeasurementTool';
import SPCOutlookSelector from './SPCOutlookSelector';
import RAWSLayer from './layers/RAWSLayer';
import AirNowMonitorsLayer from './layers/AirNowMonitorsLayer';
import DroughtOutlookLayer from './layers/DroughtOutlookLayer';
import NdgdSmokeForecastLayer from './layers/NdgdSmokeForecastLayer';
import NdgdSmokeTimeSlider from './NdgdSmokeTimeSlider';
import FireWeatherOutlookLayer from './layers/FireWeatherOutlookLayer';
import WpcEroLayer from './layers/WpcEroLayer';
import WpcWssiLayer from './layers/WpcWssiLayer';
import WpcQpfLayer from './layers/WpcQpfLayer';
import WpcFrontsLayer from './layers/WpcFrontsLayer';
import WpcMesoscaleDiscussionLayer from './layers/WpcMesoscaleDiscussionLayer';
import FireWeatherOutlookSelector from './FireWeatherOutlookSelector';
import CriticalInfrastructureLayer from './layers/CriticalInfrastructureLayer';
import NationalMapCollegesLayer from './layers/NationalMapCollegesLayer';
import CaliforniaLandOwnershipLayer from './layers/CaliforniaLandOwnershipLayer';
import FloodHazardLayer, { FLOOD_ZONES_FILL_ID, FLOOD_PANELS_FILL_ID } from './layers/FloodHazardLayer';
import { floodCategoryMeta } from '../../utils/floodHazard';
import { WATCH_WARNING_COLORS } from '../../api/nhcTropicalWeather';
import NHCTropicalWeatherLayer from './layers/NHCTropicalWeatherLayer';
import NhcWindHazardsLayer from './layers/NhcWindHazardsLayer';
import WaterGaugesLayer from './layers/WaterGaugesLayer';
import CaliforniaCamerasLayer from './layers/CaliforniaCamerasLayer';
import CalFirePerimetersLayer from './layers/CalFirePerimetersLayer';
import HazardEventsLayer, { HAZARD_CATEGORY_LABELS } from './layers/HazardEventsLayer';
import DamageAssessmentLayer from './layers/DamageAssessmentLayer';
import MrmsLayer from './layers/MrmsLayer';
import { parseAliasIds } from '../../utils/incidentAliases';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';
const HAS_MAPBOX_TOKEN = Boolean(MAPBOX_TOKEN.trim());

// Quick helper if you don't already have one exported from utils
const num = (val) => Number(val);

/**
 * FEMA flood-zone record for FireDetailPanel. The FIRM panel under the click
 * (a separate, transparent layer) supplies panel number and effective date;
 * `zoneProps` is null when the click hit a panel but no shaded flood zone.
 */
function buildFloodHazardRecord(zoneProps, lngLat, panelProps) {
  const zone = zoneProps || {};
  const panel = panelProps || {};
  const category = zoneProps ? zone.category : null;
  return {
    type: 'flood-hazard',
    id: zoneProps ? `zone-${zone.id}` : `panel-${panel.id ?? `${lngLat.lng},${lngLat.lat}`}`,
    name: zoneProps ? floodCategoryMeta(category).label : 'No shaded flood hazard mapped here',
    lat: lngLat.lat,
    lng: lngLat.lng,
    category,
    zone: zone.zone ?? null,
    subtype: zone.subtype ?? null,
    sfha: Boolean(zone.sfha),
    bfe: zone.bfe ?? null,
    depth: zone.depth ?? null,
    lengthUnit: zone.lengthUnit ?? null,
    velocity: zone.velocity ?? null,
    velocityUnit: zone.velocityUnit ?? null,
    verticalDatum: zone.verticalDatum ?? null,
    dfirmId: zone.dfirmId ?? panel.dfirmId ?? null,
    panel: panel.panel ?? null,
    panelType: panel.panelType ?? null,
    effectiveDate: panel.effectiveDate ?? null,
    unmapped: Boolean(panel.unmapped),
  };
}

/**
 * Turns one clicked Mapbox feature into the "fire" record shape selectFire
 * expects, keyed off the layer it came from. Pulled out of handleClick so a
 * click can build a record for every feature at the point (not just the
 * topmost one) when more than one stacks up, e.g. an evac zone over a fire
 * perimeter. Returns null for layers with their own selection slot (water
 * gauges, cameras, SPC MDs / WPC MPDs) — those stay handled directly in
 * handleClick.
 */
function buildFeatureRecord(feature, lngLat, alerts, { floodPanel = null } = {}) {
  const p = feature.properties;

  switch (feature.layer.id) {
    case FLOOD_ZONES_FILL_ID:
      return buildFloodHazardRecord(p, lngLat, floodPanel);

    case 'cmra-transmission-lines':
      return {
        type: 'transmission-line',
        id: p.OBJECTID ?? p.ID ?? `${lngLat.lng},${lngLat.lat}`,
        name: p.ID || 'Transmission line',
        lat: lngLat.lat,
        lng: lngLat.lng,
        lineId: p.ID,
        voltage: p.VOLTAGE,
        voltClass: p.VOLT_CLASS,
        lineType: p.TYPE,
        status: p.STATUS,
        owner: p.OWNER,
        naicsDesc: p.NAICS_DESC,
        source: p.SOURCE,
      };

    case 'eia-gas-pipelines':
      return {
        type: 'gas-pipeline',
        id: p.FID ?? p.OBJECTID ?? `${lngLat.lng},${lngLat.lat}`,
        name: p.Operator || 'Natural gas pipeline',
        lat: lngLat.lat,
        lng: lngLat.lng,
        pipeType: p.TYPEPIPE,
        operator: p.Operator,
        status: p.Status,
        shapeLeng: p.Shape_Leng,
        shapeLength: p.Shape__Length,
      };

    case 'national-map-colleges-circle':
      return {
        type: 'national-map-college',
        id: p.OBJECTID ?? p.FID ?? `${lngLat.lng},${lngLat.lat}`,
        name: p.NAME || p.name || 'School / university',
        lat: lngLat.lat,
        lng: lngLat.lng,
        ftype: p.FTYPE,
        properties: p,
      };

    case 'fire-hotspots-circle':
      return {
        type: 'hotspot',
        id:   p.id,
        lat:  num(p.latitude) || lngLat.lat,
        lng:  num(p.longitude) || lngLat.lng,
        frp:  num(p.frp),
        total_frp:       num(p.total_frp) || num(p.frp),
        brightness:      num(p.brightness),
        confidence:      p.confidence,
        satellite:       p.satellite,
        source:          p.source,
        acq_date:        p.acq_date,
        acq_time:        p.acq_time,
        detection_count: num(p.detection_count) || 1,
      };

    case 'fire-perimeters-fill':
    case 'fire-perimeter-centroids-circle':
      return {
        type:        'perimeter',
        id:          p.UniqueFireIdentifier,
        name:        p.IncidentName,
        lat:         lngLat.lat,
        lng:         lngLat.lng,
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
        source:      p._source || p.Source || null,
        historical:  Boolean(p.isHistoricalMapping),
        aliasIds:    parseAliasIds(p._aliasIds),
      };

    case 'fire-incidents-circle':
      return {
        type:       'incident',
        id:         p.UniqueFireIdentifier,
        name:       p.IncidentName,
        lat:        lngLat.lat,
        lng:        lngLat.lng,
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
        // CAL FIRE dots won the IRWIN/CAL FIRE merge (useMergedFireData).
        source:     p._source || null,
        url:        p._detailUrl || null,
        aliasIds:   parseAliasIds(p._aliasIds),
      };

    case 'incident-locations-circle': {
      let updates;
      let evacuationLines;
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
      return {
        type:      'incident',
        id:        p.id,
        name:      p.name,
        lat:       lngLat.lat,
        lng:       lngLat.lng,
        acres:     num(p.acres),
        contained: num(p.contained),
        state:     p.state,
        county:    p.county,
        personnel: num(p.personnel),
        status:    p.status,
        cause:     p.cause || 'Under Investigation',
        source:    p.source,
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
        aliasIds: parseAliasIds(p.alias_ids),
      };
    }

    case 'user-reports-circle':
      return {
        type:        'user-report',
        id:          p.id,
        name:        p.title,
        title:       p.title,
        description: p.description,
        lat:         lngLat.lat,
        lng:         lngLat.lng,
        created_at:  p.created_at,
        user_id:     p.user_id,
      };

    case 'hazard-events-circle':
      return {
        type:        'hazard-event',
        id:          p.id,
        name:        p.title,
        title:       p.title,
        category:    p.category,
        description: p.description,
        severity:    p.severity,
        status:      p.status,
        lat:         lngLat.lat,
        lng:         lngLat.lng,
        created_at:  p.created_at,
        user_id:     p.user_id,
      };

    case 'evac-zones-fill':
      if (p.source === 'reporter') {
        return {
          type:          'reporter-evacuation-zone',
          id:            p.id || null,
          name:          p.title || 'Reporter Evacuation Zone',
          title:         p.title,
          zone_type:     p.zone_type,
          incident_name: p.incident_name,
          description:   p.description,
          county:        p.county,
          state:         p.state,
          effective_at:  p.effective_at,
          expires_at:    p.expires_at,
          source:        'reporter',
          lat:           lngLat.lat,
          lng:           lngLat.lng,
          geometry:      feature.geometry,
        };
      } else {
        const isIpaws = p.source === 'ipaws';
        return {
          type:           'evacuation-zone',
          id:             p.id || null,
          name:           p.zoneName || 'Evacuation Zone',
          warningType:    p.warningType,
          zoneName:       p.zoneName,
          county:         p.county,
          agency:         p.agency         || null,
          jurisdiction:   p.jurisdiction   || null,
          instructions:   p.instructions   || null,
          comments:       p.comments       || null,
          externalURL:    p.externalURL,
          effectiveDate:  p.effectiveDate,
          expirationDate: p.expirationDate,
          source:         p.source         || null,
          lat:            lngLat.lat,
          lng:            lngLat.lng,
          geometry:       feature.geometry,
          ...(isIpaws && {
            ipawsIdentifier: p.ipawsIdentifier,
            ipawsHeadline: p.ipawsHeadline,
            ipawsDescription: p.ipawsDescription,
            ipawsEvent: p.ipawsEvent,
            ipawsSent: p.ipawsSent,
            ipawsExpires: p.ipawsExpires,
            ipawsSenderName: p.ipawsSenderName,
            ipawsInstruction: p.ipawsInstruction,
            ipawsAreaDesc: p.ipawsAreaDesc,
          }),
        };
      }

    case 'aqi-stations-circle':
      return {
        type:    'aqi',
        id:      p.id,
        name:    p.reportingArea,
        lat:     lngLat.lat,
        lng:     lngLat.lng,
        aqi:     num(p.aqi),
        category: p.category,
        pm25:    num(p.pm25),
      };

    case 'weather-alerts-fill': {
      // Look up the full alert object from context so we get description, instruction, etc.
      // We spread full alert but override `type` with the routing key 'weather-alert',
      // preserving the NOAA event name as `eventType` (e.g. "Flood Advisory").
      const full = alerts?.find(a => a.id === p.id);
      if (full) {
        return { ...full, type: 'weather-alert', eventType: full.type };
      }
      return {
        type:      'weather-alert',
        eventType: p.type,
        id:        p.id,
        headline:  p.headline,
        severity:  p.severity,
        expires:   p.expires,
        geometry:  feature.geometry,
      };
    }

    default:
      return null;
  }
}

/** NDGD GeoJSON uses epoch ms in `todate` / `Todate` for the valid forecast hour */
function ndgdFeatureToDateMs(feature) {
  const p = feature?.properties;
  if (!p) return null;
  const raw = p.todate ?? p.Todate;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// ─── Base map styles ──────────────────────────────────────────────────────────
// 'satellite' uses Mapbox's Standard Satellite ("Worldview") style — photoreal
// satellite imagery with native support for 3D terrain, buildings, and lighting.
const MAP_STYLES = {
  satellite: HAS_MAPBOX_TOKEN
    ? 'mapbox://styles/mapbox/standard-satellite'
    : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  rendered: HAS_MAPBOX_TOKEN
    ? 'mapbox://styles/mapbox/dark-v11'
    : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
};

// 3D terrain elevation source (Mapbox-hosted DEM tiles; requires a Mapbox token)
const TERRAIN_SOURCE_ID = 'mapbox-dem';

// Atmosphere/space styling for the globe projection — gives the map a
// Google-Earth-like halo at the horizon and a starfield when zoomed out.
const GLOBE_FOG = {
  range: [0.5, 10],
  color: 'rgb(30, 35, 45)',
  'high-color': 'rgb(20, 30, 55)',
  'horizon-blend': 0.03,
  'space-color': 'rgb(2, 4, 10)',
  'star-intensity': 0.3,
};

/**
 * Tooltip shown on hover
 */
const OUTLOOK_LAYER_IDS = new Set(['spc-outlook-fill', 'drought-outlook-fill', 'fire-weather-outlook-fill', 'nhc-disturbance-fill', 'nhc-disturbance-circle', 'nhc-track-circle', 'nhc-obs-circle', 'nhc-watch-warning-line', 'nhc-wind-prob-fill', 'nhc-wind-radii-fill', 'wpc-ero-fill', 'wpc-wssi-fill', 'wpc-qpf-fill', 'wpc-fronts-solid', 'wpc-fronts-dashed', 'wpc-fronts-stationary-line']);

// Warning and mesoscale-discussion hover boxes share one fixed width so they
// line up cleanly when stacked together above the cursor.
const HOVER_MATCHED_WIDTH_LAYER_IDS = new Set(['weather-alerts-fill', 'spc-md-fill', 'wpc-mpd-fill']);

// Caltrans only reports a camera's facing as a cardinal direction (no
// numeric bearing in the source data) — map it to degrees so the hover
// tooltip can render a rotated direction arrow for quick recognition.
const CAMERA_DIRECTION_DEGREES = { North: 0, East: 90, South: 180, West: 270 };

// NHC storm layers a click can open the storm popup from, and how the popup
// names what was clicked.
// Outlook layers (invest disturbances, areas of interest) open the same popup.
const OUTLOOK_CLICK_LAYERS = {
  'nhc-disturbance-circle': 'Disturbance',
  'nhc-disturbance-fill': 'Area of interest',
};

const STORM_CLICK_LAYERS = {
  'nhc-cone-fill': () => 'Cone of uncertainty',
  'nhc-forecast-track-line': () => 'Forecast track',
  'nhc-track-circle': (p) => (p.isCurrent === true || p.isCurrent === 'true' ? 'Current position' : `Forecast +${p.tau} hr`),
  'nhc-obs-circle': () => 'Past track',
};

// Builds the hover-tooltip content for a single map feature. Returns null
// when the feature's layer has no hover tooltip defined.
function getHoverContent(feature) {
  const p = feature.properties;
  const layerId = feature.layer.id;
  const isOutlookPopup = OUTLOOK_LAYER_IDS.has(layerId);

  let content;
  switch (layerId) {
    case 'fire-hotspots-circle': {
      const detections = num(p.detection_count) || 1;
      const isConsolidated = detections > 1;
      content = (
        <>
          <div className="font-semibold text-orange-400">
            {isConsolidated ? `FIRMS Detection (${detections} sensors)` : 'FIRMS Detection'}
          </div>
          <div className="text-sentinel-200 text-xs mt-0.5">
            FRP: <span className="text-white font-medium">{formatFRP(num(p.frp))}</span>
            {' '}· {frpToLabel(num(p.frp))} intensity
            {isConsolidated && (
              <span className="text-sentinel-300"> · Combined: {formatFRP(num(p.total_frp))}</span>
            )}
          </div>
          <div className="text-sentinel-300 text-xs">{p.satellite} · {p.acq_date}</div>
          <div className="text-sentinel-400 text-[10px] mt-1">
            ({num(p.latitude).toFixed(4)}, {num(p.longitude).toFixed(4)})
          </div>
        </>
      );
      break;
    }
    case 'ngfs-detections-fill': {
      content = (
        <>
          <div className="font-semibold text-orange-400">GOES Fire Detection</div>
          <div className="text-sentinel-200 text-xs mt-0.5">
            FRP: <span className="text-white font-medium">{formatFRP(num(p.frp))}</span>
            {' '}· {p.confidence} confidence
          </div>
          <div className="text-sentinel-300 text-xs">{p.satellite} · {p.acq_date_time}</div>
          <div className="text-sentinel-400 text-[10px] mt-1">
            ({num(p.latitude).toFixed(4)}, {num(p.longitude).toFixed(4)})
          </div>
        </>
      );
      break;
    }
    case 'fire-perimeters-fill':
    case 'fire-perimeter-centroids-circle': {
      const isHistorical = Boolean(p.isHistoricalMapping);
      content = (
        <>
          <div className={`font-semibold ${isHistorical ? 'text-sentinel-300' : 'text-orange-400'}`}>
            {p.IncidentName}
            {isHistorical && (
              <span className="ml-1.5 text-[10px] font-normal uppercase tracking-wide text-sentinel-400">
                Previous mapping
              </span>
            )}
          </div>
          <div className="text-sentinel-200 text-xs mt-0.5">
            {formatAcres(num(p.GISAcres))} · {formatContainment(num(p.PercentContained))} contained
          </div>
          <div className="text-sentinel-300 text-xs">{p.POOState} · {p.POOCounty} County</div>
        </>
      );
      break;
    }
    case 'aqi-stations-circle':
      content = (
        <>
          <div className="font-semibold text-blue-400">{p.reportingArea}</div>
          <div className="text-sentinel-200 text-xs mt-0.5">
            AQI: <span className="text-white font-medium">{num(p.aqi)}</span>
            {' '}· {p.category}
          </div>
          <div className="text-sentinel-300 text-xs">PM2.5: {num(p.pm25)} µg/m³</div>
        </>
      );
      break;
    case 'fire-incidents-circle':
      content = (
        <>
          <div className="font-semibold text-orange-400">{p.IncidentName}</div>
          <div className="text-sentinel-200 text-xs mt-0.5">
            {formatAcres(p.GISAcres)} · {formatContainment(p.PercentContained)} contained
          </div>
          <div className="text-sentinel-300 text-xs">{p.POOState} · {p.POOCounty} County</div>
        </>
      );
      break;
    case 'weather-alerts-fill':
      content = (
        <>
          <div className="font-semibold text-red-400">{p.type}</div>
          <div className="text-sentinel-200 text-xs mt-0.5 max-w-[200px] line-clamp-2">{p.headline}</div>
        </>
      );
      break;
    case 'nws-lsr-reports-circle':
      content = (
        <>
          <div className="font-semibold text-sky-300">
            {p.reportType} <span className="text-sentinel-300">
              (NWS LSR{p.nwsLsrWindow ? ` · ${p.nwsLsrWindow}` : ''})
            </span>
          </div>
          {p.lsrDescription && (
            <div className="text-sentinel-200 text-xs mt-0.5 line-clamp-2">{p.lsrDescription}</div>
          )}
          {p.wfo && <div className="text-sentinel-300 text-xs">{p.wfo}</div>}
          <div className="text-sentinel-200 text-xs mt-0.5">
            {p.city ? `${p.city}, ` : ''}{p.state}
            {p.county ? ` · ${p.county} County` : ''}
          </div>
          {p.magnitude && <div className="text-sentinel-200 text-xs">Magnitude: {p.magnitude}</div>}
          {p.reportedAt && (
            <div className="text-sentinel-300 text-xs">
              {new Date(p.reportedAt).toLocaleString(undefined, withClock())}
            </div>
          )}
          {p.comments && (
            <div className="text-sentinel-300 text-xs mt-1 max-w-[220px] line-clamp-3">{p.comments}</div>
          )}
        </>
      );
      break;
    case 'spc-md-fill': {
      const tillStr = p.activeTill ? `Active till ${p.activeTill}` : null;
      content = (
        <>
          <div className="font-semibold text-red-400">
            {p.name || 'Mesoscale Discussion'}
          </div>
          {tillStr && (
            <div className="text-sentinel-200 text-xs mt-0.5">{tillStr}</div>
          )}
          <div className="text-sentinel-300 text-xs mt-0.5">SPC Mesoscale Discussion</div>
          <div className="text-sky-400 text-xs mt-1">Click for full discussion</div>
        </>
      );
      break;
    }
    case 'wpc-mpd-fill': {
      const tillStr = p.activeTill ? `Active till ${p.activeTill}` : null;
      content = (
        <>
          <div className="font-semibold text-green-400">
            {p.mpdNumber != null ? `MPD ${p.mpdNumber}` : 'Mesoscale Discussion'}
          </div>
          {p.concerning && (
            <div className="text-sentinel-200 text-xs mt-0.5">{p.concerning}</div>
          )}
          {tillStr && (
            <div className="text-sentinel-200 text-xs mt-0.5">{tillStr}</div>
          )}
          <div className="text-sentinel-300 text-xs mt-0.5">WPC Mesoscale Discussion</div>
          <div className="text-sky-400 text-xs mt-1">Click for full discussion</div>
        </>
      );
      break;
    }
    case 'spc-outlook-fill': {
      const dayNum = String(p.day || '').replace('day', '');
      const typeLabel = (() => {
        const t = p.outlookType || 'categorical';
        const map = { categorical: 'Categorical', tornado: 'Tornado Prob.', hail: 'Hail Prob.', wind: 'Wind Prob.', severe: 'Severe Prob.' };
        return map[t] || t;
      })();
      const validStr = p.validTime
        ? (() => {
            const s = String(p.validTime);
            if (s.length === 12) {
              const yr = s.slice(0, 4), mo = s.slice(4, 6), dy = s.slice(6, 8), hr = s.slice(8, 10), mn = s.slice(10, 12);
              const d = new Date(`${yr}-${mo}-${dy}T${hr}:${mn}Z`);
              return isNaN(d.getTime()) ? null : d.toLocaleString(undefined, withClock({ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }));
            }
            return null;
          })()
        : null;
      content = (
        <>
          <div className="font-semibold text-yellow-300">
            SPC Day {dayNum} · {typeLabel}
          </div>
          <div className="text-sentinel-100 text-xs mt-0.5">
            {p.outlookLabel || p.riskCategory || (p.probPct != null ? `${p.probPct}% probability` : 'Outlook')}
          </div>
          {validStr && (
            <div className="text-sentinel-300 text-xs mt-0.5">Valid: {validStr}</div>
          )}
        </>
      );
      break;
    }
    case 'user-reports-circle':
      content = (
        <>
          <div className="font-semibold text-orange-400">{p.title}</div>
          <div className="text-sentinel-200 text-xs mt-0.5">
            {p.contained != null ? `${formatContainment(num(p.contained))} contained` : 'Fire incident'}
          </div>
          {p.created_at && (
            <div className="text-sentinel-300 text-xs">
              {new Date(p.created_at).toLocaleString(undefined, withClock())}
            </div>
          )}
        </>
      );
      break;
    case 'hazard-events-circle': {
      content = (
        <>
          <div className="font-semibold text-purple-300">{p.title}</div>
          <div className="text-sentinel-200 text-xs mt-0.5">
            {HAZARD_CATEGORY_LABELS[p.category] || 'Event'} · {p.severity}
          </div>
          {p.created_at && (
            <div className="text-sentinel-300 text-xs">
              {new Date(p.created_at).toLocaleString(undefined, withClock())}
            </div>
          )}
        </>
      );
      break;
    }
    case 'incident-locations-cluster': {
      const total = num(p.point_count);
      const active = num(p.activeCount);
      content = (
        <>
          <div className="font-semibold text-orange-400">
            {total} incident{total === 1 ? '' : 's'}
          </div>
          <div className="text-sentinel-200 text-xs mt-0.5">
            {active} active · {total - active} fully contained
          </div>
          <div className="text-sentinel-400 text-[10px] mt-1">Click to zoom in</div>
        </>
      );
      break;
    }
    case 'incident-locations-circle':
      content = (
        <>
          <div className="font-semibold text-orange-400">{p.name}</div>
          <div className="text-sentinel-200 text-xs mt-0.5">
            {formatAcres(num(p.acres))} · {formatContainment(num(p.contained))} contained
          </div>
          <div className="text-sentinel-300 text-xs">{p.county} Co., {p.state}</div>
        </>
      );
      break;
    case 'raws-stations-circle': {
      const fmt  = (v, unit) => v != null ? `${Math.round(v)}${unit}` : '—';
      const fmtD = (v) => v != null ? `${Math.round(v)}°` : '—';
      content = (
        <>
          <div className="font-semibold text-purple-300">{p.stationName}</div>
          <div className="text-sentinel-300 text-[10px]">
            {[p.county && `${p.county} Co.`, p.state, p.agency].filter(Boolean).join(' · ')}
          </div>
          <div className="text-sentinel-200 text-xs mt-1.5 space-y-0.5">
            <div>
              Temp: <span className="text-white font-medium">{fmt(p.temp, '°F')}</span>
              {' '}· RH: <span className="text-white font-medium">{fmt(p.relHumidity, '%')}</span>
            </div>
            <div>
              Wind: <span className="text-white font-medium">{fmt(p.windSpeed, ' mph')}</span>
              {' '}@ <span className="text-white font-medium">{fmtD(p.windDir)}</span>
              {p.windSpeedPeak != null && (
                <span className="text-sentinel-300"> (peak {fmt(p.windSpeedPeak, ' mph')})</span>
              )}
            </div>
            {(p.fuelMoisture != null || p.fuelTemp != null) && (
              <div>
                {p.fuelMoisture != null && <>FM: <span className="text-white font-medium">{fmt(p.fuelMoisture, '%')}</span></>}
                {p.fuelMoisture != null && p.fuelTemp != null && ' · '}
                {p.fuelTemp != null && <>Fuel Temp: <span className="text-white font-medium">{fmt(p.fuelTemp, '°F')}</span></>}
              </div>
            )}
            {p.precip != null && p.precip > 0 && (
              <div>Precip: <span className="text-white font-medium">{p.precip.toFixed(2)}"</span></div>
            )}
          </div>
          <div className="text-sentinel-400 text-[10px] mt-1 flex justify-between gap-3">
            {p.elevation != null && <span>Elev: {Math.round(p.elevation).toLocaleString()} ft</span>}
            {p.observationTime && <span>{new Date(p.observationTime).toLocaleTimeString([], withClock({ hour: '2-digit', minute: '2-digit' }))}</span>}
          </div>
        </>
      );
      break;
    }
    case 'evac-zones-fill': {
      const isReporter = p.source === 'reporter';
      const isIpaws = p.source === 'ipaws';

      if (isReporter) {
        const zoneTypeColors = {
          'evacuation order':   'text-red-400',
          'evacuation warning': 'text-orange-400',
          'evacuation watch':   'text-yellow-400',
        };
        const ztKey = (p.zone_type || '').toLowerCase();
        const ztClass = zoneTypeColors[ztKey] || 'text-red-400';
        content = (
          <>
            <div className={`font-semibold ${ztClass}`}>{p.zone_type || 'Evacuation Zone'}</div>
            {p.title && <div className="text-white text-xs mt-0.5 font-medium">{p.title}</div>}
            {p.incident_name && (
              <div className="text-orange-300 text-xs mt-0.5">Fire: {p.incident_name}</div>
            )}
            {(p.county || p.state) && (
              <div className="text-sentinel-200 text-xs">
                {[p.county && `${p.county} County`, p.state].filter(Boolean).join(', ')}
              </div>
            )}
            {p.effective_at && (
              <div className="text-sentinel-300 text-xs">
                Effective: {new Date(p.effective_at).toLocaleString(undefined, withClock())}
              </div>
            )}
            <div className="text-[#0096ff] text-[10px] mt-1 uppercase tracking-wider">Reporter Zone</div>
          </>
        );
        break;
      }

      if (isIpaws) {
        content = (
          <>
            <div className="font-semibold text-amber-400">IPAWS / EAS</div>
            <div className="text-white text-xs mt-0.5 font-medium">{p.ipawsHeadline || p.zoneName}</div>
            {p.ipawsAreaDesc && <div className="text-sentinel-200 text-xs">{p.ipawsAreaDesc}</div>}
            {(p.ipawsSent || p.effectiveDate) && (
              <div className="text-sentinel-300 text-xs mt-1">
                {new Date(p.ipawsSent || p.effectiveDate).toLocaleString(undefined, withClock())}
              </div>
            )}
          </>
        );
        break;
      }
      const statusColors = {
        'evacuation order':   'text-red-400',
        'evacuation warning': 'text-orange-400',
        'evacuation watch':   'text-yellow-400',
      };
      const statusKey = (p.warningType || '').toLowerCase();
      const statusClass = statusColors[statusKey] || 'text-orange-400';
      content = (
        <>
          <div className={`font-semibold ${statusClass}`}>{p.warningType || 'Evacuation Zone'}</div>
          {p.zoneName && <div className="text-white text-xs mt-0.5 font-medium">{p.zoneName}</div>}
          {p.county && <div className="text-sentinel-200 text-xs">{p.county} County</div>}
          {p.agency && <div className="text-sentinel-300 text-xs">{p.agency}</div>}
          {p.effectiveDate && (
            <div className="text-sentinel-300 text-xs">
              Effective: {new Date(p.effectiveDate).toLocaleString(undefined, withClock())}
            </div>
          )}
          {p.instructions && (
            <div className="text-sentinel-300 text-xs mt-1 max-w-[220px] line-clamp-2">{p.instructions}</div>
          )}
        </>
      );
      break;
    }
    case 'drought-outlook-fill': {
      const outlookLabel = {
        Drought_Develops: 'Drought Likely to Develop',
        Drought_Persists: 'Drought Likely to Persist',
        Drought_Improves: 'Drought Likely to Improve',
        Drought_Removes:  'Drought Likely to End',
        No_Drought:       'No Drought Expected',
      }[p.outlook] || p.outlook || 'Drought Outlook';
      content = (
        <>
          <div className="font-semibold text-amber-400">CPC Drought Outlook</div>
          <div className="text-white text-xs mt-0.5 font-medium">{outlookLabel}</div>
          {p.target && <div className="text-sentinel-200 text-xs">Forecast: {p.target}</div>}
          {p.fcst_date && <div className="text-sentinel-300 text-xs">Issued: {p.fcst_date}</div>}
        </>
      );
      break;
    }
    case 'ndgd-smoke-forecast-fill': {
      const refMs = typeof p.referencedate === 'number' ? p.referencedate : null;
      const toMs = typeof p.todate === 'number' ? p.todate : null;
      const fmt = (ms) => {
        if (ms == null || !Number.isFinite(ms)) return null;
        const d = new Date(ms);
        return Number.isNaN(d.getTime()) ? null : d.toLocaleString(undefined, withClock({ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }));
      };
      const refStr = fmt(refMs);
      const toStr = fmt(toMs);
      const band = p.smoke_classdesc ? `${p.smoke_classdesc} µg/m³` : 'Smoke concentration';
      content = (
        <>
          <div className="font-semibold text-yellow-200">NOAA Smoke Forecast</div>
          <div className="text-white text-xs mt-0.5 font-medium">{band}</div>
          {refStr && <div className="text-sentinel-200 text-xs">From: {refStr}</div>}
          {toStr && <div className="text-sentinel-300 text-xs">To: {toStr}</div>}
        </>
      );
      break;
    }
    case 'airnow-monitors-circle': {
      const aqiColor = (aqi) => {
        if (aqi == null) return '#94a3b8';
        if (aqi <= 50)  return '#00e400';
        if (aqi <= 100) return '#ffff00';
        if (aqi <= 150) return '#ff7e00';
        if (aqi <= 200) return '#ff0000';
        if (aqi <= 300) return '#8f3f97';
        return '#7e0023';
      };
      const aqiCategory = (aqi) => {
        if (aqi == null) return 'No Data';
        if (aqi <= 50)  return 'Good';
        if (aqi <= 100) return 'Moderate';
        if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
        if (aqi <= 200) return 'Unhealthy';
        if (aqi <= 300) return 'Very Unhealthy';
        return 'Hazardous';
      };
      const primaryAqi = p.aqi != null ? num(p.aqi) : null;
      content = (
        <>
          <div className="font-semibold text-sky-300">{p.siteName || 'AirNow Monitor'}</div>
          {p.stateName && <div className="text-sentinel-300 text-[10px]">{p.stateName}</div>}
          <div className="mt-1.5 space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: aqiColor(primaryAqi) }}
              />
              <span className="text-sentinel-200 text-xs">
                AQI: <span className="text-white font-medium">{primaryAqi ?? 'ND'}</span>
                {primaryAqi != null && (
                  <span className="text-sentinel-300"> · {aqiCategory(primaryAqi)}</span>
                )}
              </span>
            </div>
            {p.pm25Aqi != null && (
              <div className="text-sentinel-200 text-xs">
                PM2.5 AQI: <span className="text-white font-medium">{num(p.pm25Aqi)}</span>
              </div>
            )}
            {p.pm10Aqi != null && (
              <div className="text-sentinel-200 text-xs">
                PM10 AQI: <span className="text-white font-medium">{num(p.pm10Aqi)}</span>
              </div>
            )}
            {p.ozoneAqi != null && (
              <div className="text-sentinel-200 text-xs">
                Ozone AQI: <span className="text-white font-medium">{num(p.ozoneAqi)}</span>
              </div>
            )}
          </div>
          {p.localTime && (
            <div className="text-sentinel-400 text-[10px] mt-1">{p.localTime}</div>
          )}
        </>
      );
      break;
    }
    case 'fire-weather-outlook-fill': {
      const dayNum = String(p.day || '').replace('day', '');
      const typeLabel = p.outlookType === 'dry_thunderstorm' ? 'Dry Lightning' : 'Wind & Low RH';
      const riskColors = {
        ELEVATED: 'text-yellow-300',
        CRITICAL: 'text-red-400',
        EXTREME:  'text-fuchsia-400',
      };
      const riskClass = riskColors[p.riskCategory] || 'text-orange-300';
      content = (
        <>
          <div className="font-semibold text-orange-300">
            SPC Fire Wx Day {dayNum} · {typeLabel}
          </div>
          <div className={`text-xs mt-0.5 font-medium ${riskClass}`}>
            {p.outlookLabel || p.riskCategory || 'Fire Weather Outlook'}
          </div>
        </>
      );
      break;
    }
    case 'wpc-ero-fill': {
      const dayNum = String(p.day || '').replace('day', '');
      const riskColors = {
        MARGINAL: 'text-green-400',
        SLIGHT:   'text-yellow-300',
        MODERATE: 'text-red-400',
        HIGH:     'text-fuchsia-400',
      };
      const riskClass = riskColors[p.riskCategory] || 'text-green-400';
      content = (
        <>
          <div className="font-semibold text-sky-300">WPC Excessive Rainfall Outlook · Day {dayNum}</div>
          <div className={`text-xs mt-0.5 font-medium ${riskClass}`}>
            {p.outlookLabel || p.riskCategory || 'Excessive Rainfall Outlook'}
          </div>
        </>
      );
      break;
    }
    case 'wpc-wssi-fill': {
      const dayNum = String(p.day || '').replace('day', '');
      const impactColors = {
        'WINTER WEATHER AREA': 'text-sentinel-200',
        MINOR:    'text-sky-300',
        MODERATE: 'text-blue-400',
        MAJOR:    'text-purple-400',
        EXTREME:  'text-red-400',
      };
      const impactClass = impactColors[p.impactCategory] || 'text-sentinel-200';
      content = (
        <>
          <div className="font-semibold text-blue-300">WPC Winter Storm Severity Index · Day {dayNum}</div>
          <div className={`text-xs mt-0.5 font-medium ${impactClass}`}>
            {p.impactCategory || 'Overall Impact'}
          </div>
        </>
      );
      break;
    }
    case 'wpc-qpf-fill': {
      const dayNum = String(p.day || '').replace('day', '');
      content = (
        <>
          <div className="font-semibold text-sky-300">WPC 24hr QPF · Day {dayNum}</div>
          <div className="text-xs mt-0.5 font-medium text-white">
            {p.qpf != null ? `${p.qpf}"+ ${p.units || 'Inches'}` : 'Precipitation forecast'}
          </div>
        </>
      );
      break;
    }
    case 'wpc-fronts-solid':
    case 'wpc-fronts-dashed':
    case 'wpc-fronts-stationary-line': {
      const frontColors = {
        COLD: 'text-blue-400',
        WARM: 'text-red-400',
        STATIONARY: 'text-purple-400',
        OCCLUDED: 'text-purple-300',
        TROUGH: 'text-amber-400',
      };
      const frontClass = frontColors[p.frontType] || 'text-purple-300';
      content = (
        <>
          <div className={`font-semibold ${frontClass}`}>
            {p.frontType ? `${p.frontType.charAt(0)}${p.frontType.slice(1).toLowerCase()} Front` : 'Front'}
          </div>
          <div className="text-sentinel-300 text-[10px] mt-0.5">WPC Surface Analysis</div>
        </>
      );
      break;
    }
    case 'nhc-disturbance-fill':
    case 'nhc-disturbance-circle': {
      const chanceColors = { HIGH: 'text-red-400', MEDIUM: 'text-orange-400', LOW: 'text-yellow-300' };
      const chanceClass  = chanceColors[p.formationChance] || 'text-yellow-300';
      content = (
        <>
          <div className="font-semibold text-sky-300">NHC Tropical Weather Outlook</div>
          {p.formationChance && (
            <div className={`text-xs mt-0.5 font-medium ${chanceClass}`}>
              {p.formationChance} formation probability
            </div>
          )}
          <div className="text-sentinel-200 text-xs mt-0.5">
            {p.day2Percent != null && <span>2-day: {p.day2Percent}%</span>}
            {p.day2Percent != null && p.day7Percent != null && <span> · </span>}
            {p.day7Percent != null && <span>7-day: {p.day7Percent}%</span>}
          </div>
        </>
      );
      break;
    }
    case 'nhc-obs-circle':
    case 'nhc-track-circle': {
      const catColors = {
        'Tropical Depression': 'text-sky-300',
        'Tropical Storm':      'text-cyan-300',
        'Category 1':          'text-yellow-200',
        'Category 2':          'text-yellow-300',
        'Category 3':          'text-orange-300',
        'Category 4':          'text-orange-400',
        'Category 5':          'text-red-400',
      };
      const catClass = catColors[p.category] || 'text-sky-300';
      const isObserved = feature.layer.id === 'nhc-obs-circle';
      const windKt  = isObserved ? p.intensityKt  : p.maxWindKt;
      const windMph = isObserved ? p.intensityMph : p.maxWindMph;
      content = (
        <>
          <div className="font-semibold text-sky-300">
            {p.stormName ? `${p.stormName} · ` : ''}
            {isObserved ? 'Observed' : p.isCurrent ? 'Current position' : `Forecast +${p.tau}h`}
          </div>
          <div className={`text-xs mt-0.5 font-medium ${catClass}`}>
            {p.stormType || p.category}
          </div>
          {windKt > 0 && (
            <div className="text-sentinel-200 text-xs mt-0.5">
              Winds: {windMph} mph ({windKt} kt){p.gustKt > 0 && ` · Gusts: ${p.gustKt} kt`}
            </div>
          )}
          {(p.dateLabel || p.fullDateLabel) && (
            <div className="text-sentinel-300 text-[10px] mt-0.5">{p.fullDateLabel || p.dateLabel}</div>
          )}
        </>
      );
      break;
    }
    case 'nhc-wind-prob-fill': {
      const kt = Number(p.thresholdKt) || 34;
      content = (
        <>
          <div className="font-semibold text-sky-300">NHC wind-speed probability</div>
          <div className="text-white text-sm font-bold mt-0.5">{p.percentage} chance</div>
          <div className="text-sentinel-200 text-xs mt-0.5">
            of {kt}-kt ({Math.round(kt * 1.15078)} mph) or stronger sustained winds in the next 5 days
          </div>
        </>
      );
      break;
    }
    case 'nhc-wind-radii-fill': {
      const kt = Number(p.radiiKt) || 34;
      const quadrants = ['ne', 'se', 'sw', 'nw']
        .filter((q) => Number.isFinite(Number(p[q])))
        .map((q) => `${q.toUpperCase()} ${Number(p[q])} nm`);
      content = (
        <>
          <div className="font-semibold text-sky-300">NHC wind field · now</div>
          <div className="text-white text-xs font-semibold mt-0.5">
            {kt}-kt ({Math.round(kt * 1.15078)} mph) sustained winds extend:
          </div>
          {quadrants.length > 0 && <div className="text-sentinel-200 text-xs mt-0.5">{quadrants.join(' · ')}</div>}
        </>
      );
      break;
    }
    case 'nhc-watch-warning-line': {
      const wwColor = WATCH_WARNING_COLORS[p.wwType] || WATCH_WARNING_COLORS.Advisory;
      content = (
        <>
          <div className="font-semibold text-white flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: wwColor }} />
            {p.wwType || 'Advisory'}
          </div>
          {p.stormName && (
            <div className="text-sentinel-200 text-xs mt-0.5">{p.stormName}</div>
          )}
        </>
      );
      break;
    }
    case 'cmra-transmission-lines': {
      const kv = (label, val) => (val != null && String(val).trim() !== '' ? (
        <div className="text-sentinel-200 text-xs">
          {label}: <span className="text-white font-medium">{String(val)}</span>
        </div>
      ) : null);
      content = (
        <>
          <div className="font-semibold text-amber-300">Transmission line</div>
          {kv('ID', p.ID)}
          {kv('Voltage (kV)', p.VOLTAGE)}
          {kv('Class', p.VOLT_CLASS)}
          {kv('Type', p.TYPE)}
          {kv('Status', p.STATUS)}
          {kv('Owner', p.OWNER)}
          {p.NAICS_DESC && (
            <div className="text-sentinel-300 text-[10px] mt-1 line-clamp-2">{p.NAICS_DESC}</div>
          )}
          <div className="text-sentinel-400 text-[10px] mt-1">CMRA · U.S. electric transmission (archive)</div>
        </>
      );
      break;
    }
    case 'eia-gas-pipelines': {
      const k = (label, val) => (val != null && String(val).trim() !== '' ? (
        <div className="text-sentinel-200 text-xs">
          {label}: <span className="text-white font-medium">{String(val)}</span>
        </div>
      ) : null);
      content = (
        <>
          <div className="font-semibold text-sky-300">Natural gas pipeline</div>
          {k('Interstate / intrastate', p.TYPEPIPE)}
          {k('Operator', p.Operator)}
          {k('Status', p.Status)}
          <div className="text-sentinel-400 text-[10px] mt-1">EIA U.S. pipeline (public)</div>
        </>
      );
      break;
    }
    case 'water-gauges-circle-priority':
    case 'water-gauges-circle-other': {
      const stage = p.currentStage != null ? `${Number(p.currentStage).toFixed(2)} ft` : 'N/A';
      const catLabel = floodCategoryLabel(p.floodCategory);
      const catClass = FLOOD_CATEGORY_META[p.floodCategory]?.textClass ?? FLOOD_CATEGORY_META.no_flooding.textClass;
      content = (
        <>
          <div className="font-semibold text-blue-300">{p.name || p.lid}</div>
          {(p.county || p.state) && (
            <div className="text-sentinel-300 text-[10px]">
              {[p.county && `${p.county} Co.`, p.state].filter(Boolean).join(', ')}
            </div>
          )}
          <div className="mt-1 space-y-0.5">
            <div className="text-sentinel-200 text-xs">
              Stage: <span className="text-white font-medium">{stage}</span>
            </div>
            <div className={`text-xs font-medium ${catClass}`}>{catLabel}</div>
          </div>
          <div className="text-sentinel-400 text-[10px] mt-1">Click for details · NOAA NWPS</div>
        </>
      );
      break;
    }
    case 'ca-cameras-circle': {
      const bearing = CAMERA_DIRECTION_DEGREES[p.direction];
      content = (
        <>
          <div className="flex items-center gap-1.5">
            <div className="font-semibold text-teal-300">{p.name}</div>
            {bearing != null && (
              <Navigation
                size={13}
                className="text-teal-400 shrink-0"
                style={{ transform: `rotate(${bearing}deg)` }}
                aria-label={`Facing ${p.direction}`}
              />
            )}
          </div>
          {p.route && <div className="text-sentinel-200 text-xs">{p.route}</div>}
          {p.inService === false && (
            <div className="text-red-400 text-xs font-medium mt-0.5">Out of service</div>
          )}
          {p.county && <div className="text-sentinel-300 text-[10px] mt-0.5">{p.county} Co.</div>}
          <div className="text-sentinel-400 text-[10px] mt-1">Click for live feed · Caltrans CCTV</div>
        </>
      );
      break;
    }
    case 'dat-points-circle':
    case 'dat-lines-line':
    case 'dat-polygons-fill': {
      content = (
        <>
          <div className="font-semibold text-red-500">
            {p.efscale} <span className="text-sentinel-300">(NWS DAT)</span>
          </div>
          {p.damage_txt && <div className="text-sentinel-200 text-xs mt-0.5 line-clamp-2">{p.damage_txt}</div>}
          {p.office && <div className="text-sentinel-300 text-xs">{p.office}</div>}
          {(p.injuries || p.deaths || p.fatalities) ? (
            <div className="text-sentinel-200 text-xs mt-0.5">
              {num(p.injuries) ? `${num(p.injuries)} injuries` : ''}
              {(num(p.injuries) && (num(p.deaths) || num(p.fatalities))) ? ' · ' : ''}
              {(num(p.deaths) || num(p.fatalities)) ? `${num(p.deaths) || num(p.fatalities)} deaths` : ''}
            </div>
          ) : null}
          {p.stormdate && (
            <div className="text-sentinel-300 text-xs">{new Date(p.stormdate).toLocaleDateString()}</div>
          )}
          {p.comments && (
            <div className="text-sentinel-300 text-xs mt-1 max-w-[220px] line-clamp-3">{p.comments}</div>
          )}
        </>
      );
      break;
    }
    case 'national-map-colleges-circle': {
      const name = p.NAME || p.name || 'School / university';
      content = (
        <>
          <div className="font-semibold text-violet-300">USGS National Map</div>
          <div className="text-white text-xs mt-0.5 font-medium line-clamp-2">{name}</div>
          <div className="text-sentinel-300 text-[10px] mt-1">Colleges &amp; universities (structures)</div>
        </>
      );
      break;
    }
    case FLOOD_ZONES_FILL_ID: {
      const meta = floodCategoryMeta(p.category);
      content = (
        <>
          <div className="font-semibold text-sky-300">{meta.label}</div>
          {p.zone && <div className="text-white text-xs mt-0.5 font-medium">Flood Zone {p.zone}</div>}
          <div className="text-sentinel-300 text-[10px] mt-1">FEMA NFHL · click for details</div>
        </>
      );
      break;
    }
    case 'california-land-ownership-fill': {
      content = (
        <>
          <div className="font-semibold text-emerald-400">{p.Own_Level}</div>
          <div className="text-white text-xs mt-0.5 font-medium line-clamp-2">{p.Own_Agency}</div>
          <div className="text-sentinel-300 text-[10px] mt-1">CAL FIRE FRAP · Land Ownership</div>
        </>
      );
      break;
    }
    default:
      return null;
  }

  const popupShell = isOutlookPopup
    ? 'bg-sentinel-900 border border-sentinel-600 rounded-lg p-3 shadow-2xl shadow-black/70 text-sm min-w-[160px] ring-1 ring-white/10'
    : HOVER_MATCHED_WIDTH_LAYER_IDS.has(layerId)
      ? 'bg-sentinel-800 border border-sentinel-600 rounded-lg p-2.5 shadow-2xl text-sm w-[220px]'
      : 'bg-sentinel-800 border border-sentinel-600 rounded-lg p-2.5 shadow-2xl text-sm min-w-[140px]';

  return { content, popupShell };
}

// Stacking priority for hover boxes: warnings must render above (visually
// higher than) mesoscale-discussion boxes when a warning polygon is hovered
// inside an MD polygon. Lower number = higher in the stack. Everything else
// keeps its natural (topmost-feature-first) order via the stable sort below.
const HOVER_STACK_PRIORITY = { 'weather-alerts-fill': 0, 'spc-md-fill': 2, 'wpc-mpd-fill': 2 };
const HOVER_STACK_DEFAULT_PRIORITY = 1;

// Renders one independent box per hovered map feature, stacked above the
// cursor in a single popup so overlapping features (e.g. a warning polygon
// over an MD polygon) are all fully visible instead of only the topmost one.
function HoverTooltip({ features, lngLat }) {
  if (!features?.length || !lngLat) return null;

  const items = features
    .map((feature, i) => {
      const result = getHoverContent(feature);
      if (!result) return null;
      const key = `${feature.layer.id}:${feature.id ?? feature.properties?.id ?? i}`;
      return { key, layerId: feature.layer.id, ...result };
    })
    .filter(Boolean);

  if (!items.length) return null;

  const ordered = items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const pa = HOVER_STACK_PRIORITY[a.item.layerId] ?? HOVER_STACK_DEFAULT_PRIORITY;
      const pb = HOVER_STACK_PRIORITY[b.item.layerId] ?? HOVER_STACK_DEFAULT_PRIORITY;
      return pa - pb || a.i - b.i;
    })
    .map(({ item }) => item);

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
      <div className="flex flex-col gap-1.5">
        {ordered.map(item => (
          <div key={item.key} className={item.popupShell}>
            {item.content}
          </div>
        ))}
      </div>
    </Popup>
  );
}

/**
 * @param {object} props
 * @param {object|null} props.hotspotsGeoJSON
 * @param {object|null} props.ngfsGeoJSON
 * @param {object|null} props.perimetersGeoJSON
 * @param {object|null} props.incidentsGeoJSON // Fixed naming mismatch
 * @param {object|null} props.incidentDotsGeoJSON
 * @param {object|null} props.fireBehaviorModelingGeoJSON
 * @param {object|null} props.aqiGeoJSON
 * @param {object|null} props.alertsGeoJSON
 * @param {object|null} props.stormMotionVectorsGeoJSON
 * @param {boolean}     [props.stormMotionVectorsVisible]
 * @param {object|null} props.stormReportsGeoJSON
 * @param {object|null} props.damageAssessmentPointsGeoJSON
 * @param {object|null} props.damageAssessmentLinesGeoJSON
 * @param {object|null} props.damageAssessmentPolygonsGeoJSON
 * @param {object|null} props.spcOutlooksGeoJSON
 * @param {string}      [props.spcOutlookType]       - active outlook type key
 * @param {string}      [props.spcActiveDay]         - active day key e.g. 'day1'
 * @param {boolean}     [props.spcOutlooksLoading]
 * @param {string|null} [props.spcValidTime]
 * @param {Function}    [props.onSpcOutlookTypeChange]
 * @param {Function}    [props.onSpcActiveDayChange]
 * @param {object|null} props.spcMdGeoJSON
 * @param {object|null} props.userReportsGeoJSON
 * @param {object|null} props.hazardEventsGeoJSON
 * @param {object|null} props.evacZonesGeoJSON - combined official (Cal OES/IPAWS) + reporter-drawn zones
 * @param {object|null} props.rawsGeoJSON
 * @param {object|null} props.airNowMonitorsGeoJSON
 * @param {object|null} props.droughtOutlookGeoJSON
 * @param {object|null} props.ndgdSmokeForecastGeoJSON
 * @param {object|null} props.criticalInfrastructureTransGeoJSON
 * @param {object|null} props.criticalInfrastructureGasGeoJSON
 * @param {boolean}     [props.criticalInfrastructureVisible]
 * @param {object|null} props.nationalMapCollegesGeoJSON
 * @param {boolean}     [props.nationalMapCollegesVisible]
 * @param {object|null} props.landOwnershipGeoJSON
 * @param {boolean}     [props.landOwnershipVisible]
 * @param {object|null} props.floodHazardData - { zones, panels } from useFloodHazards
 * @param {boolean}     [props.floodHazardVisible]
 * @param {boolean}     [props.satelliteImageryOn] - GOES layer drawn; alert/NHC layers switch to high-contrast styling
 * @param {object|null} props.nhcForecastPointsGeoJSON
 * @param {object|null} props.nhcForecastTrackGeoJSON
 * @param {object|null} props.nhcConeGeoJSON
 * @param {object|null} props.nhcWatchWarningGeoJSON
 * @param {object|null} props.nhcPastPointsGeoJSON
 * @param {object|null} props.nhcPastTrackGeoJSON
 * @param {object|null} props.nhcDisturbancePointsGeoJSON
 * @param {object|null} props.nhcDisturbanceAreasGeoJSON
 * @param {object|null} props.nhcStormLabelsGeoJSON
 * @param {object|null} [props.nhcWindHazards] - from useNhcWindHazards
 * @param {object|null} props.fireWeatherOutlooksGeoJSON
 * @param {string}      [props.fireWxOutlookType]
 * @param {string}      [props.fireWxActiveDay]
 * @param {Function}    [props.onFireWxOutlookTypeChange]
 * @param {Function}    [props.onFireWxActiveDayChange]
 * @param {Array}       [props.savedLocations]
 * @param {Object|null} [props.nearbyRadiusGeoJSON] Near-me radius circle (Home Setup radius around live GPS)
 * @param {'wildfire'|'weather'|'allhazard'|'models'} [props.activeMapTab]
 * @param {Function}    [props.onModelPick]  Models tab: a map click picks the forecast point ({lat, lon})
 * @param {Function}    [props.modelOverlay] Models tab: ({ mapStyle, mapboxAccessToken }) => children rendered inside the map
 */
export default function MapView({
  activeMapTab = 'wildfire',
  mapType = 'satellite',
  hotspotsGeoJSON,
  ngfsGeoJSON,
  perimetersGeoJSON,
  incidentsGeoJSON, // Renamed to match usage inside
  incidentDotsGeoJSON,
  fireBehaviorModelingGeoJSON,
  aqiGeoJSON,
  alertsGeoJSON,
  stormMotionVectorsGeoJSON,
  stormMotionVectorsVisible,
  stormReportsGeoJSON,
  damageAssessmentPointsGeoJSON,
  damageAssessmentLinesGeoJSON,
  damageAssessmentPolygonsGeoJSON,
  spcOutlooksGeoJSON,
  spcOutlookType = 'categorical',
  spcActiveDay = 'day1',
  spcOutlooksLoading = false,
  spcValidTime = null,
  onSpcOutlookTypeChange,
  onSpcActiveDayChange,
  spcMdGeoJSON,
  userReportsGeoJSON,
  hazardEventsGeoJSON,
  evacZonesGeoJSON,
  rawsGeoJSON,
  airNowMonitorsGeoJSON,
  droughtOutlookGeoJSON,
  ndgdSmokeForecastGeoJSON,
  criticalInfrastructureTransGeoJSON,
  criticalInfrastructureGasGeoJSON,
  criticalInfrastructureVisible = false,
  nationalMapCollegesGeoJSON,
  nationalMapCollegesVisible = false,
  landOwnershipGeoJSON,
  landOwnershipVisible = false,
  floodHazardData,
  floodHazardVisible = false,
  satelliteImageryOn = false,
  nhcForecastPointsGeoJSON,
  nhcForecastTrackGeoJSON,
  nhcConeGeoJSON,
  nhcWatchWarningGeoJSON,
  nhcPastPointsGeoJSON,
  nhcPastTrackGeoJSON,
  nhcDisturbancePointsGeoJSON,
  nhcDisturbanceAreasGeoJSON,
  nhcStormLabelsGeoJSON,
  nhcWindHazards = null,
  fireWeatherOutlooksGeoJSON,
  fireWxOutlookType = 'winds_low_humidity',
  fireWxActiveDay = 'day1',
  onFireWxOutlookTypeChange,
  onFireWxActiveDayChange,
  savedLocations = [],
  nearbyRadiusGeoJSON = null,
  measureActive = false,
  measureMode = 'distance',
  onMeasureClose,
  waterGaugesGeoJSON,
  calFireHistoricalPerimetersGeoJSON,
  californiaCamerasGeoJSON,
  wpcEroGeoJSON,
  wpcWssiGeoJSON,
  wpcQpfGeoJSON,
  wpcFrontsGeoJSON,
  wpcMpdGeoJSON,
  onMapLoad,
  mapBottomBarWidth,
  mapBottomBarHeight,
  // The satellite panel holds the dock above the bottom bar: other layers' docked controls step aside.
  satelliteDocked = false,
  spcOutlookPanelRef,
  fireWxOutlookPanelRef,
  onModelPick,
  modelOverlay = null,
}) {
  const { layers, setLayer, selectedFire, selectFire, selectGauge, selectCamera, sidebarOpen, locationGranted, layerPanelOpen, closeLayerPanel, nhcModelTracks } = useApp();
  const satellite = useSatelliteContext();
  const { alerts, userLocation, setUserLocation } = useAppStatus();
  const { viewport, setViewport } = useViewport();
  const { prefs: displayPrefs } = usePreferences();
  const mapRef = useRef(null);
  // Data Picker: Center (the default) reads the middle of the screen; Mouse reads the clicked spot.
  const pickAtCenter = displayPrefs.dataPickerAnchor !== 'mouse';
  const modelsCtx = useWeatherModelsContext();
  const modelPointActive = Boolean(onModelPick && modelsCtx?.location);

  // Popup shown when a click hits multiple stacked features at once
  const [featurePopup, setFeaturePopup] = useState(null);

  // Popup for a tropical system clicked on the map ({ kind: 'storm' | 'outlook',
  // system, via, lngLat }). The spaghetti model tracks it (or the detail
  // panel) can turn on live in app state: nhcModelTracks = { atcfId, models, groups }.
  const [stormPopup, setStormPopup] = useState(null);
  const nhcCyclones = useMemo(() => buildCyclones(nhcForecastPointsGeoJSON), [nhcForecastPointsGeoJSON]);
  const nhcOutlookSystems = useMemo(
    () => buildOutlookSystems(nhcDisturbancePointsGeoJSON, nhcDisturbanceAreasGeoJSON),
    [nhcDisturbancePointsGeoJSON, nhcDisturbanceAreasGeoJSON],
  );
  const modelTrackData = useNhcModelTracks(nhcModelTracks?.atcfId);

  // Close the multi-feature popup whenever a selection is made through any
  // other path (sidebar feed, alert banner) so it never lingers behind a
  // now-stale FireDetailPanel.
  useEffect(() => {
    if (selectedFire) {
      setFeaturePopup(null);
      setStormPopup(null);
    }
  }, [selectedFire]);

  // Popup Spotlight for the currently selected weather alert or evacuation
  // zone — works no matter how it was selected (map click, sidebar feed, or
  // the Red Flag Warning banner), since all three carry the feature's
  // GeoJSON geometry on the selectedFire record.
  const spotlightGeometry = useMemo(() => {
    if (!displayPrefs.popupSpotlight || !selectedFire) return null;
    const spotlightTypes = ['weather-alert', 'evacuation-zone', 'reporter-evacuation-zone'];
    if (!spotlightTypes.includes(selectedFire.type)) return null;
    return selectedFire.geometry || null;
  }, [displayPrefs.popupSpotlight, selectedFire]);

  // Resize the Mapbox canvas after the sidebar transition completes (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapRef.current) mapRef.current.resize();
    }, 310);
    return () => clearTimeout(timer);
  }, [sidebarOpen]);
  const isWildfireTab   = activeMapTab === 'wildfire';
  const isWeatherTab    = activeMapTab === 'weather';
  const isAllHazardTab  = activeMapTab === 'allhazard';
  // Hover tooltip state (array so overlapping features each get their own box)
  const [hoverFeatures, setHoverFeatures] = useState(null);
  const [hoverLngLat,   setHoverLngLat]   = useState(null);

  // All fire points share one clustered source (IncidentLocationsLayer), so
  // perimeter centroid dots are derived here rather than inside FirePerimetersLayer.
  // Every fire dot, perimeter centroids included, belongs to the Incident
  // Locations toggle; Fire Perimeters draws only the perimeter shapes.
  const showFireIncidents  = (isWildfireTab || isAllHazardTab) && Boolean(layers.incidentLocations);
  const showFirePerimeters = (isWildfireTab || isAllHazardTab) && Boolean(layers.firePerimeters);
  const perimeterCentroidsGeoJSON = useMemo(
    () => (showFireIncidents ? perimeterCentroids(perimetersGeoJSON) : null),
    [showFireIncidents, perimetersGeoJSON],
  );

  /** NDGD smoke: which forecast hour (index into sorted unique `todate` values) */
  const [ndgdSmokeHourIndex, setNdgdSmokeHourIndex] = useState(0);

  // Layer-panel Tropical switches → NHCTropicalWeatherLayer groups.
  const nhcShow = useMemo(() => ({
    cone: Boolean(layers.nhcTropical && layers.nhcCone),
    track: Boolean(layers.nhcTropical && layers.nhcTrack),
    watchWarning: Boolean(layers.nhcTropical && layers.nhcWatchWarning),
    outlook: Boolean(layers.nhcTropical && layers.nhcOutlook),
  }), [layers.nhcTropical, layers.nhcCone, layers.nhcTrack, layers.nhcWatchWarning, layers.nhcOutlook]);
  const nhcHazardShow = useMemo(() => ({
    prob: Boolean(layers.nhcTropical && layers.nhcWindProb),
    radii: Boolean(layers.nhcTropical && layers.nhcWindRadii),
    arrival: Boolean(layers.nhcTropical && layers.nhcArrival),
    surge: Boolean(layers.nhcTropical && layers.nhcSurge),
  }), [layers.nhcTropical, layers.nhcWindProb, layers.nhcWindRadii, layers.nhcArrival, layers.nhcSurge]);

  const ndgdForecastHoursMs = useMemo(() => {
    const feats = ndgdSmokeForecastGeoJSON?.features;
    if (!feats?.length) return [];
    const seen = new Set();
    for (const f of feats) {
      const ms = ndgdFeatureToDateMs(f);
      if (ms != null) seen.add(ms);
    }
    return Array.from(seen).sort((a, b) => a - b);
  }, [ndgdSmokeForecastGeoJSON]);

  useEffect(() => {
    if (!ndgdForecastHoursMs.length) return;
    setNdgdSmokeHourIndex((i) => Math.min(i, ndgdForecastHoursMs.length - 1));
  }, [ndgdForecastHoursMs]);

  const ndgdSmokeFilteredGeoJSON = useMemo(() => {
    const feats = ndgdSmokeForecastGeoJSON?.features;
    if (!feats?.length) return { type: 'FeatureCollection', features: [] };
    const hours = ndgdForecastHoursMs;
    if (!hours.length) return ndgdSmokeForecastGeoJSON;
    const idx = Math.min(Math.max(0, ndgdSmokeHourIndex), hours.length - 1);
    const targetMs = hours[idx];
    return {
      type: 'FeatureCollection',
      features: feats.filter((f) => ndgdFeatureToDateMs(f) === targetMs),
    };
  }, [ndgdSmokeForecastGeoJSON, ndgdForecastHoursMs, ndgdSmokeHourIndex]);

  // Measurement tool state (active/mode lifted to LiveTrackerPage; points/preview stay local)
  const [measurePoints,  setMeasurePoints]  = useState([]);   // [{lng, lat}, ...]
  const [measurePreview, setMeasurePreview] = useState(null); // {lng, lat} – live cursor
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

  // Live location tracking is only ever started after the user explicitly grants
  // it via the locate-me corner button (MapCornerButtons) — never automatically.
  useEffect(() => {
    if (!locationGranted || typeof navigator === 'undefined' || !navigator.geolocation) return undefined;

    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setUserLocation({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [locationGranted, setUserLocation]);

  // Only include interactive layer IDs for layers that are currently visible.
  // When the measurement tool is active, disable all layer interactions so
  // clicks and hover tooltips don't compete with the measurement workflow.
  const interactiveLayerIds = useMemo(() => {
    if (measureActive) return [];
    const ids = [];
    if ((isWildfireTab || isAllHazardTab) && layers.fireHotspots && hotspotsGeoJSON)        ids.push('fire-hotspots-circle');
    if ((isWildfireTab || isAllHazardTab) && layers.ngfsDetections && ngfsGeoJSON)          ids.push('ngfs-detections-fill');
    if ((isWildfireTab || isAllHazardTab) && layers.firePerimeters && perimetersGeoJSON) {
      ids.push('fire-perimeters-fill');
    }
    if ((isWildfireTab || isAllHazardTab) && layers.incidentLocations) {
      ids.push('incident-locations-cluster');
      if (perimetersGeoJSON) ids.push('fire-perimeter-centroids-circle');
    }
    if ((isWildfireTab || isAllHazardTab) && layers.incidentLocations && incidentsGeoJSON) {
      ids.push('incident-locations-circle');
    }
    if ((isWildfireTab || isAllHazardTab) && layers.incidentLocations && incidentDotsGeoJSON) {
      ids.push('fire-incidents-circle');
    }
    if ((isWildfireTab || isAllHazardTab) && layers.incidentLocations && userReportsGeoJSON)  ids.push('user-reports-circle');
    if (isAllHazardTab && layers.aqi && aqiGeoJSON)                                           ids.push('aqi-stations-circle');
    if ((isWildfireTab || isWeatherTab || isAllHazardTab) && layers.weatherAlerts && alertsGeoJSON) ids.push('weather-alerts-fill');
    if ((isWeatherTab || isAllHazardTab) && layers.spcWeatherOutlooks && spcOutlooksGeoJSON) {
      ids.push('spc-outlook-fill');
    }
    if ((isWeatherTab || isAllHazardTab) && layers.weatherAlerts && spcMdGeoJSON) ids.push('spc-md-fill');
    if ((isWeatherTab || isAllHazardTab) && layers.stormReports && stormReportsGeoJSON)     ids.push('nws-lsr-reports-circle');
    if ((isWeatherTab || isAllHazardTab) && layers.damageAssessment) {
      if (damageAssessmentPolygonsGeoJSON?.features?.length) ids.push('dat-polygons-fill');
      if (damageAssessmentLinesGeoJSON?.features?.length) ids.push('dat-lines-line');
      if (damageAssessmentPointsGeoJSON?.features?.length) ids.push('dat-points-circle');
    }
    if (layers.evacZones && evacZonesGeoJSON) {
      ids.push('evac-zones-fill');
    }
    if (layers.rawsStations && rawsGeoJSON)                                                               ids.push('raws-stations-circle');
    if ((isWildfireTab || isAllHazardTab) && layers.airNowMonitors && airNowMonitorsGeoJSON)              ids.push('airnow-monitors-circle');
    if ((isWildfireTab || isAllHazardTab) && layers.droughtOutlook && droughtOutlookGeoJSON)              ids.push('drought-outlook-fill');
    if ((isWildfireTab || isAllHazardTab) && layers.ndgdSmokeForecast && ndgdSmokeFilteredGeoJSON?.features?.length) {
      ids.push('ndgd-smoke-forecast-fill');
    }
    if (criticalInfrastructureVisible && criticalInfrastructureTransGeoJSON?.features?.length) {
      ids.push('cmra-transmission-lines');
    }
    if (criticalInfrastructureVisible && criticalInfrastructureGasGeoJSON?.features?.length) {
      ids.push('eia-gas-pipelines');
    }
    if (nationalMapCollegesVisible && nationalMapCollegesGeoJSON?.features?.length) {
      ids.push('national-map-colleges-circle');
    }
    if (landOwnershipVisible && landOwnershipGeoJSON?.features?.length) {
      ids.push('california-land-ownership-fill');
    }
    if (floodHazardVisible && floodHazardData?.zones?.features?.length) ids.push(FLOOD_ZONES_FILL_ID);
    if (floodHazardVisible && floodHazardData?.panels?.features?.length) ids.push(FLOOD_PANELS_FILL_ID);
    if ((isWildfireTab || isAllHazardTab) && layers.fireWeatherOutlooks && fireWeatherOutlooksGeoJSON) ids.push('fire-weather-outlook-fill');
    if (isWeatherTab || isAllHazardTab) {
      if (nhcDisturbanceAreasGeoJSON?.features?.length) ids.push('nhc-disturbance-fill');
      if (nhcDisturbancePointsGeoJSON?.features?.length) ids.push('nhc-disturbance-circle');
      if (nhcForecastPointsGeoJSON?.features?.length) ids.push('nhc-track-circle');
      if (nhcShow.cone && nhcConeGeoJSON?.features?.length) ids.push('nhc-cone-fill');
      if (nhcShow.track && nhcForecastTrackGeoJSON?.features?.length) ids.push('nhc-forecast-track-line');
      if (nhcPastPointsGeoJSON?.features?.length) ids.push('nhc-obs-circle');
      if (nhcWatchWarningGeoJSON?.features?.length) ids.push('nhc-watch-warning-line');
      if (nhcHazardShow.prob && nhcWindHazards?.windProbGeoJSON?.features?.length) ids.push('nhc-wind-prob-fill');
      if (nhcHazardShow.radii && nhcWindHazards?.windRadiiGeoJSON?.features?.length) ids.push('nhc-wind-radii-fill');
    }
    if (layers.waterGauges && waterGaugesGeoJSON?.features?.length) {
      ids.push('water-gauges-circle-priority', 'water-gauges-circle-other');
    }
    if (isWildfireTab && layers.wildfireCameras && californiaCamerasGeoJSON?.features?.length) ids.push('ca-cameras-circle');
    if (hazardEventsGeoJSON?.features?.length) ids.push('hazard-events-circle');
    if ((isWeatherTab || isAllHazardTab) && layers.wpcEro && wpcEroGeoJSON?.features?.length) ids.push('wpc-ero-fill');
    if ((isWeatherTab || isAllHazardTab) && layers.wpcWssi && wpcWssiGeoJSON?.features?.length) ids.push('wpc-wssi-fill');
    if ((isWeatherTab || isAllHazardTab) && layers.wpcQpf && wpcQpfGeoJSON?.features?.length) ids.push('wpc-qpf-fill');
    if ((isWeatherTab || isAllHazardTab) && layers.wpcFronts && wpcFrontsGeoJSON?.features?.length) {
      ids.push('wpc-fronts-solid', 'wpc-fronts-dashed', 'wpc-fronts-stationary-line');
    }
    if ((isWeatherTab || isAllHazardTab) && layers.weatherAlerts && wpcMpdGeoJSON?.features?.length) ids.push('wpc-mpd-fill');
    return ids;
  }, [measureActive, isWildfireTab, isWeatherTab, isAllHazardTab, layers.fireHotspots, layers.firePerimeters, layers.incidentLocations, layers.aqi,
      layers.weatherAlerts, layers.spcWeatherOutlooks, layers.stormReports, layers.evacZones, spcMdGeoJSON,
      layers.rawsStations, layers.airNowMonitors, layers.droughtOutlook, layers.ndgdSmokeForecast, layers.fireWeatherOutlooks,
      layers.damageAssessment,
      layers.ngfsDetections, ngfsGeoJSON,
      hotspotsGeoJSON, perimetersGeoJSON, incidentsGeoJSON, incidentDotsGeoJSON, aqiGeoJSON, alertsGeoJSON, spcOutlooksGeoJSON,
      stormReportsGeoJSON, userReportsGeoJSON, evacZonesGeoJSON,
      damageAssessmentPointsGeoJSON, damageAssessmentLinesGeoJSON, damageAssessmentPolygonsGeoJSON,
      rawsGeoJSON, airNowMonitorsGeoJSON, droughtOutlookGeoJSON, ndgdSmokeFilteredGeoJSON, fireWeatherOutlooksGeoJSON,
      nhcForecastPointsGeoJSON, nhcPastPointsGeoJSON, nhcDisturbanceAreasGeoJSON, nhcDisturbancePointsGeoJSON, nhcWatchWarningGeoJSON,
      nhcHazardShow, nhcWindHazards, nhcShow.cone, nhcShow.track, nhcConeGeoJSON, nhcForecastTrackGeoJSON,
      layers.wpcEro, layers.wpcWssi, layers.wpcQpf, layers.wpcFronts,
      wpcEroGeoJSON, wpcWssiGeoJSON, wpcQpfGeoJSON, wpcFrontsGeoJSON, wpcMpdGeoJSON,
      criticalInfrastructureVisible, criticalInfrastructureTransGeoJSON, criticalInfrastructureGasGeoJSON,
      nationalMapCollegesVisible, nationalMapCollegesGeoJSON,
      landOwnershipVisible, landOwnershipGeoJSON,
      floodHazardVisible, floodHazardData,
      layers.waterGauges, waterGaugesGeoJSON,
      layers.wildfireCameras, californiaCamerasGeoJSON,
      hazardEventsGeoJSON]);

  // Clear stale hover when layers change
  useEffect(() => {
    setHoverFeatures(null);
    setHoverLngLat(null);
    setFeaturePopup(null);
  }, [layers]);

  // Handle map click – add measurement point OR select fire for detail panel
  const handleClick = useCallback((evt) => {
    if (layerPanelOpen) {
      closeLayerPanel();
      return;
    }

    if (measureActive) {
      const { lng, lat } = evt.lngLat;
      setMeasurePoints(prev => [...prev, { lng, lat }]);
      return;
    }

    // Models tab: a click picks the point to forecast (operational layers are off there).
    if (onModelPick) {
      const center = pickAtCenter ? mapRef.current?.getCenter() : null;
      onModelPick(center ? { lat: center.lat, lon: center.lng } : { lat: evt.lngLat.lat, lon: evt.lngLat.lng });
      return;
    }

    setStormPopup(null);
    const features = evt.features;
    if (!features?.length) {
      selectFire(null);
      selectGauge(null);
      setFeaturePopup(null);
      return;
    }

    const feature = features[0];
    const p = feature.properties;

    if (feature.layer.id.startsWith('water-gauges-circle')) {
      selectGauge(feature.properties);
      setFeaturePopup(null);
      return;
    }

    if (feature.layer.id === 'incident-locations-cluster') {
      // Zoom in just far enough for this cluster to split apart.
      const [lng, lat] = feature.geometry.coordinates;
      mapRef.current?.getSource('incident-locations')?.getClusterExpansionZoom(p.cluster_id, (err, zoom) => {
        if (err) return;
        mapRef.current?.easeTo({ center: [lng, lat], zoom, duration: 500 });
      });
      setFeaturePopup(null);
      return;
    }

    if (feature.layer.id === 'ca-cameras-circle') {
      const [lng, lat] = feature.geometry?.coordinates ?? [evt.lngLat.lng, evt.lngLat.lat];
      selectCamera({ ...feature.properties, lat, lng });
      setFeaturePopup(null);
      return;
    }

    // SPC MD / WPC MPD polygons open the full discussion text in the detail panel
    if (feature.layer.id === 'spc-md-fill') {
      const mdNumber = Number.isFinite(Number(p.mdNumber)) && p.mdNumber != null ? Number(p.mdNumber) : null;
      selectFire({
        type:       'mesoscale-discussion',
        source:     'spc',
        id:         `spc-md-${mdNumber ?? p.name}`,
        name:       p.name || 'Mesoscale Discussion',
        number:     mdNumber,
        activeTill: p.activeTill || null,
        url:        p.url || null,
        lat:        evt.lngLat.lat,
        lng:        evt.lngLat.lng,
      });
      setFeaturePopup(null);
      return;
    }

    if (feature.layer.id === 'wpc-mpd-fill') {
      const mpdNumber = Number.isFinite(Number(p.mpdNumber)) && p.mpdNumber != null ? Number(p.mpdNumber) : null;
      selectFire({
        type:       'mesoscale-discussion',
        source:     'wpc',
        id:         `wpc-mpd-${p.product_id ?? mpdNumber}`,
        name:       mpdNumber != null ? `MPD ${mpdNumber}` : 'Mesoscale Precipitation Discussion',
        number:     mpdNumber,
        productId:  p.product_id || null,
        concerning: p.concerning || null,
        issue:      p.issue || null,
        expire:     p.expire || null,
        activeTill: p.activeTill || null,
        url:        p.url || null,
        lat:        evt.lngLat.lat,
        lng:        evt.lngLat.lng,
      });
      setFeaturePopup(null);
      return;
    }

    // Build a record for every clicked feature (not just the topmost one) so
    // that features stacked at the same point — e.g. an evac zone over a
    // fire perimeter — all surface, deduped by layer + id.
    const seen = new Set();
    const records = [];
    const floodPanelFeature = features.find((f) => f.layer.id === FLOOD_PANELS_FILL_ID);
    const floodPanel = floodPanelFeature?.properties ?? null;
    for (const f of features) {
      const record = buildFeatureRecord(f, evt.lngLat, alerts, { floodPanel });
      if (!record) continue;
      const key = `${f.layer.id}:${record.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      records.push({ record, feature: f });
    }
    // Clicked inside a FIRM panel but on nothing else: still worth telling
    // the user there's no shaded FEMA flood hazard here, with panel details.
    if (records.length === 0 && floodPanelFeature) {
      records.push({ record: buildFloodHazardRecord(null, evt.lngLat, floodPanel), feature: floodPanelFeature });
    }

    // An NHC storm opens its own popup; stacked with other features, it's
    // listed alongside them instead.
    const stormFeature = features.find((f) => STORM_CLICK_LAYERS[f.layer.id]);
    const storm = stormFeature && nhcCyclones.find((c) => c.slot === stormFeature.properties?.slot);
    if (storm && records.length === 0) {
      selectFire(null);
      setFeaturePopup(null);
      setStormPopup({ kind: 'storm', system: storm, via: STORM_CLICK_LAYERS[stormFeature.layer.id](stormFeature.properties), lngLat: evt.lngLat });
      return;
    }
    if (storm) records.push({ record: { ...storm, type: 'nhc-storm' }, feature: stormFeature });

    // Likewise an invest disturbance or area of interest. An area with a
    // disturbance inside is that disturbance's system, so areas resolve to
    // the nearest outlook system.
    const outlookFeature = !storm && features.find((f) => OUTLOOK_CLICK_LAYERS[f.layer.id]);
    const outlook = outlookFeature && (
      nhcOutlookSystems.find((o) => o.id === outlookFeature.properties?.id)
      ?? [...nhcOutlookSystems].sort((a, b) => (
        Math.hypot(a.lng - evt.lngLat.lng, a.lat - evt.lngLat.lat) - Math.hypot(b.lng - evt.lngLat.lng, b.lat - evt.lngLat.lat)
      ))[0]);
    if (outlook && records.length === 0) {
      selectFire(null);
      setFeaturePopup(null);
      setStormPopup({ kind: 'outlook', system: outlook, via: OUTLOOK_CLICK_LAYERS[outlookFeature.layer.id], lngLat: evt.lngLat });
      return;
    }
    if (outlook) records.push({ record: { ...outlook, type: 'nhc-invest' }, feature: outlookFeature });

    if (records.length === 0) {
      selectFire(null);
      setFeaturePopup(null);
      return;
    }

    if (records.length === 1) {
      setFeaturePopup(null);
      selectFire(records[0].record);
      return;
    }

    selectFire(null);
    setFeaturePopup({
      items: records.map((r) => r.record),
      mouseLngLat: evt.lngLat,
      anchorFeature: records[0].feature,
    });
  }, [measureActive, alerts, selectFire, selectGauge, selectCamera, layerPanelOpen, closeLayerPanel, onModelPick, nhcCyclones, nhcOutlookSystems, pickAtCenter]);

  // Center picker: once a model point is being inspected, panning keeps it on the screen center.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pickAtCenter || !modelPointActive) return undefined;
    const onMoveEnd = () => {
      const c = map.getCenter();
      onModelPick({ lat: c.lat, lon: c.lng });
    };
    map.on('moveend', onMoveEnd);
    return () => map.off('moveend', onMoveEnd);
  }, [onModelPick, pickAtCenter, modelPointActive]);

  // Handle mouse move – update hover tooltip OR measurement preview
  const handleMouseMove = useCallback((evt) => {
    if (measureActive) {
      setMeasurePreview({ lng: evt.lngLat.lng, lat: evt.lngLat.lat });
      if (mapRef.current) mapRef.current.getCanvas().style.cursor = 'crosshair';
      return;
    }
    const features = evt.features;
    if (features?.length) {
      // Keep every feature stacked at the cursor (deduped by layer + id) so
      // the hover tooltip can show one independent box per feature, not
      // just the topmost one.
      const seen = new Set();
      const deduped = [];
      for (const f of features) {
        const key = `${f.layer.id}:${f.id ?? f.properties?.id ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(f);
      }
      setHoverFeatures(deduped);
      setHoverLngLat(evt.lngLat);
      if (mapRef.current) {
        // FIRM panels blanket the whole view at flood-detail zoom; they're
        // clickable for panel info but shouldn't turn the cursor into a
        // pointer everywhere on their own.
        const onlyFloodPanels = deduped.every((f) => f.layer.id === FLOOD_PANELS_FILL_ID);
        mapRef.current.getCanvas().style.cursor = onlyFloodPanels ? '' : 'pointer';
      }
    } else {
      setHoverFeatures(null);
      setHoverLngLat(null);
      if (mapRef.current) {
        mapRef.current.getCanvas().style.cursor = '';
      }
    }
  }, [measureActive]);

  const handleMouseLeave = useCallback(() => {
    setMeasurePreview(null);
    setHoverFeatures(null);
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

  const handleMapLoad = useCallback((e) => {
    onMapLoad?.(e);
  }, [onMapLoad]);

  return (
    <div className="absolute inset-0 bg-sentinel-900">
      {/* Wildfire tab: fire weather outlook selector only (convective uses combined control on weather tab) —
          docks flush above MapBottomBar, same as the SPC outlook selector on the Weather/All Hazards tabs. */}
      {isWildfireTab && layers.fireWeatherOutlooks && !satelliteDocked && (
        <FireWeatherOutlookSelector
          ref={fireWxOutlookPanelRef}
          outlookType={fireWxOutlookType}
          onOutlookTypeChange={onFireWxOutlookTypeChange}
          activeDay={fireWxActiveDay}
          onActiveDayChange={onFireWxActiveDayChange}
          bottomBarWidth={mapBottomBarWidth}
          bottomBarHeight={mapBottomBarHeight}
        />
      )}

      {isWildfireTab && layers.ndgdSmokeForecast && !satelliteDocked && (
        <NdgdSmokeTimeSlider
          forecastHoursMs={ndgdForecastHoursMs}
          valueIndex={ndgdSmokeHourIndex}
          onIndexChange={setNdgdSmokeHourIndex}
        />
      )}

      {/* Weather + All Hazards tabs: SPC convective outlook selector — docks
          flush above MapBottomBar. */}
      {(isWeatherTab || isAllHazardTab) && layers.spcWeatherOutlooks && !satelliteDocked && (
        <SPCOutlookSelector
          ref={spcOutlookPanelRef}
          outlookType={spcOutlookType}
          onOutlookTypeChange={onSpcOutlookTypeChange}
          activeDay={spcActiveDay}
          onActiveDayChange={onSpcActiveDayChange}
          loading={spcOutlooksLoading}
          validTime={spcValidTime}
          bottomBarWidth={mapBottomBarWidth}
          bottomBarHeight={mapBottomBarHeight}
        />
      )}

      <Map
        key={mapType}
        ref={mapRef}
        {...viewport}
        mapboxAccessToken={HAS_MAPBOX_TOKEN ? MAPBOX_TOKEN : undefined}
        mapStyle={MAP_STYLES[mapType] ?? MAP_STYLES.satellite}
        // Extends past the bottom by --viewport-bleed so the map, not the page
        // background, shows behind mobile browser toolbars (see index.css).
        style={{ width: '100%', height: 'calc(100% + var(--viewport-bleed, 0px))', background: '#0a0c0e' }}
        interactiveLayerIds={interactiveLayerIds}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMove={handleMove}
        onLoad={handleMapLoad}
        transformRequest={transformRequest}
        attributionControl={false}
        maxTileCacheSize={30}
        fadeDuration={150}
        // Models tab: flat Mercator, no terrain — model fields are Web Mercator
        // images and wind particles assume a flat, linear screen. Everything
        // else keeps the globe.
        projection={activeMapTab === 'models' ? 'mercator' : 'globe'}
        fog={activeMapTab === 'models' ? null : GLOBE_FOG}
        terrain={HAS_MAPBOX_TOKEN && activeMapTab !== 'models' ? { source: TERRAIN_SOURCE_ID, exaggeration: 1.5 } : null}
      >
        {/* 3D terrain elevation (hillshaded relief when the map is pitched) */}
        {HAS_MAPBOX_TOKEN && (
          <Source
            id={TERRAIN_SOURCE_ID}
            type="raster-dem"
            url="mapbox://mapbox.mapbox-terrain-dem-v1"
            tileSize={512}
            maxzoom={14}
          />
        )}

        {/* ── Data Layers (ordered back-to-front, each independently controlled via visibility) ── */}



        {/* NOAA GOES satellite imagery. Satellite, region, product and frame come
            from SatelliteContext, which is active only while the layer is on. */}
        <GOESLayer />

        {/* NOAA MRMS radar (Weather tab). Visibility, product and frame come
            from MrmsContext, which is active only on the Weather tab with the layer on. */}
        <MrmsLayer />

        {/* FEMA flood hazard zones — contextual, so it sits directly above base
            imagery and below alerts, perimeters, incidents, and evac zones */}
        <FloodHazardLayer data={floodHazardData} visible={floodHazardVisible} />

        {/* Smoke forecast */}
        <SmokeLayer visible={isAllHazardTab && layers.smoke} />

        {/* Weather alert zones — wildfire tab shows Red Flag Warnings only, no SPC MDs */}
        <WeatherAlertsLayer
          geoJSON={alertsGeoJSON}
          spcMdGeoJSON={isWildfireTab ? null : spcMdGeoJSON}
          visible={(isWildfireTab || isWeatherTab || isAllHazardTab) && layers.weatherAlerts}
          onImagery={satelliteImageryOn}
        />

        {/* Radar Settings: Storm Motion Vectors — a display preference, not
            a layer toggle, so not gated to any particular map tab */}
        <StormMotionVectorLayer
          geoJSON={stormMotionVectorsGeoJSON}
          visible={stormMotionVectorsVisible}
        />

        {/* SPC convective outlook polygons */}
        <SPCOutlookLayer
          geoJSON={spcOutlooksGeoJSON}
          visible={(isWeatherTab || isAllHazardTab) && layers.spcWeatherOutlooks}
        />

        {/* Fire perimeter polygons (their dots cluster in IncidentLocationsLayer) */}
        <FirePerimetersLayer
          geoJSON={perimetersGeoJSON}
          visible={showFirePerimeters}
          centroidDots={false}
        />

        {/* AQI heatmap + stations — all-hazard tab only */}
        <AQILayer
          geoJSON={aqiGeoJSON}
          visible={isAllHazardTab && layers.aqi}
        />

        <StormReportsLayer
          idPrefix="nws-lsr"
          geoJSON={stormReportsGeoJSON}
          visible={(isWeatherTab || isAllHazardTab) && layers.stormReports}
          opacity={0.9}
        />

        {/* NWS Damage Assessment Toolkit — post-storm survey points/tracks/polygons */}
        <DamageAssessmentLayer
          pointsGeoJSON={damageAssessmentPointsGeoJSON}
          linesGeoJSON={damageAssessmentLinesGeoJSON}
          polygonsGeoJSON={damageAssessmentPolygonsGeoJSON}
          visible={(isWeatherTab || isAllHazardTab) && layers.damageAssessment}
        />
        {/* Every fire point — WFIGS incident locations, perimeter centroid dots
            and incident dots with no perimeter — clustered together; above
            evacuation fills */}
        <IncidentLocationsLayer
          geoJSON={showFireIncidents ? incidentsGeoJSON : null}
          fireDotsGeoJSON={showFireIncidents ? incidentDotsGeoJSON : null}
          perimeterCentroidsGeoJSON={perimeterCentroidsGeoJSON}
          visible={showFireIncidents}
        />

        {/* Evacuation zones and markers — above incident dots for clear identification */}
        <EvacuationZonesLayer
          geoJSON={evacZonesGeoJSON}
          visible={layers.evacZones}
        />

        {/* Fire behavior spread-projection rings for the selected fire (Rothermel engine) */}
        <FireBehaviorModelingLayer
          geoJSON={fireBehaviorModelingGeoJSON}
          visible={(isWildfireTab || isAllHazardTab) && layers.fireBehaviorModeling}
        />

        <CriticalInfrastructureLayer
          transmissionGeoJSON={criticalInfrastructureTransGeoJSON}
          gasPipelinesGeoJSON={criticalInfrastructureGasGeoJSON}
          visible={criticalInfrastructureVisible}
        />

        <NationalMapCollegesLayer
          geoJSON={nationalMapCollegesGeoJSON}
          visible={nationalMapCollegesVisible}
        />

        <CaliforniaLandOwnershipLayer
          geoJSON={landOwnershipGeoJSON}
          visible={landOwnershipVisible}
        />

        {/* RAWS weather stations – visible on both wildfire and weather tabs */}
        <RAWSLayer
          geoJSON={rawsGeoJSON}
          visible={layers.rawsStations}
        />

        {/* AirNow monitor stations – individual sensor readings (wildfire tab) */}
        <AirNowMonitorsLayer
          geoJSON={airNowMonitorsGeoJSON}
          visible={(isWildfireTab || isAllHazardTab) && layers.airNowMonitors}
        />

        {/* NOAA CPC Monthly Drought Outlook polygons */}
        <DroughtOutlookLayer
          geoJSON={droughtOutlookGeoJSON}
          visible={(isWildfireTab || isAllHazardTab) && layers.droughtOutlook}
        />

        {/* NOAA NDGD hourly smoke concentration (48h CONUS) */}
        <NdgdSmokeForecastLayer
          geoJSON={ndgdSmokeFilteredGeoJSON}
          visible={(isWildfireTab || isAllHazardTab) && layers.ndgdSmokeForecast}
        />

        {/* SPC Fire Weather Outlook polygons – visible on wildfire tab */}
        <FireWeatherOutlookLayer
          geoJSON={fireWeatherOutlooksGeoJSON}
          visible={(isWildfireTab || isAllHazardTab) && layers.fireWeatherOutlooks}
          outlookType={fireWxOutlookType}
        />

        {/* WPC Excessive Rainfall Outlook (Day 1-3) */}
        <WpcEroLayer
          geoJSON={wpcEroGeoJSON}
          visible={(isWeatherTab || isAllHazardTab) && layers.wpcEro}
        />

        {/* WPC Winter Storm Severity Index — Overall Impact (Day 1-3) */}
        <WpcWssiLayer
          geoJSON={wpcWssiGeoJSON}
          visible={(isWeatherTab || isAllHazardTab) && layers.wpcWssi}
        />

        {/* WPC Quantitative Precipitation Forecast (Day 1-3) */}
        <WpcQpfLayer
          geoJSON={wpcQpfGeoJSON}
          visible={(isWeatherTab || isAllHazardTab) && layers.wpcQpf}
        />

        {/* WPC surface-analysis fronts (Day 1-3) */}
        <WpcFrontsLayer
          geoJSON={wpcFrontsGeoJSON}
          visible={(isWeatherTab || isAllHazardTab) && layers.wpcFronts}
        />

        {/* WPC Mesoscale Precipitation Discussions — part of the weatherAlerts
            ("NWS & mesoscale") layer alongside SPC MDs; hidden on the wildfire tab */}
        <WpcMesoscaleDiscussionLayer
          geoJSON={wpcMpdGeoJSON}
          visible={(isWeatherTab || isAllHazardTab) && layers.weatherAlerts}
        />

        {/* NHC wind probabilities, wind radii, TS-wind arrival time and storm
            surge flooding — beneath the cone and track they explain */}
        <NhcWindHazardsLayer
          data={nhcWindHazards}
          show={nhcHazardShow}
          visible={isWeatherTab || isAllHazardTab}
        />

        {/* NHC hurricane tracks, cone, watch/warnings, and tropical weather outlook —
            on the weather, all-hazard and models tabs; each part has its own
            switch under "Tropical (NHC)" in the layer panel */}
        <NHCTropicalWeatherLayer
          forecastPointsGeoJSON={nhcForecastPointsGeoJSON}
          forecastTrackGeoJSON={nhcForecastTrackGeoJSON}
          coneGeoJSON={nhcConeGeoJSON}
          watchWarningGeoJSON={nhcWatchWarningGeoJSON}
          pastPointsGeoJSON={nhcPastPointsGeoJSON}
          pastTrackGeoJSON={nhcPastTrackGeoJSON}
          disturbancePointsGeoJSON={nhcDisturbancePointsGeoJSON}
          disturbanceAreasGeoJSON={nhcDisturbanceAreasGeoJSON}
          stormLabelsGeoJSON={nhcStormLabelsGeoJSON}
          visible={isWeatherTab || isAllHazardTab}
          show={nhcShow}
          onImagery={satelliteImageryOn}
        />

        {/* Spaghetti model tracks, turned on from a storm's map popup */}
        {nhcModelTracks && modelTrackData.data && (isWeatherTab || isAllHazardTab) && (
          <NhcModelTracksLayer data={modelTrackData.data} selection={nhcModelTracks} />
        )}

        {/* Fire hotspot points – rendered last (top) */}
        <FireHotspotsLayer
          geoJSON={hotspotsGeoJSON}
          visible={(isWildfireTab || isAllHazardTab) && layers.fireHotspots}
        />

        {/* GOES satellite fire detections (NOAA NESDIS NGFS) */}
        <NgfsDetectionsLayer
          geoJSON={ngfsGeoJSON}
          visible={(isWildfireTab || isAllHazardTab) && layers.ngfsDetections}
        />

        {/* Community-submitted reports (rendered on top of official data) */}
        <UserReportsLayer
          geoJSON={userReportsGeoJSON}
          visible={(isWildfireTab || isAllHazardTab) && layers.incidentLocations}
        />

        {/* Community-submitted hazard events: wildfire, flooding, hazmat, other — always on */}
        <HazardEventsLayer
          geoJSON={hazardEventsGeoJSON}
          visible={true}
        />

        {/* NOAA NWPS water gauges */}
        <WaterGaugesLayer
          geoJSON={waterGaugesGeoJSON}
          visible={layers.waterGauges}
        />

        {/* Live California highway cameras — Caltrans District CCTV */}
        <CaliforniaCamerasLayer
          geoJSON={californiaCamerasGeoJSON}
          visible={isWildfireTab && layers.wildfireCameras}
        />

        {/* CAL FIRE FRAP historical fire perimeter scars */}
        <CalFirePerimetersLayer
          geoJSON={calFireHistoricalPerimetersGeoJSON}
          visible={(isWildfireTab || isAllHazardTab) && layers.calFireHistoricalPerimeters}
        />

        {/* Near-me radius — the Home Setup radius around the live location */}
        {nearbyRadiusGeoJSON && (
          <Source id="nearby-radius" type="geojson" data={nearbyRadiusGeoJSON}>
            <Layer
              id="nearby-radius-fill"
              type="fill"
              paint={{ 'fill-color': '#3b82f6', 'fill-opacity': 0.06 }}
            />
            <Layer
              id="nearby-radius-line"
              type="line"
              paint={{ 'line-color': '#60a5fa', 'line-width': 2, 'line-dasharray': [2, 2] }}
            />
          </Source>
        )}

        {/* User live location marker */}
        {userLocation && (
          <Marker
            longitude={userLocation.longitude}
            latitude={userLocation.latitude}
            anchor="center"
          >
            <div className="relative flex h-3 w-3 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-80" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500 ring-2 ring-white/80" />
            </div>
          </Marker>
        )}

        {/* Saved address markers – black map pins visible on wildfire and weather tabs */}
        {savedLocations.map(loc => (
          loc.latitude && loc.longitude ? (
            <Marker
              key={loc.id}
              longitude={Number(loc.longitude)}
              latitude={Number(loc.latitude)}
              anchor="bottom"
            >
              <div
                className="flex flex-col items-center cursor-default group"
                title={loc.address || loc.name}
              >
                <div className="relative">
                  <div className="w-7 h-7 rounded-full bg-black border-2 border-white flex items-center justify-center shadow-lg group-hover:bg-sentinel-800 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-white">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                    </svg>
                  </div>
                  <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-black" />
                </div>
                {/* Label on hover */}
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block pointer-events-none z-10">
                  <div className="bg-sentinel-800 border border-sentinel-600 rounded-lg px-2.5 py-1.5 shadow-xl whitespace-nowrap max-w-[200px]">
                    <p className="text-xs font-medium text-white truncate">{loc.address || loc.name}</p>
                    <p className="text-[10px] text-sentinel-400">Saved Address</p>
                  </div>
                </div>
              </div>
            </Marker>
          ) : null
        ))}

        {/* Measurement geometry – rendered last so it's always on top */}
        {measureActive && (
          <MeasurementLayer
            points={measurePoints}
            previewPoint={measurePoints.length > 0 ? measurePreview : null}
            mode={measureMode}
          />
        )}

        {/* Hover tooltip (not over an open storm popup) */}
        <HoverTooltip features={stormPopup ? null : hoverFeatures} lngLat={hoverLngLat} />

        {/* Popup Spotlight for the selected weather alert / evac zone, however it was selected */}
        {spotlightGeometry && (
          <SpotlightMaskLayer
            id="selected-feature-spotlight-mask"
            geometry={spotlightGeometry}
            opacity={displayPrefs.spotlightOpacity / 100}
          />
        )}

        {/* State, international and shoreline borders — kept above every data
            layer (see StateBoundariesLayer) so they show through all of them */}
        {HAS_MAPBOX_TOKEN && <StateBoundariesLayer />}

        {/* Multi-feature popup — shown when a click hits more than one stacked feature */}
        {featurePopup && (
          <MapFeaturePopup
            items={featurePopup.items}
            mouseLngLat={featurePopup.mouseLngLat}
            anchorFeature={featurePopup.anchorFeature}
            prefs={displayPrefs}
            onSelect={(item) => { setFeaturePopup(null); selectFire(item); }}
            onClose={() => setFeaturePopup(null)}
          />
        )}

        {/* Tropical popup — a click on a storm's cone, track or position, or
            on an invest disturbance / area of interest */}
        {stormPopup && (
          <StormMapPopup
            kind={stormPopup.kind}
            system={(stormPopup.kind === 'storm' ? nhcCyclones : nhcOutlookSystems)
              .find((c) => c.id === stormPopup.system.id) ?? stormPopup.system}
            via={stormPopup.via}
            lngLat={stormPopup.lngLat}
            prefs={displayPrefs}
            onOpen={(system) => {
              setStormPopup(null);
              selectFire({ ...system, type: stormPopup.kind === 'storm' ? 'nhc-storm' : 'nhc-invest' });
            }}
            onShowSatellite={(system) => {
              setLayer('satellite', true);
              satellite?.focusOnStorm?.({ lng: system.lng, lat: system.lat });
            }}
            onClose={() => setStormPopup(null)}
          />
        )}
        {typeof modelOverlay === 'function'
          ? modelOverlay({ mapStyle: MAP_STYLES[mapType] ?? MAP_STYLES.satellite, mapboxAccessToken: HAS_MAPBOX_TOKEN ? MAPBOX_TOKEN : undefined })
          : modelOverlay}
      </Map>

      <MapZoomControl mapRef={mapRef} />

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
