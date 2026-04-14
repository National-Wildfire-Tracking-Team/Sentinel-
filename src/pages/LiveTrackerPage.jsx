/**
 * LiveTrackerPage.jsx
 * Full-screen wildfire tracking dashboard with live map, sidebar, and layer controls.
 * Refactored from the original App.jsx single-page layout.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flame, ArrowLeft } from 'lucide-react';

import { useApp } from '../context/AppContext';

// Data hooks
import { useFireHotspots } from '../hooks/useFireHotspots';
import { useMergedFireData } from '../hooks/useMergedFireData';
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
    const preset = activeMapTab === MAP_TABS.wildfire ? WILDFIRE_LAYER_PRESET : WEATHER_LAYER_PRESET;
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

      {/* Back-to-site link bar */}
      <div className="flex items-center gap-2 px-4 py-1.5 bg-sentinel-800 border-b border-sentinel-700 text-xs">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sentinel-200 hover:text-fire-300 transition-colors"
        >
          <ArrowLeft size={12} />
          Back to NWTT Home
        </Link>
        <span className="text-sentinel-500">|</span>
        <span className="text-sentinel-200 flex items-center gap-1">
          <Flame size={11} className="text-fire-500" />
          Live Wildfire Tracker &mdash; Real-time data from NASA, NIFC &amp; NOAA
        </span>
      </div>

      {/* ── Active alert banner ── */}
      <AlertBanner />

      {/* ── Main content area ── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left sidebar */}
        <Sidebar
          incidents={incidents}
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
            incidentsGeoJSON={filteredIncidentsGeoJSON}
            incidentDotsGeoJSON={filteredIncidentDotsGeoJSON}
            aqiGeoJSON={aqiGeoJSON}
            alertsGeoJSON={alertsGeoJSON}
            spcReportsGeoJSON={spcGeoJSON}
            iemReportsGeoJSON={iemGeoJSON}
            spcOutlooksGeoJSON={spcOutlooksGeoJSON}
            userReportsGeoJSON={userReportsGeoJSON}
          />

          <LayerControl
            activeMapTab={activeMapTab}
            hotspotsCount={hotspotsCount}
            hotspotsSourceCounts={hotspotsSourceCounts}
            perimetersCount={perimetersCount + dotsCount}
          />

          <Legend />
          <FireDetailPanel />
        </div>
      </div>
    </div>
  );
}
