/**
 * LiveTrackerPage.jsx
 * Full-screen wildfire tracking dashboard with live map, sidebar, and layer controls.
 * Refactored from the original App.jsx single-page layout.
 */

import { useApp } from '../context/AppContext';
import { nwsAlertCategory } from '../utils/nwsColors';
import { useSavedLocations } from '../hooks/useSavedLocations';
import { useAuth } from '../context/AuthContext';
import AddressSetupScreen from '../components/Auth/AddressSetupScreen';
import { useCallback, useEffect, useMemo, useState } from 'react';

// Data hooks
import { useFireHotspots } from '../hooks/useFireHotspots';
import { useMergedFireData, getFireMatchKey } from '../hooks/useMergedFireData';
import { useAQIData } from '../hooks/useAQIData';
import { useWeatherAlerts } from '../hooks/useWeatherAlerts';
import { useIncidents } from '../hooks/useIncidents';
import { useNwsLsrMapServer } from '../hooks/useNwsLsrMapServer';
import { useSpcOutlooks } from '../hooks/useSpcOutlooks';
import { useSpcMesoscaleDiscussion } from '../hooks/useSpcMesoscaleDiscussion';
import { useFireReports, reportsToGeoJSON } from '../hooks/useFireReports';
import { useCombinedEvacZones } from '../hooks/useCombinedEvacZones';
import { useReporterEvacZones, reporterEvacZonesToGeoJSON } from '../hooks/useReporterEvacZones';
import { useFlightData } from '../hooks/useFlightData';
import { useRAWSData } from '../hooks/useRAWSData';
import { useAirNowMonitors } from '../hooks/useAirNowMonitors';
import { useDroughtOutlook } from '../hooks/useDroughtOutlook';
import { useNdgdSmokeForecast } from '../hooks/useNdgdSmokeForecast';
import { useFireWeatherOutlooks } from '../hooks/useFireWeatherOutlooks';
import { useCriticalInfrastructure } from '../hooks/useCriticalInfrastructure';
import { usePlan } from '../hooks/usePlan';
import { polygonCentroid } from '../utils/geoUtils';

// Components
import Header from '../components/Header/Header';
import AlertBanner from '../components/AlertBanner/AlertBanner';
import Sidebar from '../components/Sidebar/Sidebar';
import MapView from '../components/Map/MapView';
import LayerControl from '../components/LayerControl/LayerControl';
import Legend from '../components/Legend/Legend';
import FireDetailPanel from '../components/FireDetailPanel/FireDetailPanel';

// US continental bounding box for data fetches
const US_BOUNDS = { west: -130, south: 24, east: -65, north: 50 };

const MAP_TABS = {
  wildfire:  'wildfire',
  weather:   'weather',
  locations: 'locations',
};

const WILDFIRE_LAYER_PRESET = {
  fireHotspots: false,
  firePerimeters: true,
  incidentLocations: true,
  weatherAlerts: false,
  aqi: false,
  smoke: false,
  goesEast: false,
  goesWest: false,
  spcWeatherOutlooks: false,
  radar: false,
  evacZones: false,
  reporterEvacZones: true,
  rawsStations: false,
  flights: false,
  airNowMonitors: false,
  ndgdSmokeForecast: false,
  fireWeatherOutlooks: false,
  stormReports: false,
  criticalInfrastructure: false,
};

// Weather tab: only auto-enable NWS alerts (includes SPC MDs on map), and NEXRAD;
// other weather layers are opt-in via the layer panel.
const WEATHER_LAYER_PRESET = {
  fireHotspots: false,
  firePerimeters: false,
  incidentLocations: false,
  weatherAlerts: true,
  aqi: false,
  smoke: false,
  goesEast: false,
  goesWest: false,
  spcWeatherOutlooks: false,
  stormReports: false,
  radar: true,
  criticalInfrastructure: false,
  evacZones: false,
  reporterEvacZones: false,
  rawsStations: false,
  flights: false,
  airNowMonitors: false,
  ndgdSmokeForecast: false,
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

/**
 * Remove fully-contained fires that haven't been updated in 3+ days from an incidents array.
 */
function filterStaleContainedIncidents(incidents) {
  return incidents.filter(inc => !isStaleContained(inc.contained, inc.updated));
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
  const { layers, setLayer, setRefreshed, setLoading, feedFilter, viewport } = useApp();
  const { hasProInfrastructureAccess } = usePlan();
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
    setPrecipRingActive(v => !v);
  }, []);

  useEffect(() => {
    if (!criticalInfraEntitled && layers.criticalInfrastructure) {
      setLayer('criticalInfrastructure', false);
    }
  }, [criticalInfraEntitled, layers.criticalInfrastructure, setLayer]);

  // Apply layer presets only when switching between wildfire/weather tabs.
  // The locations tab keeps whatever layers were already active.
  useEffect(() => {
    if (activeMapTab === MAP_TABS.locations) return;
    const presets = {
      [MAP_TABS.wildfire]: WILDFIRE_LAYER_PRESET,
      [MAP_TABS.weather]:  WEATHER_LAYER_PRESET,
    };
    const preset = presets[activeMapTab];
    if (!preset) return;
    Object.entries(preset).forEach(([layer, value]) => {
      setLayer(layer, value);
    });
    if (activeMapTab === MAP_TABS.weather) {
      setWeatherAlertFilter('all');
    }
  }, [activeMapTab, setLayer]);


  // ── Data feeds ──
  const {
    geoJSON: hotspotsGeoJSON,
    loading: hotspotsLoading,
    count: hotspotsCount,
    sourceCounts: hotspotsSourceCounts,
    refresh: refreshHotspots,
  } = useFireHotspots(US_BOUNDS);

  const {
    perimetersGeoJSON,
    incidentDotsGeoJSON,
    loading: perimetersLoading,
    perimetersCount,
    dotsCount,
    refresh: refreshPerimeters,
  } = useMergedFireData(5);

  const {
    geoJSON: aqiGeoJSON,
    refresh: refreshAQI,
  } = useAQIData(layers.aqi);

  const {
    geoJSON: alertsGeoJSON,
    loading: alertsLoading,
    error: alertsError,
    refresh: refreshAlerts,
  } = useWeatherAlerts();

  const filteredAlertsGeoJSON = useMemo(() => {
    if (weatherAlertFilter === 'all' || !alertsGeoJSON?.features) return alertsGeoJSON;
    return {
      ...alertsGeoJSON,
      features: alertsGeoJSON.features.filter(
        f => nwsAlertCategory(f.properties.type) === weatherAlertFilter
      ),
    };
  }, [alertsGeoJSON, weatherAlertFilter]);

  const {
    incidents,
    geoJSON: incidentsGeoJSON,
    loading: incidentsLoading,
    error: incidentsError,
    refresh: refreshIncidents,
  } = useIncidents(0.1);

  const {
    geoJSON: stormReportsGeoJSON,
    refresh: refreshStormReports,
  } = useNwsLsrMapServer(activeMapTab === MAP_TABS.weather && layers.stormReports);

  const [spcOutlookType, setSpcOutlookType] = useState('categorical');
  const [spcActiveDay,   setSpcActiveDay]   = useState('day1');
  const [spcWeatherOutlookMode, setSpcWeatherOutlookMode] = useState('convective');

  const {
    geoJSON:   spcOutlooksGeoJSON,
    loading:   spcOutlooksLoading,
    validTime: spcValidTime,
    refresh:   refreshSpcOutlooks,
  } = useSpcOutlooks(
    layers.spcWeatherOutlooks && spcWeatherOutlookMode === 'convective' && activeMapTab === MAP_TABS.weather,
    spcActiveDay,
    spcOutlookType
  );

  const {
    geoJSON:  spcMdGeoJSON,
    refresh:  refreshSpcMd,
  } = useSpcMesoscaleDiscussion(activeMapTab === MAP_TABS.weather && layers.weatherAlerts);

  // California evacuation zones – combined CalOES hosted-view + PROD feed
  const {
    geoJSON: evacZonesGeoJSON,
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

const flightBounds = useMemo(() => {
  if (!viewport) return null;

  const lng = Number(viewport.longitude);
  const lat = Number(viewport.latitude);
  const zoom = Number(viewport.zoom ?? 0);

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

  let lonSpan = 360 / Math.pow(2, zoom - 1);
  let latSpan = 170 / Math.pow(2, zoom - 1);

  lonSpan = Math.max(lonSpan, 8);
  latSpan = Math.max(latSpan, 6);

  return {
    west: lng - lonSpan / 2,
    east: lng + lonSpan / 2,
    south: lat - latSpan / 2,
    north: lat + latSpan / 2,
    zoom,
  };
}, [viewport]);

  // Live flight tracking (OpenSky Network ADS-B)
  const {
    geoJSON: flightsGeoJSON,
    loading: flightsLoading,
    error: flightsError,
    refresh: refreshFlights,
} = useFlightData(flightBounds, layers.flights);

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
  } = useNdgdSmokeForecast(layers.ndgdSmokeForecast && activeMapTab === MAP_TABS.wildfire);

  const criticalInfraEnabled = Boolean(layers.criticalInfrastructure && criticalInfraEntitled);
  const {
    transmissionGeoJSON: criticalInfrastructureTransGeoJSON,
    gasPipelinesGeoJSON: criticalInfrastructureGasGeoJSON,
    refresh: refreshCriticalInfrastructure,
  } = useCriticalInfrastructure(criticalInfraEnabled, viewport);

  // SPC Fire Weather Outlooks – day/type selector state
  const [fireWxOutlookType, setFireWxOutlookType] = useState('winds_low_humidity');
  const [fireWxActiveDay,   setFireWxActiveDay]   = useState('day1');

  const {
    geoJSON:   fireWeatherOutlooksGeoJSON,
    loading:   fireWeatherOutlooksLoading,
    validTime: fireWxValidTime,
    refresh:   refreshFireWeatherOutlooks,
  } = useFireWeatherOutlooks(
    (layers.fireWeatherOutlooks && activeMapTab === MAP_TABS.wildfire)
      || (layers.spcWeatherOutlooks && spcWeatherOutlookMode === 'fireWx' && activeMapTab === MAP_TABS.weather),
    fireWxActiveDay,
    fireWxOutlookType
  );

  useEffect(() => {
    if (flightsError) console.error('[FlightTracking] Error:', flightsError);
  }, [flightsError]);

  // Community-submitted reports – only approved ones, realtime-subscribed
  const { reports: approvedReports, refresh: refreshUserReports } = useFireReports('approved');
  const reporterReports = useMemo(
    () => (activeMapTab === MAP_TABS.wildfire ? approvedReports : []),
    [activeMapTab, approvedReports]
  );
  const userReportsGeoJSON = useMemo(
    () => reportsToGeoJSON(reporterReports),
    [reporterReports]
  );

  // ── Remove stale fully-contained fires (100% contained, no update in 3+ days) ──
  const freshIncidents = useMemo(
    () => filterStaleContainedIncidents(incidents),
    [incidents]
  );

  const freshIncidentsGeoJSON = useMemo(
    () => filterStaleContainedGeoJSON(incidentsGeoJSON, 'contained', 'updated'),
    [incidentsGeoJSON]
  );

  const freshPerimetersGeoJSON = useMemo(
    () => filterStaleContainedGeoJSON(perimetersGeoJSON, 'PercentContained', 'ModifiedOnDateTime'),
    [perimetersGeoJSON]
  );

  const freshIncidentDotsGeoJSON = useMemo(
    () => filterStaleContainedGeoJSON(incidentDotsGeoJSON, 'PercentContained', 'ModifiedOnDateTime'),
    [incidentDotsGeoJSON]
  );

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
    const irwinKeys = new Set(incidents.map(i => getFireMatchKey(i.name)).filter(Boolean));
    return filteredPerimetersGeoJSON.features
      .filter(f => {
        const key = getFireMatchKey(f.properties.IncidentName);
        return key && !irwinKeys.has(key);
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
  }, [filteredPerimetersGeoJSON, incidents]);

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
    () => [...incidents, ...perimeterOnlyIncidents],
    [incidents, perimeterOnlyIncidents]
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

  // ── Global loading state ──
  const anyLoading = hotspotsLoading || perimetersLoading || incidentsLoading;
  useEffect(() => { setLoading(anyLoading); }, [anyLoading, setLoading]);
  useEffect(() => {
    if (!anyLoading) setRefreshed(new Date());
  }, [anyLoading, setRefreshed]);

  // ── Manual refresh ──
  const handleRefresh = useCallback(() => {
    refreshHotspots();
    refreshPerimeters();
    refreshAlerts();
    refreshIncidents();
    if (activeMapTab === MAP_TABS.weather && layers.stormReports) {
      refreshStormReports();
    }
    refreshSpcOutlooks();
    refreshSpcMd();
    refreshUserReports();
    refreshEvacZones();
    refreshReporterEvacZones();
    if (layers.aqi) refreshAQI();
    if (layers.flights) refreshFlights();
    if (rawsEnabled) refreshRAWS();
    if (layers.airNowMonitors) refreshAirNowMonitors();
    if (layers.droughtOutlook) refreshDroughtOutlook();
    if (layers.ndgdSmokeForecast && activeMapTab === MAP_TABS.wildfire) refreshNdgdSmokeForecast();
    if (criticalInfraEnabled) refreshCriticalInfrastructure();
    if (layers.fireWeatherOutlooks || (layers.spcWeatherOutlooks && spcWeatherOutlookMode === 'fireWx')) {
      refreshFireWeatherOutlooks();
    }
  }, [
    refreshHotspots, refreshPerimeters, refreshAlerts, refreshIncidents, refreshStormReports,
    refreshSpcMd, refreshSpcOutlooks, refreshUserReports, refreshEvacZones, refreshReporterEvacZones,
    refreshAQI, refreshFlights, refreshRAWS, refreshAirNowMonitors, refreshDroughtOutlook, refreshNdgdSmokeForecast, refreshFireWeatherOutlooks,
    refreshCriticalInfrastructure,
    activeMapTab, layers.aqi, layers.flights, rawsEnabled, layers.airNowMonitors, layers.droughtOutlook, layers.ndgdSmokeForecast,
    layers.fireWeatherOutlooks, layers.spcWeatherOutlooks, spcWeatherOutlookMode, layers.stormReports,
    criticalInfraEnabled,
  ]);

  return (
    <div className="h-screen w-screen flex flex-col bg-sentinel-900 text-white overflow-hidden select-none">
      {/* ── Top bar ── */}
      <Header onRefresh={handleRefresh} />

      {/* ── Active alert banner ── */}
      <AlertBanner dismissed={bannerDismissed} onDismiss={() => setBannerDismissed(true)} />

      {/* ── Main content area ── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left sidebar */}
        <Sidebar
          incidents={mergedIncidents}
          loading={incidentsLoading}
          error={incidentsError}
          activeMapTab={activeMapTab}
          onTabChange={setActiveMapTab}
          weatherAlertsLoading={alertsLoading}
          weatherAlertsError={alertsError}
          onReopenBanner={() => setBannerDismissed(false)}
          weatherAlertFilter={weatherAlertFilter}
          onWeatherAlertFilterChange={setWeatherAlertFilter}
        />

        {/* Map area */}
        <div className="flex-1 relative overflow-hidden">
          <MapView
            activeMapTab={activeMapTab}
            mapType={mapType}
            hotspotsGeoJSON={hotspotsGeoJSON}
            perimetersGeoJSON={filteredPerimetersGeoJSON}
            incidentsGeoJSON={deduplicatedIncidentsGeoJSON}
            incidentDotsGeoJSON={finalIncidentDotsGeoJSON}
            aqiGeoJSON={aqiGeoJSON}
            alertsGeoJSON={filteredAlertsGeoJSON}
            stormReportsGeoJSON={stormReportsGeoJSON}
            spcOutlooksGeoJSON={spcOutlooksGeoJSON}
            spcOutlookType={spcOutlookType}
            spcActiveDay={spcActiveDay}
            spcOutlooksLoading={spcOutlooksLoading}
            spcValidTime={spcValidTime}
            onSpcOutlookTypeChange={setSpcOutlookType}
            onSpcActiveDayChange={setSpcActiveDay}
            spcMdGeoJSON={spcMdGeoJSON}
            userReportsGeoJSON={userReportsGeoJSON}
            evacZonesGeoJSON={evacZonesGeoJSON}
            reporterEvacZonesGeoJSON={reporterEvacZonesGeoJSON}
            flightsGeoJSON={flightsGeoJSON}
            rawsGeoJSON={rawsGeoJSON}
            airNowMonitorsGeoJSON={airNowMonitorsGeoJSON}
            droughtOutlookGeoJSON={droughtOutlookGeoJSON}
            ndgdSmokeForecastGeoJSON={ndgdSmokeForecastGeoJSON}
            criticalInfrastructureTransGeoJSON={criticalInfrastructureTransGeoJSON}
            criticalInfrastructureGasGeoJSON={criticalInfrastructureGasGeoJSON}
            criticalInfrastructureVisible={criticalInfraEnabled}
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
          />

          <LayerControl
            activeMapTab={activeMapTab}
            infrastructureLayersEntitled={hasProInfrastructureAccess}
            mapType={mapType}
            onMapTypeChange={setMapType}
            measureActive={measureActive}
            measureMode={measureMode}
            onMeasureActivate={onMeasureActivate}
            onMeasureClose={onMeasureClose}
            precipRingActive={precipRingActive}
            onPrecipRingToggle={onPrecipRingToggle}
          />

          <Legend
            spcOutlookType={spcOutlookType}
            spcActiveDay={spcActiveDay}
            spcWeatherOutlookMode={spcWeatherOutlookMode}
            fireWxOutlookType={fireWxOutlookType}
          />
          <FireDetailPanel />

          {/* Bug report button – fixed to bottom-right of map area */}
          <a
            href="https://docs.google.com/forms/d/e/1FAIpQLSej35yFro7KsQ349MzgQ6Lek4_M67qfoK59UFssX9CaTKf07Q/viewform?usp=header"
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-8 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-black/70 hover:bg-black/90 text-white border border-white/20 shadow-lg backdrop-blur-sm transition-colors"
            title="Report a bug"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2h8l1 4H7L8 2z"/>
              <path d="M12 6v4"/>
              <circle cx="12" cy="14" r="6"/>
              <path d="M6 14H2M22 14h-4"/>
              <path d="M12 20v2"/>
              <path d="M6.34 17.66l-2.83 2.83M20.49 3.51l-2.83 2.83"/>
              <path d="M17.66 17.66l2.83 2.83M3.51 3.51l2.83 2.83"/>
            </svg>
            Report Bug
          </a>
        </div>
      </div>

    </div>
  );
}
