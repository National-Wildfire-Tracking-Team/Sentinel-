/**
 * LiveTrackerPage.jsx
 * Full-screen wildfire tracking dashboard with live map, sidebar, and layer controls.
 * Refactored from the original App.jsx single-page layout.
 */

import { useApp } from '../context/AppContext';
import { nwsAlertCategory } from '../utils/nwsColors';
import { FIRE_WEATHER_ALERT_TYPES } from '../api/noaaWeather';
import { useSavedLocations } from '../hooks/useSavedLocations';
import { useCallback, useEffect, useMemo, useState } from 'react';

// Data hooks
import { useFireHotspots } from '../hooks/useFireHotspots';
import { useNgfsDetections } from '../hooks/useNgfsDetections';
import { useMergedFireData, getFireMatchKey } from '../hooks/useMergedFireData';
import { useAQIData } from '../hooks/useAQIData';
import { useWeatherAlerts } from '../hooks/useWeatherAlerts';
import { useIncidents } from '../hooks/useIncidents';
import { useCalFireIncidents } from '../hooks/useCalFireIncidents';
import { useNwsLsrMapServer } from '../hooks/useNwsLsrMapServer';
import { useDamageAssessment } from '../hooks/useDamageAssessment';
import { useSpcOutlooks } from '../hooks/useSpcOutlooks';
import { useSpcMesoscaleDiscussion } from '../hooks/useSpcMesoscaleDiscussion';
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
import { usePlan } from '../../shared/hooks/usePlan';
import { useWaterGauges } from '../hooks/useWaterGauges';
import { useNexradSites } from '../hooks/useNexradSites';
import { useNexradScan } from '../hooks/useNexradScan';
import { useCaliforniaCameras } from '../hooks/useCaliforniaCameras';
import { rasterizeSweep } from '../utils/radarRaster';
import { useCalFirePerimeters } from '../hooks/useCalFirePerimeters';
import { polygonCentroid } from '../utils/geoUtils';
import { incidentsToGeoJSON } from '../api/inciweb';

// Components
import Header from '../components/Header/Header';
import AlertBanner from '../components/AlertBanner/AlertBanner';
import Sidebar from '../components/Sidebar/Sidebar';
import MapView from '../components/Map/MapView';
import MapBottomBar from '../components/BottomBar/MapBottomBar';
import MapCornerButtons from '../components/MapControls/MapCornerButtons';
import FutureFeaturesPanel from '../components/MapControls/FutureFeaturesPanel';
import AccountPanel from '../components/AccountPanel/AccountPanel';
import Legend from '../components/Legend/Legend';
import FireDetailPanel from '../components/FireDetailPanel/FireDetailPanel';
import WaterGaugePanel from '../components/WaterGaugePanel/WaterGaugePanel';
import RadarSitePanel from '../components/RadarSitePanel/RadarSitePanel';
import CameraPanel from '../components/CameraPanel/CameraPanel';

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
};

// Weather tab: only auto-enable NWS alerts (includes SPC MDs on map);
// other weather layers, including NEXRAD, are opt-in via the layer panel.
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
  radar: false,
  criticalInfrastructure: false,
  evacZones: true,
  rawsStations: false,
  airNowMonitors: false,
  ndgdSmokeForecast: false,
  schoolsUniversities: false,
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

/**
 * Combine IRWIN national incidents with CAL FIRE GeoJsonList.
 * When both list the same fire (normalized name), IRWIN wins for authoritative stats.
 */
function mergeIrwinAndCalFireIncidents(irwinIncidents, calFireIncidents) {
  const seen = new Set();
  const out = [];
  irwinIncidents.forEach(inc => {
    const key = getFireMatchKey(inc.name);
    if (key) seen.add(key);
    out.push(inc);
  });
  calFireIncidents.forEach(inc => {
    const key = getFireMatchKey(inc.name);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    out.push(inc);
  });
  return out.sort((a, b) => b.acres - a.acres);
}

// RAWS stations load once the map is zoomed in to roughly county scale
const RAWS_MIN_ZOOM = 9;

export default function LiveTrackerPage() {
  const { layers, setLayer, setRefreshed, setLoading, feedFilter, viewport, selectedGauge, selectGauge, selectedFire, selectedRadarSite, selectRadarSite, selectedCamera, selectCamera, wpcOutlookDay } = useApp();
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

  // Radar: single "Radar" toggle (layers.radar) gates the mini control bar;
  // radarMode picks which sub-layer it drives — the national composite
  // mosaic (live only), or individual NEXRAD site markers + their Level 2
  // scans (live or scrubbed back through that site's own history).
  const [radarMode, setRadarMode] = useState('composite');
  const [radarExpanded, setRadarExpanded] = useState(false);
  const [radarSiteMinutesAgo, setRadarSiteMinutesAgo] = useState(0);

  const onMeasureActivate = useCallback((mode) => {
    setMeasureMode(mode);
    setMeasureActive(true);
  }, []);

  const onMeasureClose = useCallback(() => {
    setMeasureActive(false);
  }, []);

  const onPrecipRingToggle = useCallback(() => {
    if (!precipRingActive) {
      setLayer('radar', true);
      setRadarMode('composite');
    }
    setPrecipRingActive(!precipRingActive);
  }, [precipRingActive, setLayer]);

  const onRadarExpandedToggle = useCallback(() => {
    setRadarExpanded((expanded) => !expanded);
  }, []);

  useEffect(() => {
    if (activeMapTab !== MAP_TABS.weather && activeMapTab !== MAP_TABS.allhazard) {
      setPrecipRingActive(false);
    }
  }, [activeMapTab]);

  // Radar turned off entirely → reset mode/expansion for next time.
  useEffect(() => {
    if (!layers.radar) {
      setRadarMode('composite');
      setRadarExpanded(false);
    }
  }, [layers.radar]);

  // Leaving site mode (or radar off) closes any open site radar panel.
  useEffect(() => {
    if (radarMode !== 'site') selectRadarSite(null);
  }, [radarMode, selectRadarSite]);

  // A freshly-selected site (or no site) always starts live.
  useEffect(() => {
    setRadarSiteMinutesAgo(0);
  }, [selectedRadarSite?.id]);

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
    Object.entries(preset).forEach(([layer, value]) => {
      setLayer(layer, value);
    });
    if (activeMapTab === MAP_TABS.weather || activeMapTab === MAP_TABS.allhazard) {
      setWeatherAlertFilter('all');
    }
  }, [activeMapTab, setLayer]);


  // ── Data feeds ──
  const wildfireDataEnabled = activeMapTab !== MAP_TABS.weather;
  const weatherDataEnabled = activeMapTab === MAP_TABS.weather || activeMapTab === MAP_TABS.allhazard;

  const {
    geoJSON: hotspotsGeoJSON,
    loading: hotspotsLoading,
    count: hotspotsCount,
    sourceCounts: hotspotsSourceCounts,
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
    perimetersCount,
    dotsCount,
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
    alertCount,
    geoCount,
    lastRefresh: alertsLastRefresh,
    refresh: refreshAlerts,
  } = useWeatherAlerts();

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
  const [spcWeatherOutlookMode, setSpcWeatherOutlookMode] = useState('convective');

  const {
    geoJSON:   spcOutlooksGeoJSON,
    loading:   spcOutlooksLoading,
    validTime: spcValidTime,
    refresh:   refreshSpcOutlooks,
  } = useSpcOutlooks(
    layers.spcWeatherOutlooks && spcWeatherOutlookMode === 'convective' && weatherDataEnabled,
    spcActiveDay,
    spcOutlookType
  );

  const {
    geoJSON:  spcMdGeoJSON,
    refresh:  refreshSpcMd,
  } = useSpcMesoscaleDiscussion(weatherDataEnabled && layers.weatherAlerts);

  // Active evacuation zones from the CalOES hosted view and IPAWS
  const {
    geoJSON: officialEvacZonesGeoJSON,
    refresh: refreshEvacZones,
  } = useCombinedEvacZones();

  // Reporter-drawn evacuation zones (Supabase, active only)
  const {
    zones: reporterEvacZoneRows,
    refresh: refreshReporterEvacZones,
  } = useReporterEvacZones('active');
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

  // SPC Fire Weather Outlooks – day/type selector state
  const [fireWxOutlookType, setFireWxOutlookType] = useState('winds_low_humidity');
  const [fireWxActiveDay,   setFireWxActiveDay]   = useState('day1');

  const {
    geoJSON:   fireWeatherOutlooksGeoJSON,
    loading:   fireWeatherOutlooksLoading,
    validTime: fireWxValidTime,
    refresh:   refreshFireWeatherOutlooks,
  } = useFireWeatherOutlooks(
    layers.fireWeatherOutlooks
      || (layers.spcWeatherOutlooks && spcWeatherOutlookMode === 'fireWx' && weatherDataEnabled),
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

  // NWS NEXRAD Level 2 radar sites — live operability status
  const {
    geoJSON: nexradSitesGeoJSON,
  } = useNexradSites(layers.radar && radarMode === 'site');

  // Live California highway cameras — Caltrans District CCTV
  const {
    geoJSON: californiaCamerasGeoJSON,
  } = useCaliforniaCameras(layers.wildfireCameras);

  // Level II sweep for whichever radar site is currently selected — live, or
  // scrubbed back through that site's own history via radarSiteMinutesAgo.
  const [radarProduct, setRadarProduct] = useState('reflectivity');
  useEffect(() => {
    setRadarProduct('reflectivity');
  }, [selectedRadarSite?.id]);

  const { meta: radarScanMeta, payload: radarScanPayload, status: radarScanStatus, error: radarScanError } =
    useNexradScan(selectedRadarSite?.id, radarProduct, Boolean(selectedRadarSite), radarSiteMinutesAgo);

  const radarRaster = useMemo(
    () => (selectedRadarSite && radarScanPayload
      ? rasterizeSweep(radarScanPayload, { lat: selectedRadarSite.lat, lng: selectedRadarSite.lng })
      : null),
    [selectedRadarSite, radarScanPayload]
  );

  // Community-submitted reports – only approved ones, realtime-subscribed
  const { reports: approvedReports, refresh: refreshUserReports } = useFireReports('approved');
  const reporterReports = useMemo(
    () => (activeMapTab === MAP_TABS.wildfire || activeMapTab === MAP_TABS.allhazard ? approvedReports : []),
    [activeMapTab, approvedReports]
  );
  const userReportsGeoJSON = useMemo(
    () => reportsToGeoJSON(reporterReports),
    [reporterReports]
  );

  // Community-submitted hazard events – wildfire, flooding, hazmat, other
  const { events: activeHazardEvents } = useHazardEvents('active');
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
      ? filterActiveFiresGeoJSON(freshPerimetersGeoJSON, { containedKey: 'PercentContained' })
      : freshPerimetersGeoJSON
  ), [isFocused, freshPerimetersGeoJSON]);

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
  const fireFeaturesForModeling = useMemo(() => ({
    type: 'FeatureCollection',
    features: [
      ...(filteredPerimetersGeoJSON?.features || []),
      ...(finalIncidentDotsGeoJSON?.features || []),
    ],
  }), [filteredPerimetersGeoJSON, finalIncidentDotsGeoJSON]);

  const selectedFireId = ['incident', 'perimeter'].includes(selectedFire?.type) ? selectedFire.id : null;
  const { geoJSON: fireBehaviorModelingGeoJSON } = useFireBehaviorModeling(
    layers.fireBehaviorModeling && hasFireBehaviorModelingAccess,
    fireFeaturesForModeling,
    selectedFireId
  );

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
    if (layers.fireWeatherOutlooks || (layers.spcWeatherOutlooks && spcWeatherOutlookMode === 'fireWx')) {
      refreshFireWeatherOutlooks();
    }
    if (nhcTropicalWeatherEnabled) {
      refreshNhcTropicalWeather();
    }
    if (weatherDataEnabled && layers.wpcEro) refreshWpcEro();
    if (weatherDataEnabled && layers.wpcWssi) refreshWpcWssi();
    if (weatherDataEnabled && layers.wpcQpf) refreshWpcQpf();
    if (weatherDataEnabled && layers.wpcFronts) refreshWpcFronts();
  }, [
    refreshHotspots, refreshNgfs, refreshPerimeters, refreshAlerts, refreshIncidents, refreshCalFireIncidents, refreshStormReports,
    refreshDamageAssessment,
    refreshSpcMd, refreshSpcOutlooks, refreshUserReports, refreshEvacZones, refreshReporterEvacZones,
    refreshAQI, refreshRAWS, refreshAirNowMonitors, refreshDroughtOutlook, refreshNdgdSmokeForecast, refreshFireWeatherOutlooks,
    refreshCriticalInfrastructure,
    refreshNationalMapColleges,
    refreshNhcTropicalWeather,
    refreshWpcEro, refreshWpcWssi, refreshWpcQpf, refreshWpcFronts,
    layers.wpcEro, layers.wpcWssi, layers.wpcQpf, layers.wpcFronts,
    activeMapTab, weatherDataEnabled, damageAssessmentEnabled, layers.aqi, rawsEnabled, layers.airNowMonitors, layers.droughtOutlook, layers.ndgdSmokeForecast,
    layers.fireWeatherOutlooks, layers.spcWeatherOutlooks, spcWeatherOutlookMode, layers.stormReports,
    nhcTropicalWeatherEnabled,
    criticalInfraEnabled,
    schoolsLayerEnabled,
  ]);

  return (
    <div className="h-screen w-screen flex flex-col bg-sentinel-900 text-white overflow-hidden select-none">
      {/* ── Top bar ── */}
      <Header onRefresh={handleRefresh} />

      {/* ── Active alert banner ── */}
      <AlertBanner dismissed={bannerDismissed} onDismiss={() => setBannerDismissed(true)} />

      {/* ── Main content area (map fills full width; all controls float over it) ── */}
      <div className="flex-1 relative overflow-hidden">
        <MapView
            activeMapTab={activeMapTab}
            mapType={mapType}
            hotspotsGeoJSON={hotspotsGeoJSON}
            ngfsGeoJSON={ngfsGeoJSON}
            perimetersGeoJSON={filteredPerimetersGeoJSON}
            incidentsGeoJSON={deduplicatedIncidentsGeoJSON}
            incidentDotsGeoJSON={finalIncidentDotsGeoJSON}
            fireBehaviorModelingGeoJSON={fireBehaviorModelingGeoJSON}
            aqiGeoJSON={aqiGeoJSON}
            alertsGeoJSON={filteredAlertsGeoJSON}
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
            fireWeatherOutlooksLoading={fireWeatherOutlooksLoading}
            fireWxValidTime={fireWxValidTime}
            onFireWxOutlookTypeChange={setFireWxOutlookType}
            onFireWxActiveDayChange={setFireWxActiveDay}
            spcWeatherOutlookMode={spcWeatherOutlookMode}
            onSpcWeatherOutlookModeChange={setSpcWeatherOutlookMode}
            savedLocations={savedLocations}
            measureActive={measureActive}
            measureMode={measureMode}
            onMeasureActivate={onMeasureActivate}
            onMeasureClose={onMeasureClose}
            precipRingActive={precipRingActive}
            onPrecipRingToggle={onPrecipRingToggle}
            waterGaugesGeoJSON={waterGaugesGeoJSON}
            nexradSitesGeoJSON={nexradSitesGeoJSON}
            radarMode={radarMode}
            nexradScanUrl={radarRaster?.dataUrl}
            nexradScanCoordinates={radarRaster?.coordinates}
            calFireHistoricalPerimetersGeoJSON={calFireHistoricalPerimetersGeoJSON}
            californiaCamerasGeoJSON={californiaCamerasGeoJSON}
            wpcEroGeoJSON={wpcEroGeoJSON}
            wpcWssiGeoJSON={wpcWssiGeoJSON}
            wpcQpfGeoJSON={wpcQpfGeoJSON}
            wpcFrontsGeoJSON={wpcFrontsGeoJSON}
          />

          <MapCornerButtons />

          <Sidebar
            incidents={mergedIncidents}
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

          <AccountPanel />

          <MapBottomBar
            activeMapTab={activeMapTab}
            onTabChange={setActiveMapTab}
            infrastructureLayersEntitled={hasProInfrastructureAccess}
            mapType={mapType}
            onMapTypeChange={setMapType}
            measureActive={measureActive}
            measureMode={measureMode}
            onMeasureActivate={onMeasureActivate}
            onMeasureClose={onMeasureClose}
            precipRingActive={precipRingActive}
            onPrecipRingToggle={onPrecipRingToggle}
            radarMode={radarMode}
            onRadarModeChange={setRadarMode}
            radarExpanded={radarExpanded}
            onRadarExpandedToggle={onRadarExpandedToggle}
          />

          <Legend
            spcOutlookType={spcOutlookType}
            spcActiveDay={spcActiveDay}
            spcWeatherOutlookMode={spcWeatherOutlookMode}
            fireWxOutlookType={fireWxOutlookType}
            radarScanActive={Boolean(selectedRadarSite)}
            radarScanProduct={radarProduct}
            radarMode={radarMode}
          />
          <FireDetailPanel />
          {selectedGauge && (
            <WaterGaugePanel
              gauge={selectedGauge}
              onClose={() => selectGauge(null)}
            />
          )}
          {selectedRadarSite && (
            <RadarSitePanel
              site={selectedRadarSite}
              product={radarProduct}
              onProductChange={setRadarProduct}
              meta={radarScanMeta}
              status={radarScanStatus}
              error={radarScanError}
              onClose={() => selectRadarSite(null)}
              historyMinutesAgo={radarSiteMinutesAgo}
              onHistoryMinutesAgoChange={setRadarSiteMinutesAgo}
            />
          )}
          {selectedCamera && (
            <CameraPanel
              camera={selectedCamera}
              onClose={() => selectCamera(null)}
            />
          )}
      </div>

    </div>
  );
}
