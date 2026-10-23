/**
 * MapView.jsx
 * Main interactive map component.
 * Hosts all data layers and handles user interaction (click, hover).
 * Uses react-map-gl with Mapbox GL JS and satellite imagery.
 */

import { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import Map, { Marker, Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import MapZoomControl from './MapZoomControl';

import { useApp } from '../../context/AppContext';
import { useAppStatus } from '../../context/AppStatusContext';
import { useViewport } from '../../context/ViewportContext';
import { initialViewport, conusPadding, conusFitStep } from '../../utils/conusView';
import { usePreferences } from '../../context/PreferencesContext';
import { useWeatherModelsContext } from '../../context/WeatherModelsContext';
import MapFeaturePopup from './MapFeaturePopup';
import StormMapPopup from './StormMapPopup';
import NhcModelTracksLayer from './layers/NhcModelTracksLayer';
import { useSatelliteContext } from '../../context/SatelliteContext';
import { useRadarSiteContext } from '../../context/RadarSiteContext';
import { useNhcModelTracks } from '../../hooks/useNhcModelTracks';
import { buildCyclones, buildOutlookSystems } from '../../api/nhcTropicalWeather';
import SpotlightMaskLayer from './layers/SpotlightMaskLayer';
import * as hrrRateLimiter from '../../utils/hrrRateLimiter';

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
import RAWSLayer from './layers/RAWSLayer';
import AirNowMonitorsLayer from './layers/AirNowMonitorsLayer';
import DroughtOutlookLayer from './layers/DroughtOutlookLayer';
import NdgdSmokeForecastLayer from './layers/NdgdSmokeForecastLayer';
import FireWeatherOutlookLayer from './layers/FireWeatherOutlookLayer';
import WpcEroLayer from './layers/WpcEroLayer';
import WpcWssiLayer from './layers/WpcWssiLayer';
import WpcQpfLayer from './layers/WpcQpfLayer';
import WpcFrontsLayer from './layers/WpcFrontsLayer';
import WpcMesoscaleDiscussionLayer from './layers/WpcMesoscaleDiscussionLayer';
import CriticalInfrastructureLayer from './layers/CriticalInfrastructureLayer';
import NationalMapCollegesLayer from './layers/NationalMapCollegesLayer';
import CaliforniaLandOwnershipLayer from './layers/CaliforniaLandOwnershipLayer';
import FloodHazardLayer, { FLOOD_ZONES_FILL_ID, FLOOD_PANELS_FILL_ID } from './layers/FloodHazardLayer';
import { floodCategoryMeta } from '../../utils/floodHazard';
import NHCTropicalWeatherLayer from './layers/NHCTropicalWeatherLayer';
import NhcWindHazardsLayer from './layers/NhcWindHazardsLayer';
import WaterGaugesLayer from './layers/WaterGaugesLayer';
import CaliforniaCamerasLayer from './layers/CaliforniaCamerasLayer';
import CalFirePerimetersLayer from './layers/CalFirePerimetersLayer';
import HazardEventsLayer from './layers/HazardEventsLayer';
import DamageAssessmentLayer from './layers/DamageAssessmentLayer';
import MrmsLayer from './layers/MrmsLayer';
import SignificantFirePotentialLayer, { SFP_FILL_ID } from './layers/SignificantFirePotentialLayer';
import FuelModelLayer from './layers/FuelModelLayer';
import WfpiLayer from './layers/WfpiLayer';
import FieldSamplesLayer, { SAMPLES_CIRCLE_ID } from './layers/FieldSamplesLayer';
import FireDangerStationsLayer, { STATIONS_CIRCLE_ID } from './layers/FireDangerStationsLayer';
import { useFireDangerContext } from '../../context/FireDangerContext';
import RadarSitesLayer, { RadarSiteSweepLayer, RADAR_SITES_PILL_ID } from './layers/RadarSitesLayer';
import LightningLayer from './layers/LightningLayer';
import AwcLayers from './layers/AwcLayers';
import TfrLayer from './layers/TfrLayer';
import { TFR_FILL_ID, buildTfrRecord } from './layers/tfrRecords';
import { awcInteractiveLayerIds, buildAwcRecord } from './layers/awcRecords';
import { useAwcContext } from '../../context/AwcContext';
import { parseAliasIds } from '../../utils/incidentAliases';
import { ndgdFeatureToDateMs } from '../../utils/ndgdSmokeHours';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';
const HAS_MAPBOX_TOKEN = Boolean(MAPBOX_TOKEN.trim());

// Quick helper if you don't already have one exported from utils
const num = (val) => Number(val);

// Match the NOMADS host exactly — a substring test would also match
// e.g. https://evil.example/?nomads.ncep.noaa.gov.
function isNomadsUrl(url) {
  try {
    return new URL(url).hostname === 'nomads.ncep.noaa.gov';
  } catch {
    return false;
  }
}

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
/**
 * The Fire Danger & Fuels inspection record for a clicked point. `sfpProps`
 * are the clicked fire potential area's properties, or null when the click
 * missed every area (or that layer is off); the panel then shows what else
 * is known at the point.
 */
function buildFireDangerPointRecord(lngLat, sfpProps, fireDanger, station = null, sampleSite = null) {
  return {
    type:         'fire-danger-point',
    id:           `fire-danger-${lngLat.lat.toFixed(4)},${lngLat.lng.toFixed(4)}`,
    lat:          lngLat.lat,
    lng:          lngLat.lng,
    sfp:          sfpProps ?? null,
    sfpDay:       fireDanger?.sfp?.day ?? null,
    sfpFetchedAt: fireDanger?.sfp?.fetchedAt ?? null,
    // A clicked FEMS station; otherwise the panel finds the nearest one.
    station:      station ?? null,
    // A clicked fuel moisture sample site; otherwise the panel finds the nearest one.
    sampleSite:   sampleSite ?? null,
  };
}

/** One click can hit a fire potential area and a station: show them as one inspection. */
function mergeFireDangerRecords(records) {
  const fd = records.filter((r) => r.record.type === 'fire-danger-point');
  if (fd.length < 2) return records;
  const merged = { ...fd[0].record };
  for (const { record } of fd.slice(1)) {
    merged.sfp = merged.sfp ?? record.sfp;
    merged.station = merged.station ?? record.station;
    merged.sampleSite = merged.sampleSite ?? record.sampleSite;
  }
  return [{ record: merged, feature: fd[0].feature }, ...records.filter((r) => r.record.type !== 'fire-danger-point')];
}

function buildFeatureRecord(feature, lngLat, alerts, { floodPanel = null, fireDanger = null } = {}) {
  const p = feature.properties;

  // Aviation Weather Center layers (AwcLayers): every one opens AwcDetail.
  if (feature.layer.id.startsWith('awc-src-')) return buildAwcRecord(feature, lngLat);
  if (feature.layer.id === TFR_FILL_ID) return buildTfrRecord(feature, lngLat);

  switch (feature.layer.id) {
    case SFP_FILL_ID:
      return buildFireDangerPointRecord(lngLat, p, fireDanger);

    case STATIONS_CIRCLE_ID: {
      // Rendered features carry nested arrays (the forecast) as JSON strings; use the loaded record.
      const station = fireDanger?.stations?.data?.features?.find((f) => f.properties.id === p.id)?.properties ?? p;
      return buildFireDangerPointRecord(lngLat, null, fireDanger, station);
    }

    case SAMPLES_CIRCLE_ID:
      return buildFireDangerPointRecord(lngLat, null, fireDanger, null, p);

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

    case 'user-reports-circle': {
      let evacuationLines;
      try {
        evacuationLines = p.evacuation_order_lines_json ? JSON.parse(p.evacuation_order_lines_json) : [];
      } catch {
        evacuationLines = [];
      }
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
        // The official incident this report was linked to (LiveTrackerPage).
        evacuation_summary:     p.evacuation_summary,
        evacuation_orders:      num(p.evacuation_orders) || 0,
        evacuation_warnings:    num(p.evacuation_warnings) || 0,
        evacuation_order_lines: evacuationLines,
        aliasIds:               parseAliasIds(p.alias_ids),
      };
    }

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

// NHC storm layers a click can open the storm popup from, and how the popup
// names what was clicked.
// Outlook layers (invest disturbances, areas of interest) open the same popup.
const OUTLOOK_CLICK_LAYERS = {
  'nhc-disturbance-circle': 'Disturbance',
  'nhc-disturbance-fill': 'Area of interest',
};

// Zoom 12 is about a 1-mile map view (see FloodHazardLayer).
const WILDFIRE_ALERTS_MAX_ZOOM = 12;

const STORM_CLICK_LAYERS = {
  'nhc-cone-fill': () => 'Cone of uncertainty',
  'nhc-forecast-track-line': () => 'Forecast track',
  'nhc-track-circle': (p) => (p.isCurrent === true || p.isCurrent === 'true' ? 'Current position' : `Forecast +${p.tau} hr`),
  'nhc-obs-circle': () => 'Past track',
};



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
 * @param {Array}       [props.savedLocations]
 * @param {Object|null} [props.nearbyRadiusGeoJSON] Near-me radius circle (Home Setup radius around live GPS)
 * @param {'wildfire'|'weather'|'allhazard'|'models'} [props.activeMapTab]
 * @param {Function}    [props.onModelPick]  Models tab: a map click picks the forecast point ({lat, lon})
 * @param {Function|React.ReactNode} [props.modelOverlay] Rendered inside the map: on the Models tab ({ mapStyle, mapboxAccessToken }) => children; elsewhere the wind particles
 * @param {React.ReactNode} [props.routeOverlay] All Hazards Route to Safety layer, rendered inside the map
 * @param {Function}    [props.onRoutePick]  Route to Safety "pick a point": a map click sets the destination ({lng, lat})
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
  wpcPressureCentersGeoJSON,
  wpcMpdGeoJSON,
  onMapLoad,
  // The satellite panel holds the dock above the bottom bar: other layers' docked controls step aside.
  ndgdForecastHoursMs = [],
  ndgdSmokeHourIndex = 0,
  onModelPick,
  modelOverlay = null,
  routeOverlay = null,
  onRoutePick,
}) {
  const { layers, setLayer, selectedFire, selectFire, selectGauge, selectCamera, sidebarOpen, locationGranted, layerPanelOpen, closeLayerPanel, nhcModelTracks } = useApp();
  const radarSites = useRadarSiteContext();
  const radarSitesActive = Boolean(radarSites?.active && radarSites.sites);
  const toggleRadarSite = radarSites?.toggleSite;
  const satellite = useSatelliteContext();
  const fireDanger = useFireDangerContext();
  const fireDangerOn = Boolean(fireDanger?.anyOn);
  const awc = useAwcContext();
  const { alerts, userLocation, setUserLocation } = useAppStatus();
  const { viewport, setViewport } = useViewport();
  // Read on map load: still the opening camera means nothing has moved it yet.
  const viewportRef = useRef(viewport);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);
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

  // All fire points share one clustered source (IncidentLocationsLayer), so
  // perimeter centroid dots are derived here rather than inside FirePerimetersLayer.
  // One Active Fires toggle (layers.incidentLocations) drives every fire dot,
  // perimeter centroids included, and the perimeter shapes.
  const showFireIncidents  = (isWildfireTab || isAllHazardTab) && Boolean(layers.incidentLocations);
  const showFirePerimeters = showFireIncidents;
  const perimeterCentroidsGeoJSON = useMemo(
    () => (showFireIncidents ? perimeterCentroids(perimetersGeoJSON) : null),
    [showFireIncidents, perimetersGeoJSON],
  );

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
  // clicks and pointer cursors don't compete with the measurement workflow.
  const interactiveLayerIds = useMemo(() => {
    if (measureActive) return [];
    const ids = [];
    if ((isWildfireTab || isAllHazardTab) && layers.fireHotspots && hotspotsGeoJSON)        ids.push('fire-hotspots-circle');
    if ((isWildfireTab || isAllHazardTab) && layers.ngfsDetections && ngfsGeoJSON)          ids.push('ngfs-detections-fill');
    if ((isWildfireTab || isAllHazardTab) && layers.incidentLocations) {
      if (perimetersGeoJSON) ids.push('fire-perimeters-fill');
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
    if (fireDanger?.sfpOn && fireDanger.sfp.data) ids.push(SFP_FILL_ID);
    if (fireDanger?.stationsOn && fireDanger.stations.data) ids.push(STATIONS_CIRCLE_ID);
    if (fireDanger?.samplesOn && fireDanger.samples.data) ids.push(SAMPLES_CIRCLE_ID);
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
      ids.push('wpc-fronts-solid', 'wpc-fronts-dashed', 'wpc-fronts-squall');
    }
    if ((isWeatherTab || isAllHazardTab) && layers.weatherAlerts && wpcMpdGeoJSON?.features?.length) ids.push('wpc-mpd-fill');
    if (radarSitesActive) ids.push(RADAR_SITES_PILL_ID);
    ids.push(...awcInteractiveLayerIds(awc));
    if ((isWildfireTab || isWeatherTab || isAllHazardTab) && layers.tfrs) ids.push(TFR_FILL_ID);
    return ids;
  }, [measureActive, radarSitesActive, awc, isWildfireTab, isWeatherTab, isAllHazardTab, layers.tfrs, layers.fireHotspots, layers.incidentLocations, layers.aqi,
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
      hazardEventsGeoJSON, fireDanger?.sfpOn, fireDanger?.sfp?.data, fireDanger?.stationsOn, fireDanger?.stations?.data,
      fireDanger?.samplesOn, fireDanger?.samples?.data]);

  // Clear a stale click popup when layers change
  useEffect(() => {
    setFeaturePopup(null);
  }, [layers]);

  // Handle map click – add measurement point OR select fire for detail panel
  const handleClick = useCallback((evt) => {
    // Navigation "pick a point on map": the click is the destination, even with
    // the layer panel open (otherwise the first tap only closes the panel).
    // Measurement keeps priority if both are somehow active.
    if (onRoutePick && !measureActive) {
      if (layerPanelOpen) closeLayerPanel();
      onRoutePick({ lng: evt.lngLat.lng, lat: evt.lngLat.lat });
      return;
    }

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
      selectGauge(null);
      setFeaturePopup(null);
      // Fire Danger & Fuels: any point on the map can be inspected (the fuel
      // model raster has no features to click).
      selectFire(fireDangerOn ? buildFireDangerPointRecord(evt.lngLat, null, fireDanger) : null);
      return;
    }

    // Radar site pills are small targets that often sit inside alert
    // polygons, so a pill under the click wins over whatever is on top.
    // Clicking the selected station's pill again turns its radar off.
    const radarPill = features.find((f) => f.layer.id === RADAR_SITES_PILL_ID);
    if (radarPill) {
      toggleRadarSite?.(radarPill.properties.id);
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
    let records = [];
    const floodPanelFeature = features.find((f) => f.layer.id === FLOOD_PANELS_FILL_ID);
    const floodPanel = floodPanelFeature?.properties ?? null;
    for (const f of features) {
      const record = buildFeatureRecord(f, evt.lngLat, alerts, { floodPanel, fireDanger });
      if (!record) continue;
      const key = `${f.layer.id}:${record.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      records.push({ record, feature: f });
    }
    records = mergeFireDangerRecords(records);
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
      selectFire(fireDangerOn ? buildFireDangerPointRecord(evt.lngLat, null, fireDanger) : null);
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
  }, [measureActive, alerts, selectFire, selectGauge, selectCamera, toggleRadarSite, layerPanelOpen, closeLayerPanel, onModelPick, onRoutePick, nhcCyclones, nhcOutlookSystems, pickAtCenter, fireDanger, fireDangerOn]);

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

  // Handle mouse move – pointer cursor over clickable features OR measurement
  // preview. There is no hover tooltip: feature info opens only on click.
  const handleMouseMove = useCallback((evt) => {
    if (measureActive) {
      setMeasurePreview({ lng: evt.lngLat.lng, lat: evt.lngLat.lat });
      if (mapRef.current) mapRef.current.getCanvas().style.cursor = 'crosshair';
      return;
    }
    // Route to Safety pick mode: the whole map is a target.
    if (onRoutePick) {
      if (mapRef.current) mapRef.current.getCanvas().style.cursor = 'crosshair';
      return;
    }
    const features = evt.features;
    if (!mapRef.current) return;
    // FIRM panels blanket the whole view at flood-detail zoom; they're
    // clickable for panel info but shouldn't turn the cursor into a
    // pointer everywhere on their own.
    const clickable = features?.some((f) => f.layer.id !== FLOOD_PANELS_FILL_ID);
    mapRef.current.getCanvas().style.cursor = clickable ? 'pointer' : '';
  }, [measureActive, onRoutePick]);

  // Pick mode on → crosshair right away (before the next mouse move);
  // off → back to the default cursor.
  const routePickActive = Boolean(onRoutePick);
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas?.();
    if (!canvas || measureActive) return;
    canvas.style.cursor = routePickActive ? 'crosshair' : '';
  }, [routePickActive, measureActive]);

  const handleMouseLeave = useCallback(() => {
    setMeasurePreview(null);
    if (mapRef.current) {
      mapRef.current.getCanvas().style.cursor = '';
    }
  }, []);

  // Rate-limit HRRR WMS tile requests (9 999 / day)
  const TRANSPARENT_TILE =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  const transformRequest = useCallback((url, resourceType) => {
    if (resourceType === 'Tile' && isNomadsUrl(url)) {
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

  // Opening view: frame the lower 48 between the header (the map's top edge)
  // and the bottom bar, as tight as it fits. Fitted on the live map so the
  // globe's curvature is accounted for. Skipped if anything already moved the
  // camera (a shared incident link, the user panning).
  //
  // The map's size can change after load (the Red Flag Warning banner drops in
  // above it once alerts arrive, or is dismissed), so it re-frames on resize for
  // as long as the camera is still the one it framed.
  const autoFrameRef = useRef(null);
  const frameRunRef = useRef(0);
  const frameConus = useCallback(async (map) => {
    const run = ++frameRunRef.current;
    const canvas = map.getContainer().getBoundingClientRect();
    const bar = document.querySelector('[data-map-bottom-bar]')?.getBoundingClientRect();
    // Map bottom edge (it bleeds past the page) up to the top of the bottom bar.
    const padding = conusPadding(bar ? Math.max(0, canvas.bottom - bar.top) : undefined);
    const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (let i = 0; i < 4; i += 1) {
      let step;
      try {
        step = conusFitStep(map, padding);
      } catch {
        return;
      }
      if (!step || !Number.isFinite(step.camera.zoom)) return;
      if (step.done) return;
      autoFrameRef.current = step.camera;
      setViewport(step.camera);
      // Let react-map-gl apply the camera before measuring again.
      await nextFrame();
      if (run !== frameRunRef.current || !isAutoFramed()) return;
    }
  }, [setViewport]);
  // True while the camera is still the one frameConus set (nothing else moved it).
  function isAutoFramed() {
    const framed = autoFrameRef.current;
    const v = viewportRef.current;
    return Boolean(framed) && Math.abs(v.longitude - framed.longitude) < 1e-4
      && Math.abs(v.latitude - framed.latitude) < 1e-4 && Math.abs(v.zoom - framed.zoom) < 1e-3;
  }
  const handleMapLoad = useCallback((e) => {
    const map = e?.target;
    if (viewportRef.current === initialViewport && typeof map?.project === 'function') {
      frameConus(map);
      map.on('resize', () => {
        // Next frame: react-map-gl syncs the camera after the resize event.
        if (isAutoFramed()) requestAnimationFrame(() => frameConus(map));
        else autoFrameRef.current = null;
      });
      // Mapbox doesn't always notice its container shrinking when the banner
      // pushes it down, leaving the canvas taller than the space it has.
      if (typeof ResizeObserver !== 'undefined') {
        const container = map.getContainer();
        let last = container.clientHeight;
        const ro = new ResizeObserver(() => {
          if (container.clientHeight === last) return;
          last = container.clientHeight;
          map.resize();
        });
        ro.observe(container);
        map.once('remove', () => ro.disconnect());
      }
    }
    onMapLoad?.(e);
  }, [onMapLoad, frameConus]);

  return (
    <div className="absolute inset-0 bg-sentinel-900">
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

        {/* NOAA MRMS radar (Weather tab, and All Hazards in Simplified Sentinel).
            Visibility, product and frame come from MrmsContext, which is active
            only on those tabs with the layer on. */}
        <MrmsLayer />

        {/* Fire Danger & Fuels (Wildfire and All Hazards tabs). On/off, day and
            opacity come from FireDangerContext; the fuel raster sits beneath labels. */}
        <FuelModelLayer />
        <WfpiLayer />
        <SignificantFirePotentialLayer />
        <FireDangerStationsLayer />
        <FieldSamplesLayer />

        {/* Radar Site (Weather tab): the selected station's Level 3 sweep. Its
            station pills render near the top of the stack, below. */}
        <RadarSiteSweepLayer />

        {/* FEMA flood hazard zones — contextual, so it sits directly above base
            imagery and below alerts, perimeters, incidents, and evac zones */}
        <FloodHazardLayer data={floodHazardData} visible={floodHazardVisible} />

        {/* Smoke forecast */}
        <SmokeLayer visible={isAllHazardTab && layers.smoke} />

        {/* Storm Motion Vectors — not a layer toggle, so not gated to any
            particular map tab (currently off; see LiveTrackerPage) */}
        <StormMotionVectorLayer
          geoJSON={stormMotionVectorsGeoJSON}
          visible={stormMotionVectorsVisible}
        />

        {/* SPC convective outlook polygons */}
        <SPCOutlookLayer
          geoJSON={spcOutlooksGeoJSON}
          visible={(isWeatherTab || isAllHazardTab) && layers.spcWeatherOutlooks}
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
          centers={wpcPressureCentersGeoJSON}
          visible={(isWeatherTab || isAllHazardTab) && layers.wpcFronts}
        />

        {/* Aviation Weather Center: hazard shapes, navigation, PIREPs and airport
            weather dots (Weather and All Hazards tabs; AwcContext gates them) */}
        <AwcLayers />

        {/* FAA Temporary Flight Restrictions (Aviation section; every tab but Models) */}
        <TfrLayer visible={(isWildfireTab || isWeatherTab || isAllHazardTab) && layers.tfrs} />

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

        {/* Operational stack, bottom to top: NWS alerts → evacuation zones →
            fire perimeters → fire points. layerStack.js keeps this order on
            top of every other data layer, even ones that mount later. */}
        {/* Weather alert zones — wildfire tab shows Red Flag Warnings only, no SPC MDs */}
        <WeatherAlertsLayer
          geoJSON={alertsGeoJSON}
          spcMdGeoJSON={isWildfireTab ? null : spcMdGeoJSON}
          visible={(isWildfireTab || isWeatherTab || isAllHazardTab) && layers.weatherAlerts}
          onImagery={satelliteImageryOn}
          // Wildfire tab: hide NWS alerts once zoomed in past a ~1-mile view so
          // they don't cover the fire detail underneath.
          alertsMaxZoom={isWildfireTab ? WILDFIRE_ALERTS_MAX_ZOOM : undefined}
        />

        {/* Evacuation zones and markers — above NWS alerts, below fire data */}
        <EvacuationZonesLayer
          geoJSON={evacZonesGeoJSON}
          visible={layers.evacZones}
        />

        {/* Fire perimeter polygons (their dots cluster in IncidentLocationsLayer) */}
        <FirePerimetersLayer
          geoJSON={perimetersGeoJSON}
          visible={showFirePerimeters}
          centroidDots={false}
        />

        {/* Every fire point — WFIGS incident locations, perimeter centroid dots
            and incident dots with no perimeter — clustered together; top of
            the data stack */}
        <IncidentLocationsLayer
          geoJSON={showFireIncidents ? incidentsGeoJSON : null}
          fireDotsGeoJSON={showFireIncidents ? incidentDotsGeoJSON : null}
          perimeterCentroidsGeoJSON={perimeterCentroidsGeoJSON}
          visible={showFireIncidents}
        />

        {/* GOES GLM lightning, last 15 minutes — layerStack.js keeps it above alerts and radar */}
        <LightningLayer visible={(isWeatherTab || isAllHazardTab) && Boolean(layers.lightning)} />

        {/* Radar Site station pills — layerStack.js keeps them above fire points */}
        <RadarSitesLayer />

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

        {routeOverlay}

        {/* Measurement geometry – rendered last so it's always on top */}
        {measureActive && (
          <MeasurementLayer
            points={measurePoints}
            previewPoint={measurePoints.length > 0 ? measurePreview : null}
            mode={measureMode}
          />
        )}

        {/* Hover tooltip (not over an open storm popup) */}

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
