/**
 * LiveTrackerPage.jsx
 * Full-screen wildfire tracking dashboard with live map, sidebar, and layer controls.
 * Refactored from the original App.jsx single-page layout.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';

// Data hooks
import { useFireHotspots } from '../hooks/useFireHotspots';
import { useMergedFireData, getFireMatchKey } from '../hooks/useMergedFireData';
import { useAQIData } from '../hooks/useAQIData';
import { useWeatherAlerts } from '../hooks/useWeatherAlerts';
import { useIncidents } from '../hooks/useIncidents';
import { useStormReports } from '../hooks/useStormReports';
import { useSpcOutlooks } from '../hooks/useSpcOutlooks';
import { useFireReports, reportsToGeoJSON } from '../hooks/useFireReports';

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
  wildfire: 'wildfire',
  weather: 'weather',
};

const WILDFIRE_LAYER_PRESET = {
  fireHotspots: true,
  firePerimeters: true,
  incidentLocations: true,
  userReports: true,
  weatherAlerts: false,
  aqi: false,
  smoke: false,
  goesEast: false,
  goesWest: false,
  spcOutlooks: false,
  radar: false,
};

const WEATHER_LAYER_PRESET = {
  fireHotspots: false,
  firePerimeters: false,
  incidentLocations: false,
  userReports: false,
  weatherAlerts: true,
  aqi: true,
  smoke: true,
  goesEast: true,
  goesWest: false,
  spcOutlooks: true,
  radar: true,
};

/** Filter a GeoJSON FeatureCollection, removing old (>72h) or mostly contained (>95%) fires. */
function filterFireGeoJSON(geoJSON, { containedKey, updatedKey, startedKey }) {
  if (!geoJSON?.features) return geoJSON;
  const cutoffMs = Date.now() - (72 * 60 * 60 * 1000);
  return {
    ...geoJSON,
    features: geoJSON.features.filter(f => {
      const p = f.properties;
      const contained = Number(p[containedKey]) || 0;
      if (contained > 95) return false;
      const updatedMs = p[updatedKey] ? new Date(p[updatedKey]).getTime() : 0;
      const startedMs = p[startedKey] ? new Date(p[startedKey]).getTime() : 0;
      const mostRecentMs = Math.max(updatedMs, startedMs);
      if (mostRecentMs > 0 && mostRecentMs < cutoffMs) return false;
      return true;
    }),
  };
}

export default function LiveTrackerPage() {
  const { layers, setLayer, setRefreshed, setLoading, feedFilter } = useApp();
  const [activeMapTab, setActiveMapTab] = useState(MAP_TABS.wildfire);

  // Apply layer presets only when the active tab changes
  useEffect(() => {
    const presets = {
      [MAP_TABS.wildfire]: WILDFIRE_LAYER_PRESET,
      [MAP_TABS.weather]:  WEATHER_LAYER_PRESET,
    };
    const preset = presets[activeMapTab] || WILDFIRE_LAYER_PRESET;
    Object.entries(preset).forEach(([layer, value]) => {
      setLayer(layer, value);
    });
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
  } = useMergedFireData(100);

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

  const {
    incidents,
    geoJSON: incidentsGeoJSON,
    loading: incidentsLoading,
    error: incidentsError,
    refresh: refreshIncidents,
  } = useIncidents(0.1);

  const {
    spcGeoJSON,
    iemGeoJSON,
    refresh: refreshStormReports,
  } = useStormReports(activeMapTab === MAP_TABS.weather);

  const {
    geoJSON: spcOutlooksGeoJSON,
    refresh: refreshSpcOutlooks,
  } = useSpcOutlooks(activeMapTab === MAP_TABS.weather);

  // Community-submitted reports – only approved ones, realtime-subscribed
  const { reports: approvedReports, refresh: refreshUserReports } = useFireReports('approved');
  const userReportsGeoJSON = useMemo(
    () => reportsToGeoJSON(approvedReports),
    [approvedReports]
  );

  // ── Apply feed filter to map fire layers ──
  const isFocused = feedFilter === 'focused';

  const filteredIncidentsGeoJSON = useMemo(() => {
    if (!isFocused) return incidentsGeoJSON;
    return filterFireGeoJSON(incidentsGeoJSON, {
      containedKey: 'contained',
      updatedKey: 'updated',
      startedKey: 'started',
    });
  }, [isFocused, incidentsGeoJSON]);

  const filteredPerimetersGeoJSON = useMemo(() => {
    if (!isFocused) return perimetersGeoJSON;
    return filterFireGeoJSON(perimetersGeoJSON, {
      containedKey: 'PercentContained',
      updatedKey: 'ModifiedOnDateTime',
      startedKey: 'FireDiscoveryDateTime',
    });
  }, [isFocused, perimetersGeoJSON]);

  const filteredIncidentDotsGeoJSON = useMemo(() => {
    if (!isFocused) return incidentDotsGeoJSON;
    return filterFireGeoJSON(incidentDotsGeoJSON, {
      containedKey: 'PercentContained',
      updatedKey: 'ModifiedOnDateTime',
      startedKey: 'FireDiscoveryDateTime',
    });
  }, [isFocused, incidentDotsGeoJSON]);

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

  // ── Reporter incidents replace matching external data incidents ──
  // When an approved reporter report shares a fire name with an IRWIN incident,
  // the external incident is replaced in the sidebar feed with a merged record
  // that keeps authoritative external stats but surfaces reporter-contributed data.
  const mergedIncidents = useMemo(() => {
    if (!approvedReports.length) return incidents;

    // Index reporter reports by normalised fire name key (same algorithm used
    // in useMergedFireData to match perimeters to incident dots).
    const reporterByKey = new Map();
    approvedReports.forEach(r => {
      const key = getFireMatchKey(r.title);
      if (key) reporterByKey.set(key, r);
    });

    return incidents.map(inc => {
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
  }, [incidents, approvedReports]);

  // Build the set of reporter-matched fire name keys once for GeoJSON filtering.
  const reporterMatchKeys = useMemo(() => {
    if (!approvedReports.length) return new Set();
    return new Set(
      approvedReports.map(r => getFireMatchKey(r.title)).filter(Boolean)
    );
  }, [approvedReports]);

  // Remove IRWIN incident markers where a reporter report already exists so the
  // map does not show two overlapping markers for the same fire. Also remove
  // IRWIN markers when a matching perimeter exists so we keep the centered
  // perimeter centroid indicator and hide the off-center duplicate dot.
  const deduplicatedIncidentsGeoJSON = useMemo(() => {
    if (!filteredIncidentsGeoJSON?.features)
      return filteredIncidentsGeoJSON;
    return {
      ...filteredIncidentsGeoJSON,
      features: filteredIncidentsGeoJSON.features.filter(f => {
        const key = getFireMatchKey(f.properties.name);
        if (!key) return true;
        if (reporterMatchKeys.has(key)) return false;
        if (perimeterMatchKeys.has(key)) return false;
        return true;
      }),
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
    refreshStormReports();
    refreshSpcOutlooks();
    refreshUserReports();
    if (layers.aqi) refreshAQI();
  }, [refreshHotspots, refreshPerimeters, refreshAlerts, refreshIncidents, refreshStormReports, refreshSpcOutlooks, refreshUserReports, refreshAQI, layers.aqi]);

  return (
    <div className="h-screen w-screen flex flex-col bg-sentinel-900 text-white overflow-hidden select-none">
      {/* ── Top bar ── */}
      <Header onRefresh={handleRefresh} />

      {/* ── Active alert banner ── */}
      <AlertBanner />

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
        />

        {/* Map area */}
        <div className="flex-1 relative overflow-hidden">
          <MapView
            activeMapTab={activeMapTab}
            hotspotsGeoJSON={hotspotsGeoJSON}
            perimetersGeoJSON={filteredPerimetersGeoJSON}
            incidentsGeoJSON={deduplicatedIncidentsGeoJSON}
            incidentDotsGeoJSON={finalIncidentDotsGeoJSON}
            aqiGeoJSON={aqiGeoJSON}
            alertsGeoJSON={alertsGeoJSON}
            spcReportsGeoJSON={spcGeoJSON}
            iemReportsGeoJSON={iemGeoJSON}
            spcOutlooksGeoJSON={spcOutlooksGeoJSON}
            userReportsGeoJSON={userReportsGeoJSON}
          />

          <LayerControl
            activeMapTab={activeMapTab}
          />

          <Legend />
          <FireDetailPanel />
        </div>
      </div>
    </div>
  );
}
