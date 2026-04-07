/**
 * App.jsx
 * Root application component.
 * Wires together all data hooks, map, sidebar, and overlay components.
 */

import { useCallback, useEffect } from 'react';

import { useApp } from './context/AppContext';

// Data hooks
import { useFireHotspots }  from './hooks/useFireHotspots';
import { useFirePerimeters } from './hooks/useFirePerimeters';
import { useAQIData }        from './hooks/useAQIData';
import { useWeatherAlerts }  from './hooks/useWeatherAlerts';
import { useIncidents }      from './hooks/useIncidents';
import { fetchDroughtData }  from './api/droughtMonitor';

// Components
import Header          from './components/Header/Header';
import AlertBanner     from './components/AlertBanner/AlertBanner';
import Sidebar         from './components/Sidebar/Sidebar';
import MapView         from './components/Map/MapView';
import LayerControl    from './components/LayerControl/LayerControl';
import Legend          from './components/Legend/Legend';
import FireDetailPanel from './components/FireDetailPanel/FireDetailPanel';

import { useState } from 'react';

// US continental bounding box for data fetches
const US_BOUNDS = { west: -130, south: 24, east: -65, north: 50 };

export default function App() {
  const { layers, setRefreshed, setLoading } = useApp();

  // ── Data feeds ─────────────────────────────────────────────────────────────
  const {
    geoJSON: hotspotsGeoJSON,
    loading: hotspotsLoading,
    count: hotspotsCount,
    refresh: refreshHotspots,
  } = useFireHotspots(US_BOUNDS);

  const {
    geoJSON: perimetersGeoJSON,
    loading: perimetersLoading,
    count: perimetersCount,
    refresh: refreshPerimeters,
  } = useFirePerimeters(100);

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
    loading: incidentsLoading,
    error: incidentsError,
    refresh: refreshIncidents,
  } = useIncidents(100);

  // Drought data (low-frequency – load once)
  const [droughtGeoJSON, setDroughtGeoJSON] = useState(null);
  useEffect(() => {
    if (layers.drought && !droughtGeoJSON) {
      fetchDroughtData().then(setDroughtGeoJSON).catch(console.warn);
    }
  }, [layers.drought, droughtGeoJSON]);

  // ── Global loading state ────────────────────────────────────────────────────
  const anyLoading = hotspotsLoading || perimetersLoading || incidentsLoading;
  useEffect(() => { setLoading(anyLoading); }, [anyLoading, setLoading]);
  useEffect(() => {
    if (!anyLoading) setRefreshed(new Date());
  }, [anyLoading, setRefreshed]);

  // ── Manual refresh ─────────────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    refreshHotspots();
    refreshPerimeters();
    refreshAlerts();
    refreshIncidents();
    if (layers.aqi) refreshAQI();
  }, [refreshHotspots, refreshPerimeters, refreshAlerts, refreshIncidents, refreshAQI, layers.aqi]);

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
          incidents={incidents}
          loading={incidentsLoading}
          error={incidentsError}
        />

        {/* Map area – fills remaining space */}
        <div className="flex-1 relative overflow-hidden">
          <MapView
            hotspotsGeoJSON={hotspotsGeoJSON}
            perimetersGeoJSON={perimetersGeoJSON}
            aqiGeoJSON={aqiGeoJSON}
            alertsGeoJSON={alertsGeoJSON}
            droughtGeoJSON={droughtGeoJSON}
          />

          {/* Floating overlays positioned within map area */}
          <LayerControl
            hotspotsCount={hotspotsCount}
            perimetersCount={perimetersCount}
          />

          <Legend />

          {/* Fire detail panel – slides in from right when a fire is selected */}
          <FireDetailPanel />
        </div>
      </div>
    </div>
  );
}
