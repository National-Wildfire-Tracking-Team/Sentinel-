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
import { fetchDroughtData } from '../api/droughtMonitor';

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
  weatherAlerts: false,
  aqi: false,
  smoke: false,
  drought: false,
  goesEast: false,
  goesWest: false,
};

const WEATHER_LAYER_PRESET = {
  fireHotspots: false,
  firePerimeters: false,
  incidentLocations: false,
  weatherAlerts: true,
  aqi: true,
  smoke: true,
  drought: true,
  goesEast: true,
  goesWest: false,
};

export default function LiveTrackerPage() {
  const { layers, setLayer, setRefreshed, setLoading } = useApp();
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
    spcReports,
    iemReports,
    spcGeoJSON,
    iemGeoJSON,
    loading: stormReportsLoading,
    error: stormReportsError,
    refresh: refreshStormReports,
  } = useStormReports(activeMapTab === MAP_TABS.weather);

  // Drought data (low-frequency – load once, refreshable)
  const [droughtGeoJSON, setDroughtGeoJSON] = useState(null);
  const refreshDrought = useCallback(() => {
    fetchDroughtData().then(setDroughtGeoJSON).catch(console.warn);
  }, []);
  useEffect(() => {
    if (layers.drought && !droughtGeoJSON) {
      refreshDrought();
    }
  }, [layers.drought, droughtGeoJSON, refreshDrought]);

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
    if (layers.aqi) refreshAQI();
    if (layers.drought) refreshDrought();
  }, [refreshHotspots, refreshPerimeters, refreshAlerts, refreshIncidents, refreshStormReports, refreshAQI, refreshDrought, layers.aqi, layers.drought]);

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
          spcReports={spcReports}
          iemReports={iemReports}
          stormReportsLoading={stormReportsLoading}
          stormReportsError={stormReportsError}
        />

        {/* Map area */}
        <div className="flex-1 relative overflow-hidden">
          <MapView
            activeMapTab={activeMapTab}
            hotspotsGeoJSON={hotspotsGeoJSON}
            perimetersGeoJSON={perimetersGeoJSON}
            incidentsGeoJSON={incidentsGeoJSON}
            incidentDotsGeoJSON={incidentDotsGeoJSON}
            aqiGeoJSON={aqiGeoJSON}
            alertsGeoJSON={alertsGeoJSON}
            droughtGeoJSON={droughtGeoJSON}
            spcReportsGeoJSON={spcGeoJSON}
            iemReportsGeoJSON={iemGeoJSON}
          />

          <LayerControl
            activeMapTab={activeMapTab}
            hotspotsCount={hotspotsCount}
            perimetersCount={perimetersCount + dotsCount}
          />

          <Legend />
          <FireDetailPanel />
        </div>
      </div>
    </div>
  );
}
