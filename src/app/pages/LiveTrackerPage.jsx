/**
 * LiveTrackerPage.jsx
 * Full-screen wildfire tracking dashboard with live map, sidebar, and layer controls.
 * Refactored from the original App.jsx single-page layout.
 */

import Seo from '../../shared/components/Seo';
import { useApp } from '../context/AppContext';
import { useAppStatus } from '../context/AppStatusContext';
import { useViewport } from '../context/ViewportContext';
import { usePreferences } from '../context/PreferencesContext';
import { useHomeSetup } from '../context/HomeSetupContext';
import { nwsAlertCategory } from '../utils/nwsColors';
import { FIRE_WEATHER_ALERT_TYPES } from '../api/noaaWeather';
import { useSavedLocations } from '../hooks/useSavedLocations';
import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';

// Data hooks
import { useFireHotspots } from '../hooks/useFireHotspots';
import { useNgfsDetections } from '../hooks/useNgfsDetections';
import { useMergedFireData, getFireMatchKey, pointInGeometry } from '../hooks/useMergedFireData';
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
import { useHazardEvents, hazardEventsToGeoJSON } from '../hooks/useHazardEvents';
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
import { useCriticalInfrastructure } from '../hooks/useCriticalInfrastructure';
import { useNationalMapColleges } from '../hooks/useNationalMapColleges';
import { useCaliforniaLandOwnership, isWithinLandOwnershipRange } from '../hooks/useCaliforniaLandOwnership';
import { usePlan } from '../../shared/hooks/usePlan';
import { useWaterGauges } from '../hooks/useWaterGauges';
import { useNexradSites } from '../hooks/useNexradSites';
import { useNexradScan } from '../hooks/useNexradScan';
import { useNexradRaster } from '../hooks/useNexradRaster';
import { useNexradComposite } from '../hooks/useNexradComposite';
import { useStormMotionVectors } from '../hooks/useStormMotionVectors';
import { useCaliforniaCameras } from '../hooks/useCaliforniaCameras';
import { useCalFirePerimeters } from '../hooks/useCalFirePerimeters';
import { useNearbyOutlooks } from '../hooks/useNearbyOutlooks';
import { filterByRadius, filterFeatureCollectionByRadius, circlePolygon } from '../utils/radiusFilter';
import { polygonCentroid } from '../utils/geoUtils';
import { incidentsToGeoJSON } from '../api/inciweb';
import { mergeIrwinAndCalFireIncidents } from '../utils/mergeIncidents';

// Components
import Header from '../components/Header/Header';
import AlertBanner from '../components/AlertBanner/AlertBanner';
import Sidebar from '../components/Sidebar/Sidebar';
import MapView from '../components/Map/MapView';
import MapBottomBar from '../components/BottomBar/MapBottomBar';
import MapCornerButtons from '../components/MapControls/MapCornerButtons';
import FutureFeaturesPanel from '../components/MapControls/FutureFeaturesPanel';
import AccountButton from '../components/MapControls/AccountButton';
import AccountPanel from '../components/AccountPanel/AccountPanel';
import Legend from '../components/Legend/Legend';
// Lazy-loaded: each only ever mounts once the user has actually selected the
// corresponding fire/gauge/radar site/camera, so their code shouldn't ship in
// the initial bundle for sessions that never open one.
const FireDetailPanel = lazy(() => import('../components/FireDetailPanel/FireDetailPanel'));
const WaterGaugePanel = lazy(() => import('../components/WaterGaugePanel/WaterGaugePanel'));
const RadarSitePanel = lazy(() => import('../components/RadarSitePanel/RadarSitePanel'));
const CameraPanel = lazy(() => import('../components/CameraPanel/CameraPanel'));

// US continental bounding box for data fetches
const US_BOUNDS = { west: -130, south: 24, east: -65, north: 50 };

const MAP_TABS = {
  wildfire:   'wildfire',
  weather:    'weather',
  allhazard:  'allhazard',
  locations:  'locations',
};

const WILDFIRE_LAYER_PRESET = {
  fireHotspots: false,
  firePerimeters: true,
  incidentLocations: true,
  weatherAlerts: true,
  smoke: false,
  goesEast: false,
  goesWest: false,
  goesFire16: false,
  goesFire18: false,
  spcWeatherOutlooks: false,
  radar: false,
  evacZones: true,
  rawsStations: false,
  airNowMonitors: false,
  ndgdSmokeForecast: false,
  fireWeatherOutlooks: false,
  stormReports: false,
  criticalInfrastructure: false,
  schoolsUniversities: false,
  landOwnership: false,
};

const ALL_HAZARD_LAYER_PRESET = {
  fireHotspots: false,
  firePerimeters: true,
  incidentLocations: true,
  weatherAlerts: true,
  smoke: false,
  goesEast: false,
  goesWest: false,
  spcWeatherOutlooks: false,
  radar: true,
  evacZones: true,
  rawsStations: false,
  airNowMonitors: false,
  ndgdSmokeForecast: false,
  fireWeatherOutlooks: false,
  stormReports: false,
  criticalInfrastructure: false,
  schoolsUniversities: false,
  landOwnership: false,
};

// Weather tab: auto-enable NWS alerts (includes SPC MDs on map) and
// Composite Radar; other weather layers, including NEXRAD, are opt-in
// via the layer panel.
const WEATHER_LAYER_PRESET = {
  fireHotspots: false,
  firePerimeters: false,
  incidentLocations: false,
  weatherAlerts: true,
  smoke: false,
  goesEast: false,
  goesWest: false,
  goesFire16: false,
  goesFire18: false,
  spcWeatherOutlooks: false,
  stormReports: false,
  radarComposite: true,
  criticalInfrastructure: false,
  evacZones: false,
  rawsStations: false,
  airNowMonitors: false,
  ndgdSmokeForecast: false,
  schoolsUniversities: false,
  landOwnership: false,
};

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
 * Filter a GeoJSON FeatureCollection to only include fires less than 95% contained.
 * Used in "Active Fires" mode across all data sources.
 */
function filterActiveFiresGeoJSON(geoJSON, { containedKey }) {
  if (!geoJSON?.features) return geoJSON;
  return {
    ...geoJSON,
    features: geoJSON.features.filter(f => {
      const contained = Number(f.properties[containedKey]) || 0;
      return contained < 95;
    }),
  };
}

// RAWS stations load once the map is zoomed in to roughly county scale
const RAWS_MIN_ZOOM = 9;

export default function LiveTrackerPage() {
  const { layers, setLayer, feedFilter, selectedGauge, selectGauge, selectedFire, selectFire, selectedRadarSite, selectRadarSite, selectedCamera, selectCamera, wpcOutlookDay } = useApp();
  const { setRefreshed, setLoading, alerts, userLocation } = useAppStatus();
  const { home, nearbyActive } = useHomeSetup();
  const { viewport, setViewport, flyToFire } = useViewport();
  const { prefs } = usePreferences();
  const { hasProInfrastructureAccess, hasFireBehaviorModelingAccess } = usePlan();
  const criticalInfraEntitled = hasProInfrastructureAccess;
  const { locations: savedLocations } = useSavedLocations();
  const [activeMapTab, setActiveMapTab] = useState(MAP_TABS.wildfire);
  const [mapType, setMapType] = useState('satellite');
  const [weatherAlertFilter, setWeatherAlertFilter] = useState('all');
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [measureActive, setMeasureActive] = useState(false);
  const [measureMode, setMeasureMode] = useState('distance');
  const [precipRingActive, setPrecipRingActive] = useState(false);

  const onMeasureActivate = useCallback((mode) => {
    setMeasureMode(mode);
    setMeasureActive(true);
  }, []);

  const onMeasureClose = useCallback(() => {
    setMeasureActive(false);
  }, []);

  const onPrecipRingToggle = useCallback(() => {
    if (!precipRingActive) {
      setLayer('radarComposite', true);
    }
    setPrecipRingActive(!precipRingActive);
  }, [precipRingActive, setLayer]);

  useEffect(() => {
    if (activeMapTab !== MAP_TABS.weather && activeMapTab !== MAP_TABS.allhazard) {
      setPrecipRingActive(false);
    }
  }, [activeMapTab]);

  // NEXRAD Level II turned off, or leaving the weather/all-hazard tabs,
  // closes any open site radar panel so its live scan polling stops.
  const isWeatherOrAllHazardTab = activeMapTab === MAP_TABS.weather || activeMapTab === MAP_TABS.allhazard;
  useEffect(() => {
    if (!layers.radarNexrad || !isWeatherOrAllHazardTab) selectRadarSite(null);
  }, [layers.radarNexrad, isWeatherOrAllHazardTab, selectRadarSite]);

  useEffect(() => {
    if (!criticalInfraEntitled && layers.criticalInfrastructure) {
      setLayer('criticalInfrastructure', false);
    }
  }, [criticalInfraEntitled, layers.criticalInfrastructure, setLayer]);

  useEffect(() => {
    if (!criticalInfraEntitled && layers.schoolsUniversities) {
      setLayer('schoolsUniversities', false);
    }
  }, [criticalInfraEntitled, layers.schoolsUniversities, setLayer]);

  useEffect(() => {
    if (!criticalInfraEntitled && layers.landOwnership) {
      setLayer('landOwnership', false);
    }
  }, [criticalInfraEntitled, layers.landOwnership, setLayer]);

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

  const handleTabChange = useCallback((newTab) => {
    if (newTab === activeMapTab) return;
    if (activeMapTab !== MAP_TABS.locations) {
      layerSnapshotsRef.current[activeMapTab] = { ...layers };
    }
    setActiveMapTab(newTab);
  }, [activeMapTab, layers]);

  // Apply layer presets only when switching between wildfire/weather/allhazard tabs.
  // The locations tab keeps whatever layers were already active.
  useEffect(() => {
    if (activeMapTab === MAP_TABS.locations) return;
    const presets = {
      [MAP_TABS.wildfire]:  WILDFIRE_LAYER_PRESET,
      [MAP_TABS.weather]:   WEATHER_LAYER_PRESET,
      [MAP_TABS.allhazard]: ALL_HAZARD_LAYER_PRESET,
    };
    const preset = presets[activeMapTab];
    if (!preset) return;
    const values = layerSnapshotsRef.current[activeMapTab] || preset;
    Object.entries(values).forEach(([layer, value]) => {
      setLayer(layer, value);
    });
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
  const handleMapLoad = useCallback(() => setMapReady(true), []);

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
  const wildfireDataEnabled = activeMapTab !== MAP_TABS.weather && mapReady;
  const weatherDataEnabled = (activeMapTab === MAP_TABS.weather || activeMapTab === MAP_TABS.allhazard) && mapReady;

  const {
    geoJSON: hotspotsGeoJSON,
    loading: hotspotsLoading,
    refresh: refreshHotspots,
  } = useFireHotspots(US_BOUNDS, wildfireDataEnabled);

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
  } = useMergedFireData(5, wildfireDataEnabled, true);

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

  // Radar Settings: "Storm Motion Vectors" — see useStormMotionVectors.js /
  // utils/stormMotion.js. `alerts` (from useApp(), populated by
  // useWeatherAlerts above) already carries the raw description/sent fields
  // this needs. Independent of the weatherAlerts layer toggle (this is a
  // display preference, not a layer), so it stays available regardless of
  // which alert types are currently shown.
  const stormMotionVectorsGeoJSON = useStormMotionVectors(
    alerts,
    mapReady && Boolean(prefs.stormMotionVectors)
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
  const {
    geoJSON: officialEvacZonesGeoJSON,
    refresh: refreshEvacZones,
  } = useCombinedEvacZones(layers.evacZones && mapReady);

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
    && criticalInfraEntitled
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
    refresh: refreshWpcFronts,
  } = useWpcFronts(weatherDataEnabled && layers.wpcFronts, wpcOutlookDay.fronts);

  const {
    geoJSON: wpcMpdGeoJSON,
    refresh: refreshWpcMpd,
  } = useWpcMesoscaleDiscussion(weatherDataEnabled && layers.wpcMpd);

  // Permanent layer (not user-toggleable) — fetches whenever the weather/all-hazard tab is active.
  const nhcTropicalWeatherEnabled = weatherDataEnabled;
  const {
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

  // NOAA NWPS water gauges
  const {
    geoJSON: waterGaugesGeoJSON,
  } = useWaterGauges(layers.waterGauges);

  // NWS NEXRAD Level 2 radar sites — live operability status. Needed both
  // for the site-picker layer (radarNexrad) and as the coordinate source for
  // Composite Radar's per-site rasterization (radarComposite).
  const {
    geoJSON: nexradSitesGeoJSON,
  } = useNexradSites(weatherDataEnabled && (layers.radarNexrad || layers.radarComposite));

  // Live California highway cameras — Caltrans District CCTV
  const {
    geoJSON: californiaCamerasGeoJSON,
  } = useCaliforniaCameras(layers.wildfireCameras);

  // Live Level II sweep for whichever radar site is currently selected.
  const [radarProduct, setRadarProduct] = useState('reflectivity');
  useEffect(() => {
    setRadarProduct('reflectivity');
  }, [selectedRadarSite?.id]);

  const { meta: radarScanMeta, payload: radarScanPayload, status: radarScanStatus, error: radarScanError } =
    useNexradScan(selectedRadarSite?.id, radarProduct, Boolean(selectedRadarSite));

  const radarRaster = useNexradRaster(
    selectedRadarSite?.id,
    radarProduct,
    radarScanMeta?.scan_time,
    radarScanPayload,
    selectedRadarSite ? { lat: selectedRadarSite.lat, lng: selectedRadarSite.lng } : null
  );

  // Composite Radar — every NEXRAD site's own reflectivity sweep, rendered
  // as its own map layer (see useNexradComposite.js's doc comment for why
  // this replaced the old national MRMS mosaic). Independent of the
  // single-site NEXRAD Level II view above; feeds only layers.radarComposite.
  const {
    frames: nexradCompositeFrames,
    selectedTimestamp: nexradCompositeSelectedTimestamp,
    isLive: nexradCompositeIsLive,
    isPlaying: nexradCompositeIsPlaying,
    error: nexradCompositeError,
    sites: nexradCompositeSites,
    selectFrame: onNexradCompositeSelectFrame,
    play: onNexradCompositePlay,
    pause: onNexradCompositePause,
    previous: onNexradCompositePrevious,
    next: onNexradCompositeNext,
  } = useNexradComposite(weatherDataEnabled && layers.radarComposite, nexradSitesGeoJSON, viewport);

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
  const userReportsGeoJSON = useMemo(
    () => reportsToGeoJSON(reporterReports),
    [reporterReports]
  );

  // Community-submitted hazard events – wildfire, flooding, hazmat, other.
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

  // Perimeters whose upstream name is a blank-data placeholder ("Unknown
  // Fire"/"Unnamed") borrow a name from a community report that falls inside
  // their polygon, so the map doesn't show an unhelpful placeholder when
  // reporters have already identified the fire.
  const namedPerimetersGeoJSON = useMemo(() => {
    if (!freshPerimetersGeoJSON?.features?.length || !reporterReports.length)
      return freshPerimetersGeoJSON;
    return {
      ...freshPerimetersGeoJSON,
      features: freshPerimetersGeoJSON.features.map(f => {
        if (getFireMatchKey(f.properties.IncidentName)) return f;
        const match = reporterReports.find(r => {
          const lng = Number(r.longitude);
          const lat = Number(r.latitude);
          return Number.isFinite(lng) && Number.isFinite(lat) && pointInGeometry([lng, lat], f.geometry);
        });
        if (!match) return f;
        return { ...f, properties: { ...f.properties, IncidentName: match.title } };
      }),
    };
  }, [freshPerimetersGeoJSON, reporterReports]);

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
    const existingNameKeys = new Set(freshIncidentsList.map(i => getFireMatchKey(i.name)).filter(Boolean));
    return filteredPerimetersGeoJSON.features
      .filter(f => {
        const key = getFireMatchKey(f.properties.IncidentName);
        return key && !existingNameKeys.has(key);
      })
      .map(f => {
        const p = f.properties;
        const contained = Number(p.PercentContained) || 0;
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

  // Fires with perimeter overlays already render a centered perimeter centroid
  // indicator. Build a set of those names so we can hide off-center IRWIN dots.
  const perimeterMatchKeys = useMemo(() => {
    if (!filteredPerimetersGeoJSON?.features?.length) return new Set();
    const keys = new Set();
    filteredPerimetersGeoJSON.features.forEach(f => {
      const key = getFireMatchKey(f.properties.IncidentName);
      if (key) keys.add(key);
    });
    return keys;
  }, [filteredPerimetersGeoJSON]);

  // ── Combine IRWIN incidents with perimeter-only fires for sidebar ──
  // Perimeter-only fires have no IRWIN record; add them so they appear in the feed.
  const allIncidents = useMemo(
    () => [...freshIncidentsList, ...perimeterOnlyIncidents],
    [freshIncidentsList, perimeterOnlyIncidents]
  );

  // ── Reporter incidents replace matching external data incidents ──
  // When an approved reporter report shares a fire name with an IRWIN incident,
  // the external incident is replaced in the sidebar feed with a merged record
  // that keeps authoritative external stats but surfaces reporter-contributed data.
  const mergedIncidents = useMemo(() => {
    if (!reporterReports.length) return allIncidents;

    // Index reporter reports by normalised fire name key (same algorithm used
    // in useMergedFireData to match perimeters to incident dots).
    const reporterByKey = new Map();
    reporterReports.forEach(r => {
      const key = getFireMatchKey(r.title);
      if (key) reporterByKey.set(key, r);
    });

    return allIncidents.map(inc => {
      const key = getFireMatchKey(inc.name);
      if (!key || !reporterByKey.has(key)) return inc;

      const report = reporterByKey.get(key);
      // Extract acreage from reporter description if the reporter supplied it
      // (format: "Acreage: <number>").
      const reportAcresMatch = /^Acreage:\s*(\d+\.?\d*)/mi.exec(report.description || '');
      const reportAcres = reportAcresMatch ? Math.round(Number(reportAcresMatch[1])) : null;

      return {
        ...inc,
        // Use reporter coordinates when available – reporter location is often
        // more precise than the IRWIN centroid.
        lat: Number(report.latitude) || inc.lat,
        lng: Number(report.longitude) || inc.lng,
        // Reporter-provided acreage overrides the external value when present.
        acres: reportAcres ?? inc.acres,
        // Attach reporter metadata so downstream components can reference it.
        hasReporterData: true,
        reportId: report.id,
        reportDescription: report.description,
        reportedAt: report.created_at,
      };
    });
  }, [allIncidents, reporterReports]);

  // ── Shared incident/alert deep link ──
  // FireDetailPanel's Share button writes ?incident=<id> (fires, perimeters,
  // hotspots, user reports) or ?alert=<id> (weather alerts) into the URL —
  // but nothing previously read that param back out on load, so opening a
  // shared link never selected/flew to anything. Search every collection a
  // share link can point into, in the order a user would naturally encounter
  // them: IRWIN/reporter-merged incidents (covers most fires, including
  // perimeter-backed ones, since they share the same UniqueFireIdentifier),
  // then raw hotspot detections, then raw perimeters, then approved user
  // reports. Retries as data loads in (these collections start empty and
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

    const incidentMatch = mergedIncidents.find((inc) => String(inc.id) === incidentId);
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
        source: p.Source || null,
      };
      selectFire(record);
      flyToFire(record);
      sharedLinkResolvedRef.current = true;
      return;
    }

    const reportMatch = approvedReports.find((r) => String(r.id) === incidentId);
    if (reportMatch) {
      selectFire({ type: 'user-report', ...reportMatch });
      flyToFire(reportMatch);
      sharedLinkResolvedRef.current = true;
    }
    // Not found in anything loaded so far — leave unresolved and retry as
    // more data comes in, until the give-up timeout below fires.
  }, [
    mapReady, alerts, mergedIncidents, hotspotsGeoJSON, namedPerimetersGeoJSON, approvedReports,
    selectFire, flyToFire, setViewport,
  ]);

  useEffect(() => {
    if (sharedLinkResolvedRef.current) return undefined;
    const timeoutId = window.setTimeout(() => {
      sharedLinkResolvedRef.current = true;
    }, 15000);
    return () => window.clearTimeout(timeoutId);
  }, []);

  // Build the set of reporter-matched fire name keys once for GeoJSON filtering.
  const reporterMatchKeys = useMemo(() => {
    if (!reporterReports.length) return new Set();
    return new Set(
      reporterReports.map(r => getFireMatchKey(r.title)).filter(Boolean)
    );
  }, [reporterReports]);

  // Deduplicate IRWIN incident markers:
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
          if (reporterMatchKeys.has(key)) return null;
          if (perimeterMatchKeys.has(key)) return null;
          return f;
        })
        .filter(Boolean),
    };
  }, [filteredIncidentsGeoJSON, reporterMatchKeys, perimeterMatchKeys]);

  // Same deduplication for incident dot markers (fires without NIFC perimeters).
  const deduplicatedIncidentDotsGeoJSON = useMemo(() => {
    if (!reporterMatchKeys.size || !filteredIncidentDotsGeoJSON?.features)
      return filteredIncidentDotsGeoJSON;
    return {
      ...filteredIncidentDotsGeoJSON,
      features: filteredIncidentDotsGeoJSON.features.filter(f => {
        const key = getFireMatchKey(f.properties.IncidentName);
        return !key || !reporterMatchKeys.has(key);
      }),
    };
  }, [filteredIncidentDotsGeoJSON, reporterMatchKeys]);

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

    // Build lookup sets from IncidentLocationsLayer features
    const locationNameKeys = new Set();
    const locationIds = new Set();
    deduplicatedIncidentsGeoJSON.features.forEach(f => {
      const key = getFireMatchKey(f.properties.name);
      if (key) locationNameKeys.add(key);
      if (f.properties.id) locationIds.add(f.properties.id);
    });

    // Also include perimeter name keys so any FireIncidentsLayer dot that
    // slipped through name-matching in useMergedFireData is still caught.
    if (filteredPerimetersGeoJSON?.features) {
      filteredPerimetersGeoJSON.features.forEach(f => {
        const key = getFireMatchKey(f.properties.IncidentName);
        if (key) locationNameKeys.add(key);
      });
    }

    return {
      ...deduplicatedIncidentDotsGeoJSON,
      features: deduplicatedIncidentDotsGeoJSON.features.filter(f => {
        const nameKey = getFireMatchKey(f.properties.IncidentName);
        const id = f.properties.UniqueFireIdentifier;
        if (nameKey && locationNameKeys.has(nameKey)) return false;
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

  // ── Global loading state ──
  const anyLoading = hotspotsLoading || ngfsLoading || perimetersLoading || incidentsLoading || calFireLoading;
  useEffect(() => { setLoading(anyLoading); }, [anyLoading, setLoading]);
  useEffect(() => {
    if (!anyLoading) setRefreshed(new Date());
  }, [anyLoading, setRefreshed]);

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
    if (weatherDataEnabled && layers.wpcMpd) refreshWpcMpd();
  }, [
    refreshHotspots, refreshNgfs, refreshPerimeters, refreshAlerts, refreshIncidents, refreshCalFireIncidents, refreshStormReports,
    refreshDamageAssessment,
    refreshSpcMd, refreshSpcOutlooks, refreshUserReports, refreshEvacZones, refreshReporterEvacZones,
    refreshAQI, refreshRAWS, refreshAirNowMonitors, refreshDroughtOutlook, refreshNdgdSmokeForecast, refreshFireWeatherOutlooks,
    refreshCriticalInfrastructure,
    refreshNationalMapColleges,
    refreshLandOwnership,
    refreshNhcTropicalWeather,
    refreshWpcEro, refreshWpcWssi, refreshWpcQpf, refreshWpcFronts, refreshWpcMpd,
    layers.wpcEro, layers.wpcWssi, layers.wpcQpf, layers.wpcFronts, layers.wpcMpd,
    activeMapTab, weatherDataEnabled, damageAssessmentEnabled, layers.aqi, rawsEnabled, layers.airNowMonitors, layers.droughtOutlook, layers.ndgdSmokeForecast,
    layers.fireWeatherOutlooks, layers.stormReports,
    nhcTropicalWeatherEnabled,
    criticalInfraEnabled,
    schoolsLayerEnabled,
    landOwnershipEnabled,
  ]);

  // Measures the bottom bar's own rendered size so the Composite Radar
  // scrub bar (rendered separately, inside MapView) and the NEXRAD Level II
  // site popup (below) can match its width and sit flush against it,
  // instead of guessing a fixed size.
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

  const radarScrubberAttached = (activeMapTab === MAP_TABS.weather || activeMapTab === MAP_TABS.allhazard)
    && Boolean(layers.radarComposite) && nexradCompositeFrames.length >= 2;

  // Measures the radar scrub bar's own height so the Layers panel (opened
  // from inside MapBottomBar) can clear it too, instead of only clearing
  // MapBottomBar and opening on top of the scrub bar.
  const radarTimelineRef = useRef(null);
  const [radarTimelineHeight, setRadarTimelineHeight] = useState(0);

  useEffect(() => {
    const el = radarTimelineRef.current;
    if (!el) {
      setRadarTimelineHeight(0);
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      setRadarTimelineHeight(el.getBoundingClientRect().height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [radarScrubberAttached]);

  // Measures the NEXRAD Level II site popup's own height so the Layers panel
  // can clear it too — same reasoning as the Composite Radar scrub bar above.
  const radarSitePanelRef = useRef(null);
  const [radarSitePanelHeight, setRadarSitePanelHeight] = useState(0);

  useEffect(() => {
    const el = radarSitePanelRef.current;
    if (!el) {
      setRadarSitePanelHeight(0);
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      setRadarSitePanelHeight(el.getBoundingClientRect().height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [selectedRadarSite?.id]);

  // The SPC outlook selector docks above the same bottom-bar stack (see
  // MapView), so it needs to be measured too — the Layers panel and the
  // bar/radar-panel top corners all need to account for it being on top.
  const outlookShowing = (activeMapTab === MAP_TABS.weather || activeMapTab === MAP_TABS.allhazard)
    && Boolean(layers.spcWeatherOutlooks);
  const spcOutlookPanelRef = useRef(null);
  const [spcOutlookPanelHeight, setSpcOutlookPanelHeight] = useState(0);

  useEffect(() => {
    const el = spcOutlookPanelRef.current;
    if (!el) {
      setSpcOutlookPanelHeight(0);
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      setSpcOutlookPanelHeight(el.getBoundingClientRect().height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [outlookShowing]);

  // The Wildfire tab's fire weather outlook selector docks above the bottom
  // bar the same way — measured for the same reasons as the SPC outlook
  // selector above.
  const fireWxOutlookShowing = activeMapTab === MAP_TABS.wildfire && Boolean(layers.fireWeatherOutlooks);
  const fireWxOutlookPanelRef = useRef(null);
  const [fireWxOutlookPanelHeight, setFireWxOutlookPanelHeight] = useState(0);

  useEffect(() => {
    const el = fireWxOutlookPanelRef.current;
    if (!el) {
      setFireWxOutlookPanelHeight(0);
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      setFireWxOutlookPanelHeight(el.getBoundingClientRect().height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fireWxOutlookShowing]);

  // Either radar control can be docked above the bottom bar, and both can be
  // open together (the site popup then stacks flush on top of the timeline),
  // and the SPC/fire-weather outlook selector can dock on top of all of that
  // — so the bar's own "something is attached to my top edge" flag and the
  // Layers panel's clearance both need to account for whichever combination
  // is actually showing.
  const radarBottomBarAttached = radarScrubberAttached || Boolean(selectedRadarSite) || outlookShowing || fireWxOutlookShowing;
  const radarStackHeight = (radarScrubberAttached ? radarTimelineHeight : 0) + (selectedRadarSite ? radarSitePanelHeight : 0);
  const totalDockedHeight = radarStackHeight
    + (outlookShowing ? spcOutlookPanelHeight : 0)
    + (fireWxOutlookShowing ? fireWxOutlookPanelHeight : 0);
  const layerPanelRadarClearance = totalDockedHeight ? totalDockedHeight + 8 : 0;

  return (
    <div className="h-screen w-screen flex flex-col bg-sentinel-900 text-white overflow-hidden select-none">
      <Seo
        title="Live Wildfire Map & Tracker | Sentinel by NWTT"
        description="Track active wildfires in real time with satellite hotspot detection, fire perimeters, containment status, red flag warnings, radar, and air quality — free, from the National Wildfire Tracking Team."
        path="/"
      />
      {/* ── Top bar ── */}
      <Header onRefresh={handleRefresh} />

      {/* ── Active alert banner ── */}
      <AlertBanner dismissed={bannerDismissed} onDismiss={() => setBannerDismissed(true)} />

      {/* ── Main content area (map fills full width; all controls float over it) ── */}
      <div className="flex-1 relative overflow-hidden">
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
            stormMotionVectorsVisible={Boolean(prefs.stormMotionVectors)}
            stormReportsGeoJSON={stormReportsGeoJSON}
            damageAssessmentPointsGeoJSON={damageAssessmentPointsGeoJSON}
            damageAssessmentLinesGeoJSON={damageAssessmentLinesGeoJSON}
            damageAssessmentPolygonsGeoJSON={damageAssessmentPolygonsGeoJSON}
            spcOutlooksGeoJSON={spcOutlooksGeoJSON}
            spcOutlookType={spcOutlookType}
            spcActiveDay={spcActiveDay}
            spcOutlooksLoading={spcOutlooksLoading}
            spcValidTime={spcValidTime}
            onSpcOutlookTypeChange={setSpcOutlookType}
            onSpcActiveDayChange={setSpcActiveDay}
            spcMdGeoJSON={spcMdGeoJSON}
            userReportsGeoJSON={userReportsGeoJSON}
            hazardEventsGeoJSON={hazardEventsGeoJSON}
            evacZonesGeoJSON={evacZonesGeoJSON}
            rawsGeoJSON={rawsGeoJSON}
            airNowMonitorsGeoJSON={airNowMonitorsGeoJSON}
            droughtOutlookGeoJSON={droughtOutlookGeoJSON}
            ndgdSmokeForecastGeoJSON={ndgdSmokeForecastGeoJSON}
            criticalInfrastructureTransGeoJSON={criticalInfrastructureTransGeoJSON}
            criticalInfrastructureGasGeoJSON={criticalInfrastructureGasGeoJSON}
            criticalInfrastructureVisible={criticalInfraEnabled}
            nationalMapCollegesGeoJSON={nationalMapCollegesGeoJSON}
            nationalMapCollegesVisible={schoolsLayerEnabled}
            landOwnershipGeoJSON={landOwnershipGeoJSON}
            landOwnershipVisible={landOwnershipEnabled}
            nhcForecastPointsGeoJSON={nhcForecastPointsGeoJSON}
            nhcForecastTrackGeoJSON={nhcForecastTrackGeoJSON}
            nhcConeGeoJSON={nhcConeGeoJSON}
            nhcWatchWarningGeoJSON={nhcWatchWarningGeoJSON}
            nhcPastPointsGeoJSON={nhcPastPointsGeoJSON}
            nhcPastTrackGeoJSON={nhcPastTrackGeoJSON}
            nhcDisturbancePointsGeoJSON={nhcDisturbancePointsGeoJSON}
            nhcDisturbanceAreasGeoJSON={nhcDisturbanceAreasGeoJSON}
            nhcStormLabelsGeoJSON={nhcStormLabelsGeoJSON}
            fireWeatherOutlooksGeoJSON={fireWeatherOutlooksGeoJSON}
            fireWxOutlookType={fireWxOutlookType}
            fireWxActiveDay={fireWxActiveDay}
            onFireWxOutlookTypeChange={setFireWxOutlookType}
            onFireWxActiveDayChange={setFireWxActiveDay}
            savedLocations={savedLocations}
            measureActive={measureActive}
            measureMode={measureMode}
            onMeasureActivate={onMeasureActivate}
            onMeasureClose={onMeasureClose}
            precipRingActive={precipRingActive}
            onPrecipRingToggle={onPrecipRingToggle}
            waterGaugesGeoJSON={waterGaugesGeoJSON}
            nexradSitesGeoJSON={nexradSitesGeoJSON}
            nexradScanUrl={radarRaster?.dataUrl}
            nexradScanCoordinates={radarRaster?.coordinates}
            nexradCompositeSites={nexradCompositeSites}
            nexradCompositeIsLive={nexradCompositeIsLive}
            nexradCompositeTimelineVisible={(activeMapTab === MAP_TABS.weather || activeMapTab === MAP_TABS.allhazard) && layers.radarComposite}
            nexradCompositeFrames={nexradCompositeFrames}
            nexradCompositeSelectedTimestamp={nexradCompositeSelectedTimestamp}
            nexradCompositeIsPlaying={nexradCompositeIsPlaying}
            nexradCompositeError={nexradCompositeError}
            onNexradCompositeSelectFrame={onNexradCompositeSelectFrame}
            onNexradCompositePlay={onNexradCompositePlay}
            onNexradCompositePause={onNexradCompositePause}
            onNexradCompositePrevious={onNexradCompositePrevious}
            onNexradCompositeNext={onNexradCompositeNext}
            mapBottomBarWidth={mapBottomBarSize.width}
            mapBottomBarHeight={mapBottomBarSize.height}
            radarStackHeight={radarStackHeight}
            radarTimelineRef={radarTimelineRef}
            spcOutlookPanelRef={spcOutlookPanelRef}
            fireWxOutlookPanelRef={fireWxOutlookPanelRef}
            calFireHistoricalPerimetersGeoJSON={calFireHistoricalPerimetersGeoJSON}
            californiaCamerasGeoJSON={californiaCamerasGeoJSON}
            wpcEroGeoJSON={wpcEroGeoJSON}
            wpcWssiGeoJSON={wpcWssiGeoJSON}
            wpcQpfGeoJSON={wpcQpfGeoJSON}
            wpcFrontsGeoJSON={wpcFrontsGeoJSON}
            wpcMpdGeoJSON={wpcMpdGeoJSON}
          />

          <MapCornerButtons />

          <Sidebar
            incidents={nearbyResult ? nearbyResult.incidents : mergedIncidents}
            nearbyAlerts={nearbyResult ? nearbyResult.nwsAlerts : null}
            nearbyOutlooks={sidebarNearbyOutlooks}
            loading={incidentsLoading}
            error={incidentsError}
            activeMapTab={activeMapTab}
            weatherAlertsLoading={alertsLoading}
            weatherAlertsError={alertsError}
            onReopenBanner={() => setBannerDismissed(false)}
            weatherAlertFilter={weatherAlertFilter}
            onWeatherAlertFilterChange={setWeatherAlertFilter}
            onWeatherAlertsRefresh={refreshAlerts}
          />

          <FutureFeaturesPanel mapType={mapType} onMapTypeChange={setMapType} />
          {/* Hidden while the full-height water gauge panel is open, whose close button sits in the same corner. */}
          {!selectedGauge && <AccountButton />}
          <AccountPanel />

          <MapBottomBar
            ref={mapBottomBarRef}
            activeMapTab={activeMapTab}
            onTabChange={handleTabChange}
            infrastructureLayersEntitled={hasProInfrastructureAccess}
            measureActive={measureActive}
            measureMode={measureMode}
            onMeasureActivate={onMeasureActivate}
            onMeasureClose={onMeasureClose}
            precipRingActive={precipRingActive}
            onPrecipRingToggle={onPrecipRingToggle}
            radarScrubberAttached={radarBottomBarAttached}
            radarPanelClearance={layerPanelRadarClearance}
          />

          <Legend
            spcOutlookType={spcOutlookType}
            spcActiveDay={spcActiveDay}
            fireWxOutlookType={fireWxOutlookType}
            radarScanActive={Boolean(selectedRadarSite)}
            radarScanProduct={radarProduct}
          />
          <Suspense fallback={null}>
            {selectedFire && <FireDetailPanel />}
            {selectedGauge && (
              <WaterGaugePanel
                gauge={selectedGauge}
                onClose={() => selectGauge(null)}
              />
            )}
            {selectedRadarSite && (
              <RadarSitePanel
                ref={radarSitePanelRef}
                site={selectedRadarSite}
                product={radarProduct}
                onProductChange={setRadarProduct}
                meta={radarScanMeta}
                status={radarScanStatus}
                error={radarScanError}
                onClose={() => selectRadarSite(null)}
                bottomBarWidth={mapBottomBarSize.width}
                bottomBarHeight={
                  mapBottomBarSize.height + (radarScrubberAttached ? radarTimelineHeight : 0)
                }
                topAttached={outlookShowing}
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

    </div>
  );
}
