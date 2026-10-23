/**
 * LiveTrackerPage.jsx
 * Full-screen wildfire tracking dashboard with live map, sidebar, and layer controls.
 * Refactored from the original App.jsx single-page layout.
 */

import Seo from '../../shared/components/Seo';
import { useApp } from '../context/AppContext';
import { useAppStatus } from '../context/AppStatusContext';
import { useViewport } from '../context/ViewportContext';
import { useSimplifiedMode } from '../context/SimplifiedModeContext';
import { useHomeSetup } from '../context/HomeSetupContext';
import { nwsAlertCategory } from '../utils/nwsColors';
import { FIRE_WEATHER_ALERT_TYPES } from '../api/noaaWeather';
import { useSavedLocations } from '../hooks/useSavedLocations';
import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Data hooks
import { useFireHotspots } from '../hooks/useFireHotspots';
import { useNgfsDetections } from '../hooks/useNgfsDetections';
import { useMergedFireData, getFireMatchKey, pointInGeometry, pointNearGeometry, pointNearPerimeter, pointsNearSameFire } from '../hooks/useMergedFireData';
import { useAQIData } from '../hooks/useAQIData';
import { useWeatherAlerts } from '../hooks/useWeatherAlerts';
import { useIncidents } from '../hooks/useIncidents';
import { useCalFireIncidents } from '../hooks/useCalFireIncidents';
import { useNwsLsrMapServer } from '../hooks/useNwsLsrMapServer';
import { useDamageAssessment } from '../hooks/useDamageAssessment';
import { useSpcOutlooks } from '../hooks/useSpcOutlooks';
import { useSpcMesoscaleDiscussion } from '../hooks/useSpcMesoscaleDiscussion';
import { useWpcMesoscaleDiscussion } from '../hooks/useWpcMesoscaleDiscussion';
import { useFireReports, reportsToGeoJSON } from '../hooks/useFireReports';
import { useHazardEvents, hazardEventsToGeoJSON, normalizeHazardCategory } from '../hooks/useHazardEvents';
import { useCombinedEvacZones } from '../hooks/useCombinedEvacZones';
import { useReporterEvacZones, reporterEvacZonesToGeoJSON } from '../hooks/useReporterEvacZones';
import { useRAWSData } from '../hooks/useRAWSData';
import { useFireBehaviorModeling } from '../hooks/useFireBehaviorModeling';
import { useAirNowMonitors } from '../hooks/useAirNowMonitors';
import { useDroughtOutlook } from '../hooks/useDroughtOutlook';
import { useNdgdSmokeForecast } from '../hooks/useNdgdSmokeForecast';
import { useFireWeatherOutlooks } from '../hooks/useFireWeatherOutlooks';
import { useWpcEro } from '../hooks/useWpcEro';
import { useWpcWssi } from '../hooks/useWpcWssi';
import { useWpcQpf } from '../hooks/useWpcQpf';
import { useWpcFronts } from '../hooks/useWpcFronts';
import { useNhcTropicalWeather } from '../hooks/useNhcTropicalWeather';
import { useNhcWindHazards } from '../hooks/useNhcWindHazards';
import { useCriticalInfrastructure } from '../hooks/useCriticalInfrastructure';
import { useNationalMapColleges } from '../hooks/useNationalMapColleges';
import { useCaliforniaLandOwnership, isWithinLandOwnershipRange } from '../hooks/useCaliforniaLandOwnership';
import { useFloodHazards } from '../hooks/useFloodHazards';
import { usePlan } from '../../shared/hooks/usePlan';
import { useWaterGauges } from '../hooks/useWaterGauges';
import { useStormMotionVectors } from '../hooks/useStormMotionVectors';
import { useCaliforniaCameras } from '../hooks/useCaliforniaCameras';
import { useCalFirePerimeters } from '../hooks/useCalFirePerimeters';
import { useNearbyOutlooks } from '../hooks/useNearbyOutlooks';
import { filterByRadius, filterFeatureCollectionByRadius, circlePolygon, zoomForRadius } from '../utils/radiusFilter';
import { summarizeOverview, QUICK_FILTERS } from '../utils/overviewSummary';
import { featureCollectionsBounds, polygonCentroid } from '../utils/geoUtils';
import { incidentsToGeoJSON } from '../api/inciweb';
import { mergeIrwinAndCalFireIncidents } from '../utils/mergeIncidents';
import { incidentIdsFor, joinAliasIds, parseAliasIds } from '../utils/incidentAliases';
import { officialIdsForReport, reportIdsForName } from '../utils/reportIncidentLinks';
import { parseLatestAcreage, parseLatestContainment } from '../utils/formatUtils';

// Components
import Header from '../components/Header/Header';
import Sidebar from '../components/Sidebar/Sidebar';
import MapView from '../components/Map/MapView';
import MapBottomBar from '../components/BottomBar/MapBottomBar';
import WeatherModelsPanel from '../components/WeatherModels/WeatherModelsPanel';
import WeatherModelsMapLayer, { WindParticlesOverlay } from '../components/WeatherModels/WeatherModelsMapLayer';
import ModelFieldLegend from '../components/WeatherModels/ModelFieldLegend';
import ModelLegend from '../components/WeatherModels/ModelLegend';
import { ROOT_VARS as MODEL_COLOR_VARS } from '../components/WeatherModels/modelTheme';
import { WeatherModelsProvider } from '../context/WeatherModelsContext';
import { MrmsProvider } from '../context/MrmsContext';
import { FireDangerProvider } from '../context/FireDangerContext';
import { RadarSiteProvider } from '../context/RadarSiteContext';
import { AwcProvider } from '../context/AwcContext';
import { SatelliteProvider } from '../context/SatelliteContext';
import { parseSatelliteQuery } from '../api/goesSatellite';
import { parseModelsQuery } from '../utils/weatherModelsLink';
import MapCornerButtons from '../components/MapControls/MapCornerButtons';
import { useRouteToSafety } from '../hooks/useRouteToSafety';
import RouteToSafetyPanel from '../components/Routing/RouteToSafetyPanel';
import RouteLayer from '../components/Map/layers/RouteLayer';
import FutureFeaturesPanel from '../components/MapControls/FutureFeaturesPanel';
import SimplifiedPrompt from '../components/MapControls/SimplifiedPrompt';
import LoginOverview from '../components/Overview/LoginOverview';
import AccountButton from '../components/MapControls/AccountButton';
import AccountPanel from '../components/AccountPanel/AccountPanel';
import Legend from '../components/Legend/Legend';
import { MapScaleDock } from '../components/Map/MapScaleBar';
import { RIGHT_PANEL_BOTTOM, leftPanelLayout, rightPanelMaxWidth, useViewportWidth } from '../components/Map/mapEdgeLayout';
import { APP_VERSION } from '../version';
import MapDockSheet from '../components/Map/MapDockSheet';
import ModelFieldTimeline from '../components/WeatherModels/ModelFieldTimeline';
import SatelliteStormFocus from '../components/Map/SatelliteStormFocus';
import { drawsCentroidDot } from '../components/Map/layers/perimeterCentroids';
import { ndgdForecastHours } from '../utils/ndgdSmokeHours';
import { FIRE_DANGER_LAYER_KEYS } from '../api/fireDanger/stations';
// Lazy-loaded: each only ever mounts once the user has actually selected the
// corresponding fire/gauge/camera, so their code shouldn't ship in
// the initial bundle for sessions that never open one.
const FireDetailPanel = lazy(() => import('../components/FireDetailPanel/FireDetailPanel'));
const WaterGaugePanel = lazy(() => import('../components/WaterGaugePanel/WaterGaugePanel'));
const CameraPanel = lazy(() => import('../components/CameraPanel/CameraPanel'));

// US continental bounding box for data fetches
const US_BOUNDS = { west: -130, south: 24, east: -65, north: 50 };

const MAP_TABS = {
  wildfire:   'wildfire',
  weather:    'weather',
  allhazard:  'allhazard',
  locations:  'locations',
  models:     'models',
};

const WILDFIRE_LAYER_PRESET = {
  fireHotspots: false,
  incidentLocations: true, // fire points + perimeter shapes
  weatherAlerts: true,
  smoke: false,
  satellite: false,
  spcWeatherOutlooks: false,
  evacZones: true,
  rawsStations: false,
  airNowMonitors: false,
  ndgdSmokeForecast: false,
  fireWeatherOutlooks: false,
  stormReports: false,
  criticalInfrastructure: false,
  schoolsUniversities: false,
  landOwnership: false,
  floodHazard: false,
  fireRiskOutlook: false,
  fuelModels: false,
  fdErc: false,
  fdBi: false,
  fdSc: false,
  fdDeadFm: false,
  fdLiveFm: false,
  wfpi: false,
  lfmSamples: false,
  awc: false,
  tfrs: false,
};

const ALL_HAZARD_LAYER_PRESET = {
  fireHotspots: false,
  incidentLocations: true, // fire points + perimeter shapes
  weatherAlerts: true,
  smoke: false,
  satellite: false,
  spcWeatherOutlooks: false,
  evacZones: true,
  rawsStations: false,
  airNowMonitors: false,
  ndgdSmokeForecast: false,
  fireWeatherOutlooks: false,
  stormReports: false,
  criticalInfrastructure: false,
  schoolsUniversities: false,
  landOwnership: false,
  floodHazard: false,
  radarSites: false,
  mrms: false, // only Simplified Sentinel offers it here
  fireRiskOutlook: false,
  fuelModels: false,
  fdErc: false,
  fdBi: false,
  fdSc: false,
  fdDeadFm: false,
  fdLiveFm: false,
  wfpi: false,
  lfmSamples: false,
  nhcTropical: true, // on by default; the Weather preset turns it off
};

// Simplified Sentinel opens All Hazards with NHC Tropical off, and without NWS
// alerts (it has no row for them there).
const SIMPLIFIED_ALL_HAZARD_LAYER_PRESET = { ...ALL_HAZARD_LAYER_PRESET, nhcTropical: false, weatherAlerts: false };

// Weather tab: opens with only MRMS radar on (NWS & mesoscale starts off too).
// Every other layer is listed off so nothing carries over from the previous
// tab; all of them stay available in the layer panel.
const WEATHER_LAYER_PRESET = {
  fireHotspots: false,
  incidentLocations: false,
  weatherAlerts: false,
  smoke: false,
  satellite: false,
  spcWeatherOutlooks: false,
  stormReports: false,
  criticalInfrastructure: false,
  evacZones: false,
  rawsStations: false,
  airNowMonitors: false,
  ndgdSmokeForecast: false,
  schoolsUniversities: false,
  landOwnership: false,
  floodHazard: false,
  aqi: false,
  wildfireCameras: false,
  fireWeatherOutlooks: false,
  fireRiskOutlook: false,
  fuelModels: false,
  fdErc: false,
  fdBi: false,
  fdSc: false,
  fdDeadFm: false,
  fdLiveFm: false,
  wfpi: false,
  lfmSamples: false,
  droughtOutlook: false,
  calFireHistoricalPerimeters: false,
  fireBehaviorModeling: false,
  waterGauges: false,
  damageAssessment: false,
  wpcEro: false,
  wpcWssi: false,
  wpcQpf: false,
  wpcFronts: false,
  nhcTropical: false,
  mrms: true,
  radarSites: false,
  lightning: false,
  awc: false,
  tfrs: false,
};

// Models tab: HRRR/GFS model output only. Every operational layer (alerts,
// incidents, observations) is off so model data is never blended with them;
// any of them can still be switched on from the layer panel.
// NHC tropical graphics are off too: the Models tab shows model fields only.
const MODELS_LAYER_PRESET = {
  ...Object.fromEntries(Object.keys(WILDFIRE_LAYER_PRESET).map((k) => [k, false])),
  nhcTropical: false,
};

// Storm Motion Vectors are off for everyone (their menu switch was removed);
// the layer and its hook stay, so setting this to true brings them back.
const STORM_MOTION_VECTORS = false;

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Returns true if a fire is 100% contained AND has not been updated in 3+ days.
 * These fires should be removed from the map entirely.
 */
function isStaleContained(contained, updatedTimestamp) {
  if (Number(contained) < 100) return false;
  if (!updatedTimestamp) return false;
  return Date.now() - new Date(updatedTimestamp).getTime() >= THREE_DAYS_MS;
}

/**
 * Remove fully-contained fires that haven't been updated in 3+ days from a GeoJSON collection.
 */
function filterStaleContainedGeoJSON(geoJSON, containedKey, updatedKey) {
  if (!geoJSON?.features) return geoJSON;
  return {
    ...geoJSON,
    features: geoJSON.features.filter(
      f => !isStaleContained(f.properties[containedKey], f.properties[updatedKey])
    ),
  };
}

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

// How far (degrees) a same-named community report may sit outside a
// perimeter and still be treated as that fire (~5.5 km).
const REPORT_PERIMETER_BUFFER_DEG = 0.05;

/**
 * Returns true if a timestamp is older than maxAgeMs. Missing or unparseable
 * timestamps are treated as not-stale (kept), matching isStaleContained's
 * conservative behavior elsewhere in this file.
 */
function isOlderThan(timestamp, maxAgeMs) {
  if (!timestamp) return false;
  const t = new Date(timestamp).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t >= maxAgeMs;
}

/**
 * Remove features from a GeoJSON collection that haven't been updated within maxAgeMs.
 */
function filterByMaxAge(geoJSON, updatedKey, maxAgeMs) {
  if (!geoJSON?.features) return geoJSON;
  return {
    ...geoJSON,
    features: geoJSON.features.filter(f => !isOlderThan(f.properties[updatedKey], maxAgeMs)),
  };
}

/**
 * Mark (but don't remove) features that haven't been updated within maxAgeMs
 * by setting properties.isStaleFire. Used for perimeters, which stay on the
 * map indefinitely but render greyed-out and without a dot once stale.
 */
function tagStaleFire(geoJSON, updatedKey, maxAgeMs) {
  if (!geoJSON?.features) return geoJSON;
  return {
    ...geoJSON,
    features: geoJSON.features.map(f => ({
      ...f,
      properties: {
        ...f.properties,
        isStaleFire: isOlderThan(f.properties[updatedKey], maxAgeMs),
      },
    })),
  };
}

/**
 * Group places (points or perimeters) by fire match key, for "is a fire of
 * this name close by?" checks: fire names repeat across the country, so the
 * name alone doesn't make two records one fire.
 */
function placesByFireKey(items, nameOf, placeOf) {
  const byKey = new Map();
  items.forEach(item => {
    const key = getFireMatchKey(nameOf(item));
    if (!key) return;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(placeOf(item));
  });
  return byKey;
}

/**
 * Filter a GeoJSON FeatureCollection to only include fires less than 95%
 * contained and not declared contained, controlled or out (perimeters carry
 * those dates; such a fire's percentage is usually blank, which reads as 0%).
 * Used in "Active Fires" mode across all data sources.
 */
function filterActiveFiresGeoJSON(geoJSON, { containedKey }) {
  if (!geoJSON?.features) return geoJSON;
  return {
    ...geoJSON,
    features: geoJSON.features.filter(f => {
      const p = f.properties;
      if (p.ContainmentDateTime || p.ControlDateTime || p.FireOutDateTime) return false;
      const contained = Number(f.properties[containedKey]) || 0;
      return contained < 95;
    }),
  };
}

/**
 * A reporter's incident joined to the official (CAL FIRE / IRWIN) incident
 * of the same fire: the official ids ride along as aliases so the report's
 * panel reads evacuations, shelters and updates saved under them, and the
 * feed's evacuation fields back the panel's evacuation cards when no
 * reporter has entered any.
 */
function linkReportToOfficial(report, incidents, reports) {
  const officialIds = officialIdsForReport(report, incidents);
  const otherReportIds = reportIdsForName(report.title, reports).filter(id => id !== String(report.id));
  if (!officialIds.length && !otherReportIds.length) return report;
  const key = getFireMatchKey(report.title);
  const official = incidents.find(inc => getFireMatchKey(inc.name) === key) || {};
  return {
    ...report,
    aliasIds: parseAliasIds([...officialIds, ...otherReportIds]).filter(id => id !== String(report.id)),
    evacuation_summary: official.evacuation_summary,
    evacuation_orders: official.evacuation_orders,
    evacuation_warnings: official.evacuation_warnings,
    evacuation_order_lines: official.evacuation_order_lines,
  };
}

// Page freshness (see "Keep the page from going stale" below): refresh on
// return once data is a minute old, and force one if no feed has refreshed
// in longer than a poll cycle (feeds poll every 5 minutes).
const RESUME_REFRESH_AFTER_MS = 60 * 1000;
const STALE_AFTER_MS = 6 * 60 * 1000;
const STALE_CHECK_MS = 30 * 1000;

// RAWS stations load once the map is zoomed in to roughly county scale
const RAWS_MIN_ZOOM = 9;

export default function LiveTrackerPage() {
  const { layers, setLayer, feedFilter, setFeedFilter, openSidebar, selectedGauge, selectGauge, selectedFire, selectFire, selectedCamera, selectCamera, wpcOutlookDay, nhcWindProbKt, closeLayerPanel, sidebarOpen, toggleSidebar, futurePanelOpen } = useApp();
  const { setRefreshed, setLoading, alerts, userLocation, lastRefreshed } = useAppStatus();
  const { home, nearbyActive, isHomeSetupComplete, openHomeSetup, homeSetupOpen, clearNearby } = useHomeSetup();
  const { viewport, setViewport, flyToFire } = useViewport();
  const { simplified } = useSimplifiedMode();
  const { hasProInfrastructureAccess, hasFireBehaviorModelingAccess, hasEvacuationRoutesAccess, hasFireDangerAccess } = usePlan();
  const criticalInfraEntitled = hasProInfrastructureAccess;
  const { locations: savedLocations } = useSavedLocations();
  // A Models link (?tab=models&lat=…, e.g. from an incident or /weather-models) opens on that tab,
  // except in Simplified Sentinel, which has no Models tab.
  const [activeMapTab, setActiveMapTab] = useState(
    () => (parseModelsQuery(window.location.search) && !simplified ? MAP_TABS.models : MAP_TABS.wildfire),
  );
  const [mapType, setMapType] = useState('satellite');
  const [weatherAlertFilter, setWeatherAlertFilter] = useState('all');
  const [measureActive, setMeasureActive] = useState(false);
  const [measureMode, setMeasureMode] = useState('distance');

  const onMeasureActivate = useCallback((mode) => {
    setMeasureMode(mode);
    setMeasureActive(true);
  }, []);

  const onMeasureClose = useCallback(() => {
    setMeasureActive(false);
  }, []);

  useEffect(() => {
    if (!criticalInfraEntitled && layers.criticalInfrastructure) {
      setLayer('criticalInfrastructure', false);
    }
  }, [criticalInfraEntitled, layers.criticalInfrastructure, setLayer]);

  useEffect(() => {
    if (!criticalInfraEntitled && layers.landOwnership) {
      setLayer('landOwnership', false);
    }
  }, [criticalInfraEntitled, layers.landOwnership, setLayer]);

  // Fire Danger & Fuels is Plus and above: a free (or lapsed) plan turns its layers off.
  useEffect(() => {
    if (hasFireDangerAccess) return;
    FIRE_DANGER_LAYER_KEYS.forEach((key) => {
      if (layers[key]) setLayer(key, false);
    });
  }, [hasFireDangerAccess, layers, setLayer]);

  // Navigation (Route to Safety): Pro + All Hazards only. A lapsed plan or leaving the tab turns it off.
  // Navigation (Route to Safety): Pro/Team only — the server and quota RPC enforce it too.
  const navigationEntitled = hasEvacuationRoutesAccess;
  // Offered at the bottom of the layer list on the All Hazards, Wildfire and Weather tabs.
  const navigationTab = activeMapTab === MAP_TABS.allhazard || activeMapTab === MAP_TABS.wildfire || activeMapTab === MAP_TABS.weather;
  useEffect(() => {
    if (layers.routeToSafety && (!navigationEntitled || !navigationTab)) {
      setLayer('routeToSafety', false);
    }
  }, [navigationEntitled, navigationTab, layers.routeToSafety, setLayer]);
  const routeToSafetyActive = navigationTab && navigationEntitled && Boolean(layers.routeToSafety);

  // The map canvas bleeds below the page (see .viewport-bleed), so the
  // document itself must not scroll while this full-screen page is mounted.
  // Only <html> gets overflow: hidden (that stops document scrolling); on
  // <body> it would clip the bleed and leave a black bar under the toolbar.
  useEffect(() => {
    const html = document.documentElement;
    const els = [html, document.body];
    const prev = els.map((el) => [el.style.overflow, el.style.overscrollBehavior]);
    html.style.overflow = 'hidden';
    els.forEach((el) => { el.style.overscrollBehavior = 'none'; });
    return () => els.forEach((el, i) => { [el.style.overflow, el.style.overscrollBehavior] = prev[i]; });
  }, []);

  // Wildfire, weather, and all-hazard tabs all default to satellite view.
  useEffect(() => {
    if (
      activeMapTab === MAP_TABS.weather ||
      activeMapTab === MAP_TABS.wildfire ||
      activeMapTab === MAP_TABS.allhazard
    ) {
      setMapType('satellite');
    }
  }, [activeMapTab]);

  // Remembers each wildfire/weather/allhazard tab's own layer toggles across
  // switches — populated in handleTabChange (below) right before leaving a
  // tab, so switching back restores exactly what was on instead of
  // re-applying that tab's default preset every time.
  const layerSnapshotsRef = useRef({});
  const satelliteLinkRef = useRef(Boolean(parseSatelliteQuery(window.location.search)));

  const handleTabChange = useCallback((newTab) => {
    if (newTab === activeMapTab) return;
    if (activeMapTab !== MAP_TABS.locations) {
      // routeToSafety is never restored as on: each activation spends ORS quota.
      // eslint-disable-next-line no-unused-vars
      const { routeToSafety: _routeToSafety, ...snapshot } = layers;
      layerSnapshotsRef.current[activeMapTab] = snapshot;
    }
    setActiveMapTab(newTab);
  }, [activeMapTab, layers]);

  // Models tab hooks: a map click sets the forecast point, and an incident's
  // "Open in Models" switches here (closing the detail panel over the map).
  const modelsApiRef = useRef(null);
  const handleModelPick = useCallback((pt) => modelsApiRef.current?.pick(pt), []);
  const handleModelsIntent = useCallback(() => modelsApiRef.current?.warm(), []);
  const handleOpenModels = useCallback(() => {
    selectFire(null);
    handleTabChange(MAP_TABS.models);
  }, [selectFire, handleTabChange]);

  // Turning Simplified Sentinel on while on the Models tab moves to Wildfire.
  useEffect(() => {
    if (simplified && activeMapTab === MAP_TABS.models) handleTabChange(MAP_TABS.wildfire);
  }, [simplified, activeMapTab, handleTabChange]);

  // Simplified Sentinel has no hazard sidebar: it slides closed and its
  // button is hidden (MapCornerButtons) until the mode is turned off. It
  // opens only to show Home Setup (e.g. from the post-login Overview) and
  // closes again once that's done. The near-me filter is off too: its only
  // off switch is in that sidebar.
  useEffect(() => {
    if (!simplified) return;
    if (sidebarOpen && !homeSetupOpen) toggleSidebar();
    if (nearbyActive) clearNearby();
  }, [simplified, sidebarOpen, toggleSidebar, homeSetupOpen, nearbyActive, clearNearby]);

  // The Models tab is map-first: entering it closes the layer panel so the
  // field is visible. The sidebar (point forecast) opens from a clicked point.
  useEffect(() => {
    if (activeMapTab === MAP_TABS.models) closeLayerPanel();
  }, [activeMapTab, closeLayerPanel]);

  // Switching Simplified Sentinel either way starts the other tabs afresh from
  // their presets (what they remembered was picked from the other set of rows),
  // and the mode starts with NHC Tropical off.
  const simplifiedRef = useRef(simplified);
  useEffect(() => {
    if (simplifiedRef.current === simplified) return;
    simplifiedRef.current = simplified;
    layerSnapshotsRef.current = {};
    if (simplified) setLayer('nhcTropical', false);
  }, [simplified, setLayer]);

  // Apply layer presets only when switching between wildfire/weather/allhazard tabs.
  // The locations tab keeps whatever layers were already active.
  useEffect(() => {
    if (activeMapTab === MAP_TABS.locations) return;
    const presets = {
      [MAP_TABS.wildfire]:  WILDFIRE_LAYER_PRESET,
      [MAP_TABS.weather]:   WEATHER_LAYER_PRESET,
      [MAP_TABS.allhazard]: simplifiedRef.current ? SIMPLIFIED_ALL_HAZARD_LAYER_PRESET : ALL_HAZARD_LAYER_PRESET,
      [MAP_TABS.models]:    MODELS_LAYER_PRESET,
    };
    const preset = presets[activeMapTab];
    if (!preset) return;
    const values = layerSnapshotsRef.current[activeMapTab] || preset;
    Object.entries(values).forEach(([layer, value]) => {
      setLayer(layer, value);
    });
    // A shared satellite link (?sat=…) turns the layer on over the opening tab's preset.
    if (satelliteLinkRef.current && activeMapTab !== MAP_TABS.models) {
      setLayer('satellite', true);
      satelliteLinkRef.current = false;
    }
    if (activeMapTab === MAP_TABS.weather || activeMapTab === MAP_TABS.allhazard) {
      setWeatherAlertFilter('all');
    }
  }, [activeMapTab, setLayer]);


  // ── Startup priority ──
  // The map shell (auth, saved locations, the map itself) renders immediately
  // and is never gated on data. Everything else waits for the map's own
  // 'load' event (mapReady) so hotspot/alert/evac-zone fetches don't compete
  // with map tile/style requests for bandwidth and main-thread time while the
  // map is still initializing. A lower-priority ("tertiary") tier — the
  // community-submitted overlays — is deferred a further step, kicked off
  // only once the browser is idle after the map is ready.
  const [mapReady, setMapReady] = useState(false);
  // The live map instance, for the distance scale beside the bottom bar.
  const [mapInstance, setMapInstance] = useState(null);
  const handleMapLoad = useCallback((e) => {
    setMapReady(true);
    setMapInstance(e?.target ?? null);
  }, []);

  useEffect(() => {
    if (mapReady) return undefined;
    // Fallback in case the map never fires 'load' (missing Mapbox token,
    // WebGL unavailable, etc.) — don't let that block secondary data forever.
    const timer = setTimeout(() => setMapReady(true), 4000);
    return () => clearTimeout(timer);
  }, [mapReady]);

  const [tertiaryReady, setTertiaryReady] = useState(false);
  useEffect(() => {
    if (!mapReady) return undefined;
    let cancelled = false;
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(() => { if (!cancelled) setTertiaryReady(true); }, { timeout: 2000 });
      return () => { cancelled = true; cancelIdleCallback(id); };
    }
    const id = setTimeout(() => { if (!cancelled) setTertiaryReady(true); }, 1000);
    return () => { cancelled = true; clearTimeout(id); };
  }, [mapReady]);

  // ── Data feeds ──
  const wildfireDataEnabled = activeMapTab !== MAP_TABS.weather && activeMapTab !== MAP_TABS.models && mapReady;
  const weatherDataEnabled = (activeMapTab === MAP_TABS.weather || activeMapTab === MAP_TABS.allhazard) && mapReady;

  const {
    geoJSON: hotspotsGeoJSON,
    loading: hotspotsLoading,
    refresh: refreshHotspots,
  } = useFireHotspots(US_BOUNDS, wildfireDataEnabled || (routeToSafetyActive && mapReady));

  const {
    geoJSON: ngfsGeoJSON,
    loading: ngfsLoading,
    refresh: refreshNgfs,
  } = useNgfsDetections(wildfireDataEnabled);

  const {
    perimetersGeoJSON,
    incidentDotsGeoJSON,
    loading: perimetersLoading,
    refresh: refreshPerimeters,
  } = useMergedFireData(5, wildfireDataEnabled || (routeToSafetyActive && mapReady), true);

  const {
    incidents: calFireIncidents,
    loading: calFireLoading,
    refresh: refreshCalFireIncidents,
  } = useCalFireIncidents(true, wildfireDataEnabled);

  // CAL FIRE FRAP historical fire perimeters
  const {
    geoJSON: calFireHistoricalPerimetersGeoJSON,
  } = useCalFirePerimeters(layers.calFireHistoricalPerimeters);

  const {
    geoJSON: aqiGeoJSON,
    refresh: refreshAQI,
  } = useAQIData(layers.aqi);

  const {
    geoJSON: alertsGeoJSON,
    loading: alertsLoading,
    error: alertsError,
    refresh: refreshAlerts,
  } = useWeatherAlerts(mapReady);

  // Storm Motion Vectors — see useStormMotionVectors.js / utils/stormMotion.js.
  // Off for everyone (STORM_MOTION_VECTORS). `alerts` (from useApp(), populated
  // by useWeatherAlerts above) already carries the raw description/sent fields
  // this needs, independent of the weatherAlerts layer toggle.
  const stormMotionVectorsGeoJSON = useStormMotionVectors(
    alerts,
    mapReady && STORM_MOTION_VECTORS
  );

  // Wildfire tab: only fire-related alerts (Red Flag Warning / Fire Weather Watch).
  // Weather and all-hazard tabs: every active NWS alert, optionally narrowed by
  // the warning/watch/advisory category filter in the sidebar.
  const filteredAlertsGeoJSON = useMemo(() => {
    if (!alertsGeoJSON?.features) return alertsGeoJSON;
    let features = alertsGeoJSON.features;
    if (activeMapTab === MAP_TABS.wildfire) {
      features = features.filter(f =>
        FIRE_WEATHER_ALERT_TYPES.has(f.properties.type?.trim().toLowerCase())
      );
    }
    if (weatherAlertFilter !== 'all') {
      features = features.filter(
        f => nwsAlertCategory(f.properties.type) === weatherAlertFilter
      );
    }
    if (features === alertsGeoJSON.features) return alertsGeoJSON;
    return { ...alertsGeoJSON, features };
  }, [alertsGeoJSON, weatherAlertFilter, activeMapTab]);

  const {
    incidents,
    loading: incidentsLoading,
    error: incidentsError,
    refresh: refreshIncidents,
  } = useIncidents(0.1, wildfireDataEnabled);

  const mergedIncidentsList = useMemo(
    () => mergeIrwinAndCalFireIncidents(incidents, calFireIncidents),
    [incidents, calFireIncidents]
  );

  // Drop incidents with no update in 30+ days from both the map and sidebar feed.
  const freshIncidentsList = useMemo(
    () => mergedIncidentsList.filter(inc => !isOlderThan(inc.updated, ONE_MONTH_MS)),
    [mergedIncidentsList]
  );

  const mergedIncidentsGeoJSON = useMemo(
    () => incidentsToGeoJSON(freshIncidentsList),
    [freshIncidentsList]
  );

  const {
    geoJSON: stormReportsGeoJSON,
    refresh: refreshStormReports,
  } = useNwsLsrMapServer(weatherDataEnabled && layers.stormReports);

  const damageAssessmentEnabled = weatherDataEnabled && layers.damageAssessment;
  const {
    pointsGeoJSON: damageAssessmentPointsGeoJSON,
    linesGeoJSON: damageAssessmentLinesGeoJSON,
    polygonsGeoJSON: damageAssessmentPolygonsGeoJSON,
    refresh: refreshDamageAssessment,
  } = useDamageAssessment(damageAssessmentEnabled);

  const [spcOutlookType, setSpcOutlookType] = useState('categorical');
  const [spcActiveDay,   setSpcActiveDay]   = useState('day1');

  const {
    geoJSON:   spcOutlooksGeoJSON,
    loading:   spcOutlooksLoading,
    validTime: spcValidTime,
    refresh:   refreshSpcOutlooks,
  } = useSpcOutlooks(
    layers.spcWeatherOutlooks && weatherDataEnabled,
    spcActiveDay,
    spcOutlookType
  );

  const {
    geoJSON:  spcMdGeoJSON,
    refresh:  refreshSpcMd,
  } = useSpcMesoscaleDiscussion(weatherDataEnabled && layers.weatherAlerts);

  // Active evacuation zones from the CalOES hosted view and IPAWS.
  // Gated on the evacZones layer toggle so the 5-minute CalOES/IPAWS poll
  // stops once the user turns the layer off (was previously always-on).
  // Navigation also needs them (Nearest Safety Area routes out of a zone the
  // start is in) even when the layer is hidden; drawing stays on the toggle.
  const {
    geoJSON: officialEvacZonesGeoJSON,
    refresh: refreshEvacZones,
  } = useCombinedEvacZones((layers.evacZones || routeToSafetyActive) && mapReady);

  // Reporter-drawn evacuation zones (Supabase, active only) — community
  // overlay, deferred to the tertiary tier so it doesn't compete with the
  // official feeds above during startup.
  const {
    zones: reporterEvacZoneRows,
    refresh: refreshReporterEvacZones,
  } = useReporterEvacZones('active', tertiaryReady);
  const reporterEvacZonesGeoJSON = useMemo(
    () => reporterEvacZonesToGeoJSON(reporterEvacZoneRows),
    [reporterEvacZoneRows]
  );

  // Single combined evacuation-zones layer: official feeds + reporter-drawn boundaries
  const evacZonesGeoJSON = useMemo(() => ({
    type: 'FeatureCollection',
    features: [
      ...(officialEvacZonesGeoJSON?.features || []),
      ...(reporterEvacZonesGeoJSON?.features || []),
    ],
  }), [officialEvacZonesGeoJSON, reporterEvacZonesGeoJSON]);

  // RAWS weather stations – only fetch when layer is on AND zoomed in enough
  const rawsEnabled = layers.rawsStations && (viewport?.zoom ?? 0) >= RAWS_MIN_ZOOM;
  const {
    geoJSON: rawsGeoJSON,
    refresh: refreshRAWS,
  } = useRAWSData(rawsEnabled);

  // AirNow monitor stations – only fetch when the layer is toggled on
  const {
    geoJSON: airNowMonitorsGeoJSON,
    refresh: refreshAirNowMonitors,
  } = useAirNowMonitors(layers.airNowMonitors);

  // NOAA CPC Drought Outlook – only fetch when the layer is toggled on
  const {
    geoJSON: droughtOutlookGeoJSON,
    refresh: refreshDroughtOutlook,
  } = useDroughtOutlook(layers.droughtOutlook);

  const {
    geoJSON: ndgdSmokeForecastGeoJSON,
    refresh: refreshNdgdSmokeForecast,
  } = useNdgdSmokeForecast(layers.ndgdSmokeForecast && (activeMapTab === MAP_TABS.wildfire || activeMapTab === MAP_TABS.allhazard));

  const criticalInfraEnabled = Boolean(layers.criticalInfrastructure && criticalInfraEntitled);
  const {
    transmissionGeoJSON: criticalInfrastructureTransGeoJSON,
    gasPipelinesGeoJSON: criticalInfrastructureGasGeoJSON,
    refresh: refreshCriticalInfrastructure,
  } = useCriticalInfrastructure(criticalInfraEnabled, viewport);

  const schoolsLayerEnabled = Boolean(
    layers.schoolsUniversities
    && (activeMapTab === MAP_TABS.wildfire || activeMapTab === MAP_TABS.weather || activeMapTab === MAP_TABS.allhazard)
  );
  const {
    geoJSON: nationalMapCollegesGeoJSON,
    refresh: refreshNationalMapColleges,
  } = useNationalMapColleges(schoolsLayerEnabled, viewport);

  // Land ownership – Pro-only, and only fetched once zoomed in close (see
  // isWithinLandOwnershipRange)
  const landOwnershipEnabled = Boolean(
    layers.landOwnership && criticalInfraEntitled && isWithinLandOwnershipRange(viewport)
  );
  const {
    geoJSON: landOwnershipGeoJSON,
    refresh: refreshLandOwnership,
  } = useCaliforniaLandOwnership(landOwnershipEnabled, viewport);

  // FEMA flood hazard zones – viewport-driven, through cloud/fema-nfhl-proxy.
  // Weather and all-hazard tabs only; not plan-gated.
  const floodHazardEnabled = Boolean(
    layers.floodHazard
    && (activeMapTab === MAP_TABS.weather || activeMapTab === MAP_TABS.allhazard)
  );
  const {
    data: floodHazardData,
    refresh: refreshFloodHazards,
  } = useFloodHazards(floodHazardEnabled, viewport);

  // SPC Fire Weather Outlooks – day/type selector state
  const [fireWxOutlookType, setFireWxOutlookType] = useState('winds_low_humidity');
  const [fireWxActiveDay,   setFireWxActiveDay]   = useState('day1');

  const {
    geoJSON:   fireWeatherOutlooksGeoJSON,
    refresh:   refreshFireWeatherOutlooks,
  } = useFireWeatherOutlooks(
    layers.fireWeatherOutlooks,
    fireWxActiveDay,
    fireWxOutlookType
  );

  // WPC outlooks — each independently toggleable, Day 1-3 selected in the layer panel
  const {
    geoJSON: wpcEroGeoJSON,
    refresh: refreshWpcEro,
  } = useWpcEro(weatherDataEnabled && layers.wpcEro, wpcOutlookDay.ero);

  const {
    geoJSON: wpcWssiGeoJSON,
    refresh: refreshWpcWssi,
  } = useWpcWssi(weatherDataEnabled && layers.wpcWssi, wpcOutlookDay.wssi);

  const {
    geoJSON: wpcQpfGeoJSON,
    refresh: refreshWpcQpf,
  } = useWpcQpf(weatherDataEnabled && layers.wpcQpf, wpcOutlookDay.qpf);

  const {
    geoJSON: wpcFrontsGeoJSON,
    centers: wpcPressureCentersGeoJSON,
    refresh: refreshWpcFronts,
  } = useWpcFronts(weatherDataEnabled && layers.wpcFronts, wpcOutlookDay.fronts);

  const {
    geoJSON: wpcMpdGeoJSON,
    refresh: refreshWpcMpd,
  } = useWpcMesoscaleDiscussion(weatherDataEnabled && layers.weatherAlerts);

  // Fetches on the weather and all-hazard tabs while any Tropical (NHC)
  // switch is on — the sidebar's Tropical feed reads the same data. The Models
  // tab never draws tropical graphics.
  // The wind/surge layers need the active storm slots, so they count too.
  const nhcAnyLayerOn = Boolean(layers.nhcTropical && (layers.nhcCone || layers.nhcTrack || layers.nhcWatchWarning
    || layers.nhcOutlook || layers.nhcWindProb || layers.nhcWindRadii || layers.nhcArrival || layers.nhcSurge));
  const nhcTropicalWeatherEnabled = nhcAnyLayerOn && weatherDataEnabled;
  const {
    cyclones: nhcCyclones,
    invests: nhcInvests,
    loading: nhcLoading,
    forecastPointsGeoJSON: nhcForecastPointsGeoJSON,
    forecastTrackGeoJSON: nhcForecastTrackGeoJSON,
    coneGeoJSON: nhcConeGeoJSON,
    watchWarningGeoJSON: nhcWatchWarningGeoJSON,
    pastPointsGeoJSON: nhcPastPointsGeoJSON,
    pastTrackGeoJSON: nhcPastTrackGeoJSON,
    disturbancePointsGeoJSON: nhcDisturbancePointsGeoJSON,
    disturbanceAreasGeoJSON: nhcDisturbanceAreasGeoJSON,
    stormLabelsGeoJSON: nhcStormLabelsGeoJSON,
    refresh: refreshNhcTropicalWeather,
  } = useNhcTropicalWeather(nhcTropicalWeatherEnabled);

  const nhcSlots = useMemo(() => nhcCyclones.map((c) => c.slot), [nhcCyclones]);
  const nhcWindHazards = useNhcWindHazards({
    enabled: nhcTropicalWeatherEnabled,
    slots: nhcSlots,
    probKt: layers.nhcTropical && layers.nhcWindProb ? nhcWindProbKt : null,
    radii: Boolean(layers.nhcTropical && layers.nhcWindRadii),
    arrival: Boolean(layers.nhcTropical && layers.nhcArrival),
    surge: Boolean(layers.nhcTropical && layers.nhcSurge),
  });
  // What the hurricane detail panel reads (FireDetailPanel → HurricaneSidebar).
  const nhcPanelData = useMemo(() => ({
    cyclones: nhcCyclones,
    forecastPointsGeoJSON: nhcForecastPointsGeoJSON,
    pastPointsGeoJSON: nhcPastPointsGeoJSON,
    watchWarningGeoJSON: nhcWatchWarningGeoJSON,
    windHazards: nhcWindHazards,
  }), [nhcCyclones, nhcForecastPointsGeoJSON, nhcPastPointsGeoJSON, nhcWatchWarningGeoJSON, nhcWindHazards]);

  // NOAA NWPS water gauges
  const {
    geoJSON: waterGaugesGeoJSON,
  } = useWaterGauges(layers.waterGauges);

  // Live California highway cameras — Caltrans District CCTV
  const {
    geoJSON: californiaCamerasGeoJSON,
  } = useCaliforniaCameras(layers.wildfireCameras);

  // Community-submitted reports – only approved ones, realtime-subscribed.
  // Tertiary tier: a supplemental overlay, not needed for first paint.
  const { reports: approvedReports, refresh: refreshUserReports } = useFireReports('approved', tertiaryReady);
  const reporterReports = useMemo(() => {
    const tabReports =
      activeMapTab === MAP_TABS.wildfire || activeMapTab === MAP_TABS.allhazard ? approvedReports : [];
    // Multiple approved reports can be filed for the same fire (e.g. repeat
    // submissions). Collapse them to one marker per fire-name key, keeping
    // the most recent report, so the map doesn't show duplicate dots with
    // the same label.
    const byKey = new Map();
    const unkeyed = [];
    for (const report of tabReports) {
      const key = getFireMatchKey(report.title);
      if (!key) {
        unkeyed.push(report);
        continue;
      }
      const existing = byKey.get(key);
      if (!existing || new Date(report.created_at) > new Date(existing.created_at)) {
        byKey.set(key, report);
      }
    }
    return [...byKey.values(), ...unkeyed];
  }, [activeMapTab, approvedReports]);
  // Community-submitted hazard events – wildfire, hazmat, hazard, flooding.
  // Tertiary tier: a supplemental overlay, not needed for first paint.
  const { events: activeHazardEvents } = useHazardEvents('active', tertiaryReady);
  const hazardEventsGeoJSON = useMemo(
    () => hazardEventsToGeoJSON(activeHazardEvents),
    [activeHazardEvents]
  );

  // ── Remove stale fully-contained fires (100% contained, no update in 3+ days) ──
  // (mergedIncidentsGeoJSON is already limited to incidents updated within the
  // last 30 days via freshIncidentsList — see above.)
  const freshIncidentsGeoJSON = useMemo(
    () => filterStaleContainedGeoJSON(mergedIncidentsGeoJSON, 'contained', 'updated'),
    [mergedIncidentsGeoJSON]
  );

  // Perimeters: drop 100%-contained fires stale for 3+ days. Any remaining
  // perimeter that hasn't been updated in 30+ days is kept but tagged
  // isStaleFire so FirePerimetersLayer renders it grey with no centroid dot.
  const freshPerimetersGeoJSON = useMemo(() => {
    const containedFiltered = filterStaleContainedGeoJSON(perimetersGeoJSON, 'PercentContained', 'ModifiedOnDateTime');
    return tagStaleFire(containedFiltered, 'ModifiedOnDateTime', ONE_MONTH_MS);
  }, [perimetersGeoJSON]);

  // Link community reports to the perimeter of the fire they describe: a
  // nameless perimeter ("Unknown Fire"/"Unnamed") borrows the name of a
  // report inside its polygon; a named one claims a same-named report near
  // it. The report id joins the perimeter's aliases (so evacuations/updates
  // a reporter entered on the report show in its panel) and `_reportId`
  // lets the map drop the report's own dot in favour of the perimeter's.
  const namedPerimetersGeoJSON = useMemo(() => {
    if (!freshPerimetersGeoJSON?.features?.length || !reporterReports.length)
      return freshPerimetersGeoJSON;
    return {
      ...freshPerimetersGeoJSON,
      features: freshPerimetersGeoJSON.features.map(f => {
        const key = getFireMatchKey(f.properties.IncidentName);
        const match = reporterReports.find(r => {
          const lng = Number(r.longitude);
          const lat = Number(r.latitude);
          if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
          if (!key) return pointInGeometry([lng, lat], f.geometry);
          return getFireMatchKey(r.title) === key
            && pointNearGeometry([lng, lat], f.geometry, REPORT_PERIMETER_BUFFER_DEG);
        });
        if (!match) return f;
        // Reporter-supplied size/containment wins over the feed, as it does
        // for the incident dot (see mergedIncidents below).
        const reportAcres = parseLatestAcreage(match.description);
        const reportContained = parseLatestContainment(match.description);
        return {
          ...f,
          properties: {
            ...f.properties,
            IncidentName: key ? f.properties.IncidentName : match.title,
            _aliasIds: joinAliasIds(
              f.properties.UniqueFireIdentifier, f.properties._aliasIds,
              reportIdsForName(match.title, approvedReports), match.id,
            ),
            _reportId: match.id,
            ...(reportAcres != null ? { GISAcres: reportAcres } : null),
            ...(reportContained != null ? { PercentContained: reportContained } : null),
          },
        };
      }),
    };
  }, [freshPerimetersGeoJSON, reporterReports, approvedReports]);

  // Incident dots: drop 100%-contained fires stale for 3+ days, and unconditionally
  // drop any dot that hasn't been updated in 30 days.
  const freshIncidentDotsGeoJSON = useMemo(() => {
    const containedFiltered = filterStaleContainedGeoJSON(incidentDotsGeoJSON, 'PercentContained', 'ModifiedOnDateTime');
    return filterByMaxAge(containedFiltered, 'ModifiedOnDateTime', ONE_MONTH_MS);
  }, [incidentDotsGeoJSON]);

  // ── Apply feed filter to map fire layers ──
  const isFocused = feedFilter === 'focused';

  const filteredIncidentsGeoJSON = useMemo(() => {
    if (!isFocused) return freshIncidentsGeoJSON;
    return filterActiveFiresGeoJSON(freshIncidentsGeoJSON, { containedKey: 'contained' });
  }, [isFocused, freshIncidentsGeoJSON]);

  const filteredPerimetersGeoJSON = useMemo(() => (
    isFocused
      ? filterActiveFiresGeoJSON(namedPerimetersGeoJSON, { containedKey: 'PercentContained' })
      : namedPerimetersGeoJSON
  ), [isFocused, namedPerimetersGeoJSON]);

  // ── Perimeter-only incidents for sidebar ──
  // Some fires have perimeter polygons (NIFC/WFIGS) but no matching
  // IRWIN incident point. Build incident objects from those perimeters so they
  // still appear in the sidebar feed.
  const perimeterOnlyIncidents = useMemo(() => {
    if (!filteredPerimetersGeoJSON?.features?.length) return [];
    const listedIds = new Set(freshIncidentsList.flatMap(i => [String(i.id), ...parseAliasIds(i.aliasIds)]));
    const listedPointsByKey = placesByFireKey(freshIncidentsList, i => i.name, i => [i.lng, i.lat]);
    return filteredPerimetersGeoJSON.features
      .filter(f => {
        const p = f.properties;
        // The perimeters are the whole year's: one declared controlled or out,
        // a prescribed burn, or an older capture of a mapped fire isn't a
        // current wildfire (fetchIncidents asks IRWIN for uncontrolled WF only).
        if (p.ControlDateTime || p.FireOutDateTime || p.IncidentTypeCategory === 'RX' || p.isHistoricalMapping) return false;
        const key = getFireMatchKey(p.IncidentName);
        if (!key) return false;
        // Already listed: the same id, or a fire of the same name close by.
        if ([String(p.UniqueFireIdentifier), ...parseAliasIds(p._aliasIds)].some(id => listedIds.has(id))) return false;
        return !(listedPointsByKey.get(key) || []).some(point => pointNearPerimeter(point, f.geometry));
      })
      .map(f => {
        const p = f.properties;
        // Declared contained is 100%, whatever the (usually blank) percentage says.
        const contained = p.ContainmentDateTime ? 100 : Number(p.PercentContained) || 0;
        const centroid = polygonCentroid(f.geometry);
        return {
          id: p.UniqueFireIdentifier || `perimeter-${p.IncidentName}`,
          name: p.IncidentName,
          displayLabel: p.DisplayLabel || null,
          state: p.POOState || '',
          county: p.POOCounty || '',
          lat: centroid ? centroid[1] : 0,
          lng: centroid ? centroid[0] : 0,
          acres: Math.round(p.GISAcres) || 0,
          contained,
          started: p.FireDiscoveryDateTime || null,
          updated: p.ModifiedOnDateTime || null,
          cause: p.FireCause || 'Under Investigation',
          status: contained >= 100 ? 'controlled' : 'active',
          personnel: p.TotalIncidentPersonnel || 0,
          structures_destroyed: p.StructuresDestroyed || 0,
          structures_damaged: p.StructuresDamaged || 0,
          structures_threatened: 0,
          source: p.Source || 'NIFC_WFIGS',
        };
      });
  }, [filteredPerimetersGeoJSON, freshIncidentsList]);

  const filteredIncidentDotsGeoJSON = useMemo(() => {
    if (!isFocused) return freshIncidentDotsGeoJSON;
    return filterActiveFiresGeoJSON(freshIncidentDotsGeoJSON, { containedKey: 'PercentContained' });
  }, [isFocused, freshIncidentDotsGeoJSON]);

  // Fires whose perimeter draws a centered centroid dot already have their
  // dot. Index those perimeters by name so we can hide off-center IRWIN dots
  // of the same fire (same name, close by).
  // Only perimeters that actually draw one count (drawsCentroidDot): a grey
  // stale/historical perimeter has no dot, so its incident dot must stay.
  const perimeterDotsByKey = useMemo(() => placesByFireKey(
    (filteredPerimetersGeoJSON?.features || []).filter(f => drawsCentroidDot(f.properties)),
    f => f.properties.IncidentName,
    f => f.geometry,
  ), [filteredPerimetersGeoJSON]);

  // ── Combine IRWIN incidents with perimeter-only fires for sidebar ──
  // Perimeter-only fires have no IRWIN record; add them so they appear in the feed.
  const allIncidents = useMemo(
    () => [...freshIncidentsList, ...perimeterOnlyIncidents],
    [freshIncidentsList, perimeterOnlyIncidents]
  );

  // ── Reporter incidents replace matching external data incidents ──
  // When an approved reporter report shares a fire name with an IRWIN incident
  // close by, the external incident is replaced in the sidebar feed with a merged record
  // that keeps authoritative external stats but surfaces reporter-contributed data.
  const mergedIncidents = useMemo(() => {
    if (!reporterReports.length) return allIncidents;

    // Index reporter reports by normalised fire name key (same algorithm used
    // in useMergedFireData to match perimeters to incident dots).
    const reporterByKey = new Map();
    reporterReports.forEach(r => {
      const key = getFireMatchKey(r.title);
      if (key) reporterByKey.set(key, [...(reporterByKey.get(key) || []), r]);
    });

    return allIncidents.map(inc => {
      const key = getFireMatchKey(inc.name);
      const report = key
        ? [...(reporterByKey.get(key) || [])].reverse()
          .find(r => pointsNearSameFire([Number(r.longitude), Number(r.latitude)], [inc.lng, inc.lat]))
        : null;
      if (!report) return inc;

      // A reporter's latest acreage / containment (from their Post Update
      // entries) overrides the external value, so reporters can keep a fire
      // current after CAL FIRE or IRWIN takes it over.
      const reportAcres = parseLatestAcreage(report.description);
      const reportContained = parseLatestContainment(report.description);

      return {
        ...inc,
        // Use reporter coordinates when available – reporter location is often
        // more precise than the IRWIN centroid.
        lat: Number(report.latitude) || inc.lat,
        lng: Number(report.longitude) || inc.lng,
        // Reporter-provided acreage overrides the external value when present.
        acres: reportAcres ?? inc.acres,
        contained: reportContained ?? inc.contained,
        // Attach reporter metadata so downstream components can reference it.
        hasReporterData: true,
        reportId: report.id,
        // Evacuations/updates a reporter entered on their own report (or a
        // repeat report of the same fire) belong to this fire too.
        aliasIds: parseAliasIds([...(inc.aliasIds || []), report.id, ...reportIdsForName(report.title, approvedReports)]),
        reportDescription: report.description,
        reportedAt: report.created_at,
      };
    });
  }, [allIncidents, reporterReports, approvedReports]);

  // One dot per fire: a report already represented by a perimeter's centroid
  // dot (see namedPerimetersGeoJSON) isn't drawn again. Perimeters without a
  // centroid dot (historical, stale or fully contained) don't claim it.
  // The reporter's dot replaces the official one once CAL FIRE / IRWIN lists
  // the fire, so it carries that incident's ids (evacuations, shelters and
  // updates saved there) and its feed evacuation fields.
  const userReportsGeoJSON = useMemo(() => {
    const coveredReportIds = new Set();
    (filteredPerimetersGeoJSON?.features || []).forEach(f => {
      const p = f.properties;
      if (p._reportId && !p.isHistoricalMapping && !p.isStaleFire && !p.HideFromCentroid
        && (Number(p.PercentContained) || 0) < 100) {
        coveredReportIds.add(p._reportId);
      }
    });
    return reportsToGeoJSON(reporterReports
      .filter(r => !coveredReportIds.has(r.id))
      .map(r => linkReportToOfficial(r, allIncidents, approvedReports)));
  }, [reporterReports, filteredPerimetersGeoJSON, allIncidents, approvedReports]);

  // ── Shared incident/alert deep link ──
  // FireDetailPanel's Share button writes ?incident=<id> (fires, perimeters,
  // hotspots, user reports) or ?alert=<id> (weather alerts) into the URL —
  // but nothing previously read that param back out on load, so opening a
  // shared link never selected/flew to anything. Search every collection a
  // share link can point into, in the order a user would naturally encounter
  // them: IRWIN/reporter-merged incidents (covers most fires, including
  // perimeter-backed ones, since they share the same UniqueFireIdentifier),
  // then raw hotspot detections, then raw perimeters, then approved user
  // reports, then active hazard event reports. Retries as data loads in (these collections start empty and
  // fill in asynchronously); gives up after a fixed timeout so a bad/expired
  // id doesn't retry forever.
  const sharedLinkResolvedRef = useRef(false);
  useEffect(() => {
    if (sharedLinkResolvedRef.current) return;
    if (!mapReady) return;

    const params = new URLSearchParams(window.location.search);
    const alertId = params.get('alert');
    const incidentId = params.get('incident');
    if (!alertId && !incidentId) {
      sharedLinkResolvedRef.current = true;
      return;
    }

    if (alertId) {
      const alert = alerts.find((a) => String(a.id) === alertId);
      if (!alert) return; // alerts may not have loaded yet — retry when they do
      selectFire({ ...alert, type: 'weather-alert', eventType: alert.type });
      const centroid = polygonCentroid(alert.geometry);
      if (centroid) setViewport({ longitude: centroid[0], latitude: centroid[1], zoom: 7 });
      sharedLinkResolvedRef.current = true;
      return;
    }

    // Links may carry any id the fire is known by (e.g. an email sent before
    // CAL FIRE picked the fire up and replaced the IRWIN record).
    const incidentMatch = mergedIncidents.find((inc) => incidentIdsFor(inc).includes(incidentId));
    if (incidentMatch) {
      selectFire({ type: 'incident', ...incidentMatch });
      flyToFire(incidentMatch);
      sharedLinkResolvedRef.current = true;
      return;
    }

    const hotspotFeature = hotspotsGeoJSON?.features?.find((f) => String(f.properties?.id) === incidentId);
    if (hotspotFeature) {
      const p = hotspotFeature.properties;
      const record = {
        type: 'hotspot',
        id: p.id,
        lat: Number(p.latitude),
        lng: Number(p.longitude),
        frp: Number(p.frp),
        total_frp: Number(p.total_frp) || Number(p.frp),
        brightness: Number(p.brightness),
        confidence: p.confidence,
        satellite: p.satellite,
        source: p.source,
        acq_date: p.acq_date,
        acq_time: p.acq_time,
        detection_count: Number(p.detection_count) || 1,
      };
      selectFire(record);
      flyToFire(record);
      sharedLinkResolvedRef.current = true;
      return;
    }

    const perimeterFeature = namedPerimetersGeoJSON?.features?.find(
      (f) => String(f.properties?.UniqueFireIdentifier) === incidentId
        || parseAliasIds(f.properties?._aliasIds).includes(incidentId)
    );
    if (perimeterFeature) {
      const p = perimeterFeature.properties;
      const centroid = polygonCentroid(perimeterFeature.geometry);
      const record = {
        type: 'perimeter',
        id: p.UniqueFireIdentifier,
        name: p.IncidentName,
        lat: centroid ? centroid[1] : 0,
        lng: centroid ? centroid[0] : 0,
        acres: Number(p.GISAcres),
        contained: Number(p.PercentContained),
        state: p.POOState,
        county: p.POOCounty,
        personnel: Number(p.TotalIncidentPersonnel),
        destroyed: Number(p.StructuresDestroyed),
        damaged: Number(p.StructuresDamaged),
        discovered: p.FireDiscoveryDateTime,
        updated: p.ModifiedOnDateTime,
        orgType: p.IncidentManagementOrganization,
        cause: p.FireCause || null,
        source: p._source || p.Source || null,
        historical: Boolean(p.isHistoricalMapping),
        aliasIds: parseAliasIds(p._aliasIds),
      };
      selectFire(record);
      flyToFire(record);
      sharedLinkResolvedRef.current = true;
      return;
    }

    const reportMatch = approvedReports.find((r) => String(r.id) === incidentId);
    if (reportMatch) {
      selectFire({ type: 'user-report', ...linkReportToOfficial(reportMatch, allIncidents, approvedReports) });
      flyToFire(reportMatch);
      sharedLinkResolvedRef.current = true;
      return;
    }

    const hazardMatch = activeHazardEvents.find((e) => String(e.id) === incidentId);
    if (hazardMatch) {
      const record = {
        ...hazardMatch,
        type: 'hazard-event',
        name: hazardMatch.title,
        category: normalizeHazardCategory(hazardMatch.category),
        lat: Number(hazardMatch.latitude),
        lng: Number(hazardMatch.longitude),
      };
      selectFire(record);
      flyToFire(record);
      sharedLinkResolvedRef.current = true;
      return;
    }

    const stormMatch = nhcCyclones.find((c) => c.id === incidentId);
    if (stormMatch) {
      selectFire({ ...stormMatch, type: 'nhc-storm' });
      setViewport({ longitude: stormMatch.lng, latitude: stormMatch.lat, zoom: 6 });
      sharedLinkResolvedRef.current = true;
    }
    // Not found in anything loaded so far — leave unresolved and retry as
    // more data comes in, until the give-up timeout below fires.
  }, [
    mapReady, alerts, mergedIncidents, allIncidents, hotspotsGeoJSON, namedPerimetersGeoJSON, approvedReports,
    activeHazardEvents, nhcCyclones, selectFire, flyToFire, setViewport,
  ]);

  useEffect(() => {
    if (sharedLinkResolvedRef.current) return undefined;
    const timeoutId = window.setTimeout(() => {
      sharedLinkResolvedRef.current = true;
    }, 15000);
    return () => window.clearTimeout(timeoutId);
  }, []);

  // Index reporter reports by fire name once for GeoJSON filtering.
  const reporterPointsByKey = useMemo(() => placesByFireKey(
    reporterReports, r => r.title, r => [Number(r.longitude), Number(r.latitude)],
  ), [reporterReports]);

  // Deduplicate IRWIN incident markers (same name, close by):
  //  - Reporter match → suppress (reporter dot takes over)
  //  - NIFC perimeter match → suppress (enriched perimeter centroid shows instead)
  const deduplicatedIncidentsGeoJSON = useMemo(() => {
    if (!filteredIncidentsGeoJSON?.features)
      return filteredIncidentsGeoJSON;
    return {
      ...filteredIncidentsGeoJSON,
      features: filteredIncidentsGeoJSON.features
        .map(f => {
          const key = getFireMatchKey(f.properties.name);
          if (!key) return f;
          const point = f.geometry?.coordinates;
          if ((reporterPointsByKey.get(key) || []).some(p => pointsNearSameFire(p, point))) return null;
          if ((perimeterDotsByKey.get(key) || []).some(g => pointNearPerimeter(point, g))) return null;
          return f;
        })
        .filter(Boolean),
    };
  }, [filteredIncidentsGeoJSON, reporterPointsByKey, perimeterDotsByKey]);

  // Same deduplication for incident dot markers (fires without NIFC perimeters).
  const deduplicatedIncidentDotsGeoJSON = useMemo(() => {
    if (!reporterPointsByKey.size || !filteredIncidentDotsGeoJSON?.features)
      return filteredIncidentDotsGeoJSON;
    return {
      ...filteredIncidentDotsGeoJSON,
      features: filteredIncidentDotsGeoJSON.features.filter(f => {
        const key = getFireMatchKey(f.properties.IncidentName);
        const point = f.geometry?.coordinates;
        return !key || !(reporterPointsByKey.get(key) || []).some(p => pointsNearSameFire(p, point));
      }),
    };
  }, [filteredIncidentDotsGeoJSON, reporterPointsByKey]);

  // ── Cross-deduplicate FireIncidentsLayer dots against IncidentLocationsLayer ──
  // Both layers source data from IRWIN, so the same fire can appear as two
  // overlapping dots.  Keep only the IncidentLocationsLayer marker (richer
  // styling: containment-based color, acreage-based sizing) and suppress the
  // FireIncidentsLayer duplicate.
  //   - Fire with a perimeter + two dots → hides the non-centered duplicate,
  //     keeps only the perimeter-centered centroid indicator.
  //   - Fire without a perimeter + two dots → collapses to a single dot with
  //     one consistent color from IncidentLocationsLayer.
  const finalIncidentDotsGeoJSON = useMemo(() => {
    if (!deduplicatedIncidentDotsGeoJSON?.features?.length)
      return deduplicatedIncidentDotsGeoJSON;
    if (!deduplicatedIncidentsGeoJSON?.features?.length)
      return deduplicatedIncidentDotsGeoJSON;

    // Build lookups from IncidentLocationsLayer features
    const locationPointsByKey = placesByFireKey(
      deduplicatedIncidentsGeoJSON.features, f => f.properties.name, f => f.geometry?.coordinates,
    );
    const locationIds = new Set();
    deduplicatedIncidentsGeoJSON.features.forEach(f => {
      if (f.properties.id) locationIds.add(f.properties.id);
    });

    // Also check perimeters so any FireIncidentsLayer dot that slipped
    // through matching in useMergedFireData is still caught.
    const perimetersByKey = placesByFireKey(
      filteredPerimetersGeoJSON?.features || [], f => f.properties.IncidentName, f => f.geometry,
    );

    return {
      ...deduplicatedIncidentDotsGeoJSON,
      features: deduplicatedIncidentDotsGeoJSON.features.filter(f => {
        const nameKey = getFireMatchKey(f.properties.IncidentName);
        const id = f.properties.UniqueFireIdentifier;
        const point = f.geometry?.coordinates;
        if (nameKey && (locationPointsByKey.get(nameKey) || []).some(p => pointsNearSameFire(p, point))) return false;
        if (nameKey && (perimetersByKey.get(nameKey) || []).some(g => pointNearPerimeter(point, g))) return false;
        if (id && locationIds.has(id)) return false;
        return true;
      }),
    };
  }, [deduplicatedIncidentDotsGeoJSON, deduplicatedIncidentsGeoJSON, filteredPerimetersGeoJSON]);

  // Fire behavior spread-projection rings (Rothermel engine) for whichever
  // fire dot or perimeter the user currently has selected. Perimeters and
  // dot-only incidents are merged into one combined layer here so the
  // modeling hook has a single unified fire-features source to look
  // selectedFireId up in, instead of branching across two separate GeoJSON
  // props — which fire it is (perimeter vs. dot) is then just a matter of
  // that feature's own geometry type, not which list it came from.
  //
  // deduplicatedIncidentsGeoJSON (IncidentLocationsLayer's markers — the
  // dot-only fires with no NIFC perimeter or reporter duplicate, which is
  // most fires most users click) uses its own property names (id/name/acres/
  // contained) instead of the WFIGS ones, so it's normalized to the
  // UniqueFireIdentifier/IncidentName/GISAcres/PercentContained shape the
  // modeling hook expects before merging in. No overlap with the other two
  // lists: perimeter- and reporter-matched incidents are already excluded
  // from deduplicatedIncidentsGeoJSON, and finalIncidentDotsGeoJSON already
  // excludes anything that appears in deduplicatedIncidentsGeoJSON.
  const normalizedIncidentLocations = useMemo(() => (
    (deduplicatedIncidentsGeoJSON?.features || []).map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        UniqueFireIdentifier: f.properties?.id,
        IncidentName: f.properties?.name,
        GISAcres: f.properties?.acres,
        PercentContained: f.properties?.contained,
      },
    }))
  ), [deduplicatedIncidentsGeoJSON]);

  const fireFeaturesForModeling = useMemo(() => ({
    type: 'FeatureCollection',
    features: [
      ...(filteredPerimetersGeoJSON?.features || []),
      ...(finalIncidentDotsGeoJSON?.features || []),
      ...normalizedIncidentLocations,
    ],
  }), [filteredPerimetersGeoJSON, finalIncidentDotsGeoJSON, normalizedIncidentLocations]);

  const selectedFireId = ['incident', 'perimeter'].includes(selectedFire?.type) ? selectedFire.id : null;
  const { geoJSON: fireBehaviorModelingGeoJSON } = useFireBehaviorModeling(
    layers.fireBehaviorModeling && hasFireBehaviorModelingAccess,
    fireFeaturesForModeling,
    selectedFireId
  );

  // ── Near-me mode ("Go to My Current Location" + completed Home Setup) ──
  // The Home Setup radius, centered on the user's live GPS position, becomes
  // the only geographic boundary for the incident feed/markers and NWS
  // alerts, and is checked against the current SPC/WPC outlooks. The center
  // is rounded to ~100 m so every small GPS jitter doesn't re-filter (and
  // re-upload to the map) thousands of features.
  const nearbyLat = nearbyActive && userLocation ? Math.round(userLocation.latitude * 1000) / 1000 : null;
  const nearbyLng = nearbyActive && userLocation ? Math.round(userLocation.longitude * 1000) / 1000 : null;
  const nearbyRadius = nearbyLat != null ? home.radiusMiles : null;
  const nearbyOn = nearbyRadius != null;
  const nearbyOutlooks = useNearbyOutlooks(nearbyOn);

  const nearbyResult = useMemo(() => {
    if (!nearbyOn) return null;
    return filterByRadius({
      userLatitude: nearbyLat,
      userLongitude: nearbyLng,
      selectedRadius: nearbyRadius,
      incidents: mergedIncidents,
      nwsAlerts: alerts,
      spcOutlooks: nearbyOutlooks.spcOutlooks,
      wpcOutlooks: nearbyOutlooks.wpcOutlooks,
    });
  }, [nearbyOn, nearbyLat, nearbyLng, nearbyRadius, mergedIncidents, alerts,
    nearbyOutlooks.spcOutlooks, nearbyOutlooks.wpcOutlooks]);

  const sidebarNearbyOutlooks = useMemo(() => ({
    spcOutlooks: nearbyResult?.spcOutlooks ?? [],
    wpcOutlooks: nearbyResult?.wpcOutlooks ?? [],
    loading: nearbyOutlooks.loading,
  }), [nearbyResult, nearbyOutlooks.loading]);

  const nearbyMapGeoJSON = useMemo(() => {
    const clip = (fc) => (nearbyOn ? filterFeatureCollectionByRadius(fc, nearbyLat, nearbyLng, nearbyRadius) : fc);
    return {
      perimeters: clip(filteredPerimetersGeoJSON),
      incidents: clip(deduplicatedIncidentsGeoJSON),
      incidentDots: clip(finalIncidentDotsGeoJSON),
      alerts: clip(filteredAlertsGeoJSON),
      radius: nearbyOn
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: circlePolygon(nearbyLat, nearbyLng, nearbyRadius) }] }
        : null,
    };
  }, [nearbyOn, nearbyLat, nearbyLng, nearbyRadius, filteredPerimetersGeoJSON,
    deduplicatedIncidentsGeoJSON, finalIncidentDotsGeoJSON, filteredAlertsGeoJSON]);

  // ── Navigation / Route to Safety (All Hazards, Pro) ──
  const routeToSafety = useRouteToSafety({
    enabled: routeToSafetyActive,
    home,
    perimetersGeoJSON: nearbyMapGeoJSON.perimeters,
    evacZonesGeoJSON,
    hotspotsGeoJSON,
  });
  const closeRouteToSafety = useCallback(() => setLayer('routeToSafety', false), [setLayer]);
  // Same validity rule the hook uses before routing from Home.
  const hasValidHome = Boolean(home) && Number.isFinite(home.latitude) && Number.isFinite(home.longitude);
  const routeOverlay = useMemo(() => (routeToSafetyActive ? (
    <RouteLayer
      route={routeToSafety.route}
      origin={routeToSafety.origin}
      destination={routeToSafety.destination}
      shelters={routeToSafety.status === 'ready' ? routeToSafety.shelters : []}
      hazardWarning={routeToSafety.hazardWarning}
    />
  ) : null), [routeToSafetyActive, routeToSafety.route, routeToSafety.origin, routeToSafety.destination, routeToSafety.status, routeToSafety.shelters, routeToSafety.hazardWarning]);

  // Frame a newly arrived route once (not on every data refresh). The map
  // instance comes from handleMapLoad; reduced motion jumps instead of flying.
  const routeBoundsKeyRef = useRef(null);
  useEffect(() => {
    const coords = routeToSafety.route?.features?.[0]?.geometry?.coordinates;
    if (!coords?.length) {
      routeBoundsKeyRef.current = null;
      return;
    }
    if (!mapInstance || typeof mapInstance.fitBounds !== 'function') return;
    const key = `${coords[0]}|${coords[coords.length - 1]}|${coords.length}`;
    if (routeBoundsKeyRef.current === key) return;
    routeBoundsKeyRef.current = key;
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // Keep the route clear of the panel on the right (360px + 16px gutters).
    const padding = window.innerWidth < 640
      ? 40
      : { top: 80, bottom: 80, left: 80, right: Math.min(window.innerWidth * 0.5, 392) };
    mapInstance.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding, duration: reduceMotion ? 0 : 600 },
    );
  }, [routeToSafety.route, mapInstance]);

  // ── Global loading state ──
  // Weather alerts count too: they're the live feed on the Weather tab, where
  // the wildfire feeds are switched off, so without them "Updated …" would
  // stop moving there.
  const anyLoading = hotspotsLoading || ngfsLoading || perimetersLoading || incidentsLoading || calFireLoading || alertsLoading;
  useEffect(() => { setLoading(anyLoading); }, [anyLoading, setLoading]);
  useEffect(() => {
    if (!anyLoading) setRefreshed(new Date());
  }, [anyLoading, setRefreshed]);

  // ── Post-login Overview ──
  // LoginPage sends { overview: true } in router state when it lands here.
  // The flag is cleared from history right away so a reload or Back doesn't
  // bring the Overview up again.
  const location = useLocation();
  const navigate = useNavigate();
  const [overviewOpen, setOverviewOpen] = useState(() => Boolean(location.state?.overview));
  useEffect(() => {
    if (location.state?.overview) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
  }, [location.state, location.pathname, location.search, navigate]);
  const closeOverview = useCallback(() => setOverviewOpen(false), []);

  const overviewSummary = useMemo(() => (overviewOpen ? summarizeOverview({
    incidents: mergedIncidents,
    alerts,
    evacZones: evacZonesGeoJSON,
    home: isHomeSetupComplete ? home : null,
  }) : null), [overviewOpen, mergedIncidents, alerts, evacZonesGeoJSON, isHomeSetupComplete, home]);
  // Only the first load shows as loading; later polls update the numbers in place.
  const overviewLoading = !mapReady || ((incidentsLoading || calFireLoading) && !mergedIncidents.length);

  const handleQuickFilter = useCallback((key) => {
    if (key === QUICK_FILTERS.activeFires || key === QUICK_FILTERS.allFires) {
      handleTabChange(MAP_TABS.wildfire);
      setFeedFilter(key === QUICK_FILTERS.activeFires ? 'focused' : 'all');
      // Simplified Sentinel has no hazard sidebar; the map still filters.
      if (!simplified) openSidebar();
    } else if (key === QUICK_FILTERS.allHazards) {
      handleTabChange(MAP_TABS.allhazard);
    } else if (key === QUICK_FILTERS.myArea && isHomeSetupComplete) {
      setViewport({ latitude: home.latitude, longitude: home.longitude, zoom: zoomForRadius(home.latitude, home.radiusMiles) });
    }
    closeOverview();
  }, [handleTabChange, setFeedFilter, openSidebar, simplified, isHomeSetupComplete, home, setViewport, closeOverview]);

  const handleOverviewSetUpHome = useCallback(() => {
    closeOverview();
    openHomeSetup();
  }, [closeOverview, openHomeSetup]);

  // ── Manual refresh ──
  const handleRefresh = useCallback(() => {
    refreshHotspots();
    refreshNgfs();
    refreshPerimeters();
    refreshAlerts();
    refreshIncidents();
    refreshCalFireIncidents();
    if (weatherDataEnabled && layers.stormReports) {
      refreshStormReports();
    }
    if (damageAssessmentEnabled) {
      refreshDamageAssessment();
    }
    refreshSpcOutlooks();
    refreshSpcMd();
    refreshUserReports();
    refreshEvacZones();
    refreshReporterEvacZones();
    if (layers.aqi) refreshAQI();
    if (rawsEnabled) refreshRAWS();
    if (layers.airNowMonitors) refreshAirNowMonitors();
    if (layers.droughtOutlook) refreshDroughtOutlook();
    if (layers.ndgdSmokeForecast && (activeMapTab === MAP_TABS.wildfire || activeMapTab === MAP_TABS.allhazard)) refreshNdgdSmokeForecast();
    if (criticalInfraEnabled) refreshCriticalInfrastructure();
    if (schoolsLayerEnabled) refreshNationalMapColleges();
    if (landOwnershipEnabled) refreshLandOwnership();
    if (floodHazardEnabled) refreshFloodHazards();
    if (layers.fireWeatherOutlooks) {
      refreshFireWeatherOutlooks();
    }
    if (nhcTropicalWeatherEnabled) {
      refreshNhcTropicalWeather();
    }
    if (weatherDataEnabled && layers.wpcEro) refreshWpcEro();
    if (weatherDataEnabled && layers.wpcWssi) refreshWpcWssi();
    if (weatherDataEnabled && layers.wpcQpf) refreshWpcQpf();
    if (weatherDataEnabled && layers.wpcFronts) refreshWpcFronts();
    if (weatherDataEnabled && layers.weatherAlerts) refreshWpcMpd();
  }, [
    refreshHotspots, refreshNgfs, refreshPerimeters, refreshAlerts, refreshIncidents, refreshCalFireIncidents, refreshStormReports,
    refreshDamageAssessment,
    refreshSpcMd, refreshSpcOutlooks, refreshUserReports, refreshEvacZones, refreshReporterEvacZones,
    refreshAQI, refreshRAWS, refreshAirNowMonitors, refreshDroughtOutlook, refreshNdgdSmokeForecast, refreshFireWeatherOutlooks,
    refreshCriticalInfrastructure,
    refreshNationalMapColleges,
    refreshLandOwnership,
    refreshFloodHazards,
    refreshNhcTropicalWeather,
    refreshWpcEro, refreshWpcWssi, refreshWpcQpf, refreshWpcFronts, refreshWpcMpd,
    layers.wpcEro, layers.wpcWssi, layers.wpcQpf, layers.wpcFronts, layers.weatherAlerts,
    activeMapTab, weatherDataEnabled, damageAssessmentEnabled, layers.aqi, rawsEnabled, layers.airNowMonitors, layers.droughtOutlook, layers.ndgdSmokeForecast,
    layers.fireWeatherOutlooks, layers.stormReports,
    nhcTropicalWeatherEnabled,
    criticalInfraEnabled,
    schoolsLayerEnabled,
    landOwnershipEnabled,
    floodHazardEnabled,
  ]);

  // ── Keep the page from going stale ──
  // Feeds poll on their own timers, but browsers pause or throttle timers in
  // background tabs and on locked phones, so a page left open can come back
  // showing data (and an "Updated" time) from long ago. Refresh everything as
  // soon as the page is visible again or back online, and as a backstop
  // whenever nothing has refreshed for longer than one poll cycle.
  const handleRefreshRef = useRef(handleRefresh);
  const lastRefreshedRef = useRef(lastRefreshed);
  useEffect(() => {
    handleRefreshRef.current = handleRefresh;
    lastRefreshedRef.current = lastRefreshed;
  }, [handleRefresh, lastRefreshed]);

  useEffect(() => {
    if (!mapReady) return undefined;
    const ageMs = () => {
      const t = lastRefreshedRef.current ? new Date(lastRefreshedRef.current).getTime() : 0;
      return Date.now() - t;
    };
    const refreshIfOlderThan = (maxAgeMs) => {
      if (document.visibilityState === 'hidden') return;
      if (ageMs() >= maxAgeMs) handleRefreshRef.current();
    };
    const onVisible = () => refreshIfOlderThan(RESUME_REFRESH_AFTER_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);
    window.addEventListener('pageshow', onVisible);
    const watchdog = window.setInterval(() => refreshIfOlderThan(STALE_AFTER_MS), STALE_CHECK_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onVisible);
      window.removeEventListener('pageshow', onVisible);
      window.clearInterval(watchdog);
    };
  }, [mapReady]);

  // Measures the bottom bar's own rendered size so the outlook selectors
  // docked on top of it (rendered separately, inside MapView) can match its
  // width and sit flush against it, instead of guessing a fixed size.
  const mapBottomBarRef = useRef(null);
  const [mapBottomBarSize, setMapBottomBarSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = mapBottomBarRef.current;
    if (!el) return undefined;
    // getBoundingClientRect (not ResizeObserver's contentRect, which excludes
    // padding/border) so this matches the bar's actual rendered box.
    const observer = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      setMapBottomBarSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The left sidebars (hazards, menu) run from the header to the map's bottom
  // edge, sized to end just short of the centered bottom bar (which stays
  // put); while one is open, the distance scale moves right of the bar. Where
  // the screen is too narrow for that gap, the bar sits over the open
  // sidebar's bottom corner and the sidebar's lists scroll under it.
  const viewportWidth = useViewportWidth();
  const leftPanel = leftPanelLayout(viewportWidth, mapBottomBarSize.width);
  const leftPanelOpen = sidebarOpen || futurePanelOpen;
  const barOverLeftPanel = Boolean(leftPanel && !leftPanel.clearsBar);
  // Large right-hand panels keep their top, end a small gap above the zoom
  // buttons, and stay fully right of the bottom bar (from sm up).
  const rightPanelWidth = rightPanelMaxWidth(viewportWidth, mapBottomBarSize.width);

  const satelliteActive = Boolean(layers.satellite) && activeMapTab !== MAP_TABS.models;
  // A Weather-tab layer; Simplified Sentinel also offers it on All Hazards.
  const mrmsActive = Boolean(layers.mrms)
    && (activeMapTab === MAP_TABS.weather || (simplified && activeMapTab === MAP_TABS.allhazard));
  const fireDangerTab = hasFireDangerAccess && (activeMapTab === MAP_TABS.wildfire || activeMapTab === MAP_TABS.allhazard);
  const radarSitesActive = Boolean(layers.radarSites) && (activeMapTab === MAP_TABS.weather || activeMapTab === MAP_TABS.allhazard);
  const awcActive = Boolean(layers.awc) && (activeMapTab === MAP_TABS.weather || activeMapTab === MAP_TABS.allhazard);
  // Pull-up controls sheet (MapDockSheet): every layer control that docks on the
  // bottom bar lives in it. Settled height incl. its tabs (0 when no tab is shown).
  const [dockSheetHeight, setDockSheetHeight] = useState(0);

  // What the satellite panel reports as drawn over the imagery.
  const satelliteOverlays = useMemo(() => {
    if (!satelliteActive) return null;
    const tropical = nhcTropicalWeatherEnabled
      ? {
        storms: nhcStormLabelsGeoJSON?.features?.length ?? 0,
        areas: nhcDisturbanceAreasGeoJSON?.features?.length ?? 0,
        bounds: featureCollectionsBounds(nhcConeGeoJSON, nhcForecastPointsGeoJSON, nhcDisturbanceAreasGeoJSON, nhcDisturbancePointsGeoJSON),
      }
      : null;
    return { tropical };
  }, [satelliteActive, nhcTropicalWeatherEnabled,
    nhcStormLabelsGeoJSON, nhcDisturbanceAreasGeoJSON, nhcConeGeoJSON, nhcForecastPointsGeoJSON, nhcDisturbancePointsGeoJSON]);

  // Wildfire tab: NDGD smoke forecast hour, chosen in the dock's Smoke tab and drawn by MapView.
  const [ndgdSmokeHourIndex, setNdgdSmokeHourIndex] = useState(0);
  const ndgdForecastHoursMs = useMemo(() => ndgdForecastHours(ndgdSmokeForecastGeoJSON), [ndgdSmokeForecastGeoJSON]);
  useEffect(() => {
    if (!ndgdForecastHoursMs.length) return;
    setNdgdSmokeHourIndex((i) => Math.min(i, ndgdForecastHoursMs.length - 1));
  }, [ndgdForecastHoursMs]);

  // Models tab: the forecast-time scrubber stays docked open on the bar (no drawer).
  const modelsTimeShowing = activeMapTab === MAP_TABS.models;
  const modelsTimeRef = useRef(null);
  const [modelsTimeHeight, setModelsTimeHeight] = useState(0);
  useEffect(() => {
    const el = modelsTimeRef.current;
    if (!el) {
      setModelsTimeHeight(0);
      return undefined;
    }
    const observer = new ResizeObserver(() => setModelsTimeHeight(el.getBoundingClientRect().height));
    observer.observe(el);
    return () => observer.disconnect();
  }, [modelsTimeShowing]);

  const totalDockedHeight = dockSheetHeight + (modelsTimeShowing ? modelsTimeHeight : 0);
  const layerPanelDockClearance = totalDockedHeight ? totalDockedHeight + 8 : 0;

  return (
    // overflow-x-clip (not overflow-hidden) so the map canvas can bleed below
    // the page into the large viewport — see .viewport-bleed in index.css.
    <div className="viewport-bleed w-screen flex flex-col bg-sentinel-900 text-white overflow-x-clip select-none">
      <Seo
        title="Live Wildfire Map & Tracker | Sentinel by NWTT"
        description="Track active wildfires in real time with satellite hotspot detection, fire perimeters, containment status, red flag warnings, and air quality — free, from the National Wildfire Tracking Team."
        path="/"
      />
      {/* ── Top bar ── */}
      <Header onRefresh={handleRefresh} />

      {/* ── Main content area (map fills full width; all controls float over it) ── */}
      {/* --map-bottom-stack: space taken by the bottom bar plus anything docked on
          it, so the left drawers can end above it where they'd otherwise cover it. */}
      <WeatherModelsProvider active={activeMapTab === MAP_TABS.models} onOpen={handleOpenModels} apiRef={modelsApiRef}>
      <MrmsProvider active={mrmsActive}>
      <FireDangerProvider active={fireDangerTab}>
      <RadarSiteProvider active={radarSitesActive}>
      <AwcProvider active={awcActive}>
      <SatelliteProvider active={satelliteActive}>
      <div
        // The map area: dragged popups stay inside it (usePopupDrag).
        data-map-area=""
        className={`flex-1 relative overflow-x-clip ${MODEL_COLOR_VARS}`}
        style={{
          '--map-bottom-stack': `${mapBottomBarSize.height + totalDockedHeight + 24}px`,
          '--left-panel-width': leftPanel ? `${leftPanel.width}px` : undefined,
          // Above the left sidebars (z-40) while one is open under the bar.
          '--bar-z': barOverLeftPanel && leftPanelOpen ? 45 : undefined,
          '--right-panel-max-width': rightPanelWidth ? `${rightPanelWidth}px` : undefined,
          '--right-panel-bottom': `${RIGHT_PANEL_BOTTOM}px`,
        }}
      >
        <MapView
            onMapLoad={handleMapLoad}
            activeMapTab={activeMapTab}
            mapType={mapType}
            hotspotsGeoJSON={hotspotsGeoJSON}
            ngfsGeoJSON={ngfsGeoJSON}
            perimetersGeoJSON={nearbyMapGeoJSON.perimeters}
            incidentsGeoJSON={nearbyMapGeoJSON.incidents}
            incidentDotsGeoJSON={nearbyMapGeoJSON.incidentDots}
            nearbyRadiusGeoJSON={nearbyMapGeoJSON.radius}
            fireBehaviorModelingGeoJSON={fireBehaviorModelingGeoJSON}
            aqiGeoJSON={aqiGeoJSON}
            alertsGeoJSON={nearbyMapGeoJSON.alerts}
            stormMotionVectorsGeoJSON={stormMotionVectorsGeoJSON}
            stormMotionVectorsVisible={STORM_MOTION_VECTORS}
            stormReportsGeoJSON={stormReportsGeoJSON}
            damageAssessmentPointsGeoJSON={damageAssessmentPointsGeoJSON}
            damageAssessmentLinesGeoJSON={damageAssessmentLinesGeoJSON}
            damageAssessmentPolygonsGeoJSON={damageAssessmentPolygonsGeoJSON}
            spcOutlooksGeoJSON={spcOutlooksGeoJSON}
            spcMdGeoJSON={spcMdGeoJSON}
            userReportsGeoJSON={userReportsGeoJSON}
            hazardEventsGeoJSON={hazardEventsGeoJSON}
            evacZonesGeoJSON={evacZonesGeoJSON}
            rawsGeoJSON={rawsGeoJSON}
            airNowMonitorsGeoJSON={airNowMonitorsGeoJSON}
            droughtOutlookGeoJSON={droughtOutlookGeoJSON}
            ndgdSmokeForecastGeoJSON={ndgdSmokeForecastGeoJSON}
            ndgdForecastHoursMs={ndgdForecastHoursMs}
            ndgdSmokeHourIndex={ndgdSmokeHourIndex}
            criticalInfrastructureTransGeoJSON={criticalInfrastructureTransGeoJSON}
            criticalInfrastructureGasGeoJSON={criticalInfrastructureGasGeoJSON}
            criticalInfrastructureVisible={criticalInfraEnabled}
            nationalMapCollegesGeoJSON={nationalMapCollegesGeoJSON}
            nationalMapCollegesVisible={schoolsLayerEnabled}
            landOwnershipGeoJSON={landOwnershipGeoJSON}
            landOwnershipVisible={landOwnershipEnabled}
            floodHazardData={floodHazardData}
            floodHazardVisible={floodHazardEnabled}
            satelliteImageryOn={satelliteActive}
            nhcForecastPointsGeoJSON={nhcForecastPointsGeoJSON}
            nhcForecastTrackGeoJSON={nhcForecastTrackGeoJSON}
            nhcConeGeoJSON={nhcConeGeoJSON}
            nhcWatchWarningGeoJSON={nhcWatchWarningGeoJSON}
            nhcPastPointsGeoJSON={nhcPastPointsGeoJSON}
            nhcPastTrackGeoJSON={nhcPastTrackGeoJSON}
            nhcDisturbancePointsGeoJSON={nhcDisturbancePointsGeoJSON}
            nhcDisturbanceAreasGeoJSON={nhcDisturbanceAreasGeoJSON}
            nhcStormLabelsGeoJSON={nhcStormLabelsGeoJSON}
            nhcWindHazards={nhcWindHazards}
            fireWeatherOutlooksGeoJSON={fireWeatherOutlooksGeoJSON}
            fireWxOutlookType={fireWxOutlookType}
            savedLocations={savedLocations}
            measureActive={measureActive}
            measureMode={measureMode}
            onMeasureActivate={onMeasureActivate}
            onMeasureClose={onMeasureClose}
            waterGaugesGeoJSON={waterGaugesGeoJSON}
            calFireHistoricalPerimetersGeoJSON={calFireHistoricalPerimetersGeoJSON}
            californiaCamerasGeoJSON={californiaCamerasGeoJSON}
            wpcEroGeoJSON={wpcEroGeoJSON}
            wpcWssiGeoJSON={wpcWssiGeoJSON}
            wpcQpfGeoJSON={wpcQpfGeoJSON}
            wpcFrontsGeoJSON={wpcFrontsGeoJSON}
            wpcPressureCentersGeoJSON={wpcPressureCentersGeoJSON}
            wpcMpdGeoJSON={wpcMpdGeoJSON}
            onModelPick={activeMapTab === MAP_TABS.models ? handleModelPick : undefined}
            modelOverlay={activeMapTab === MAP_TABS.models ? (p) => <WeatherModelsMapLayer {...p} /> : <WindParticlesOverlay />}
            routeOverlay={routeOverlay}
            onRoutePick={routeToSafetyActive && routeToSafety.picking ? routeToSafety.actions.pickPoint : undefined}
          />

          <MapCornerButtons />
          {routeToSafetyActive && (
            <RouteToSafetyPanel
              state={routeToSafety}
              actions={routeToSafety.actions}
              onClose={closeRouteToSafety}
              hasHome={hasValidHome}
            />
          )}

          <Sidebar
            incidents={nearbyResult ? nearbyResult.incidents : mergedIncidents}
            nearbyAlerts={nearbyResult ? nearbyResult.nwsAlerts : null}
            nearbyOutlooks={sidebarNearbyOutlooks}
            loading={incidentsLoading}
            error={incidentsError}
            activeMapTab={activeMapTab}
            weatherAlertsLoading={alertsLoading}
            weatherAlertsError={alertsError}
            weatherAlertFilter={weatherAlertFilter}
            onWeatherAlertFilterChange={setWeatherAlertFilter}
            onWeatherAlertsRefresh={refreshAlerts}
            nhcCyclones={nhcCyclones}
            nhcInvests={nhcInvests}
            nhcLoading={nhcLoading}
            nhcEnabled={nhcTropicalWeatherEnabled}
            modelsPanel={<WeatherModelsPanel />}
            underBar={barOverLeftPanel}
          />

          {/* The legend lives in the app menu; the Models tab swaps in its own,
              since it turns the operational layers off. */}
          <FutureFeaturesPanel
            mapType={mapType}
            onMapTypeChange={setMapType}
            underBar={barOverLeftPanel}
            legend={activeMapTab === MAP_TABS.models ? (
              <ModelLegend />
            ) : (
              <Legend spcOutlookType={spcOutlookType} fireWxOutlookType={fireWxOutlookType} />
            )}
          />
          {/* Hidden while the water gauge panel is open, whose close button sits in the same corner. */}
          {!selectedGauge && <AccountButton />}
          <AccountPanel />
          {/* One first-look at a time: the Simplified prompt waits until the Overview closes. */}
          {overviewOpen ? (
            <LoginOverview
              summary={overviewSummary}
              home={isHomeSetupComplete ? home : null}
              loading={overviewLoading}
              onClose={closeOverview}
              onQuickFilter={handleQuickFilter}
              onSetUpHome={handleOverviewSetUpHome}
            />
          ) : (
            <SimplifiedPrompt />
          )}

          <MapBottomBar
            ref={mapBottomBarRef}
            activeMapTab={activeMapTab}
            onTabChange={handleTabChange}
            onModelsIntent={handleModelsIntent}
            infrastructureLayersEntitled={hasProInfrastructureAccess}
            fireDangerEntitled={hasFireDangerAccess}
            routingEntitled={navigationEntitled}
            measureActive={measureActive}
            measureMode={measureMode}
            onMeasureActivate={onMeasureActivate}
            onMeasureClose={onMeasureClose}
            dockedPanelClearance={layerPanelDockClearance}
            dockedAttached={modelsTimeShowing}
            simplified={simplified}
          />

          {modelsTimeShowing && (
            <div
              ref={modelsTimeRef}
              data-map-control=""
              className="absolute left-1/2 -translate-x-1/2 z-[var(--bar-z,20)] overflow-hidden rounded-t-2xl border border-b-0 border-sentinel-600 bg-sentinel-900 shadow-2xl shadow-black/60 animate-dock-rise"
              style={{
                bottom: 16 + mapBottomBarSize.height,
                width: mapBottomBarSize.width ? `max(${mapBottomBarSize.width}px, min(24rem, calc(100vw - 1rem)))` : 'min(24rem, calc(100vw - 1rem))',
                maxWidth: 'calc(100vw - 1rem)',
              }}
            >
              <ModelFieldTimeline />
            </div>
          )}

          <SatelliteStormFocus selected={selectedFire} />
          {/* Every docked layer control as pull-up tabs on the bar */}
          <MapDockSheet
            activeMapTab={activeMapTab}
            layers={layers}
            satelliteOverlays={satelliteOverlays}
            spc={{
              outlookType: spcOutlookType,
              onOutlookTypeChange: setSpcOutlookType,
              activeDay: spcActiveDay,
              onActiveDayChange: setSpcActiveDay,
              loading: spcOutlooksLoading,
              validTime: spcValidTime,
            }}
            fireWx={{
              outlookType: fireWxOutlookType,
              onOutlookTypeChange: setFireWxOutlookType,
              activeDay: fireWxActiveDay,
              onActiveDayChange: setFireWxActiveDay,
            }}
            smoke={{ forecastHoursMs: ndgdForecastHoursMs, valueIndex: ndgdSmokeHourIndex, onIndexChange: setNdgdSmokeHourIndex }}
            bottomOffset={16 + mapBottomBarSize.height}
            bottomBarWidth={mapBottomBarSize.width}
            onSettledHeight={setDockSheetHeight}
          />

          {activeMapTab === MAP_TABS.models && <ModelFieldLegend />}

          <MapScaleDock
            map={mapInstance}
            bottomBarWidth={mapBottomBarSize.width}
            bottomBarHeight={mapBottomBarSize.height}
            besidePanel={leftPanelOpen}
          />

          <span className="absolute bottom-0.5 right-1.5 z-20 pointer-events-none select-none text-[10px] leading-none font-medium tabular-nums text-white/70 [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
            v{APP_VERSION}
          </span>
          <Suspense fallback={null}>
            {selectedFire && <FireDetailPanel nhc={nhcPanelData} />}
            {selectedGauge && (
              <WaterGaugePanel
                gauge={selectedGauge}
                onClose={() => selectGauge(null)}
              />
            )}
            {selectedCamera && (
              <CameraPanel
                camera={selectedCamera}
                onClose={() => selectCamera(null)}
              />
            )}
          </Suspense>
      </div>
      </SatelliteProvider>
      </AwcProvider>
      </RadarSiteProvider>
      </FireDangerProvider>
      </MrmsProvider>
      </WeatherModelsProvider>

    </div>
  );
}
