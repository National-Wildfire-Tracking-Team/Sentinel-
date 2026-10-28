/**
 * The GeoJSON data behind each catalog layer: how it loads and how often. One catalog key can draw
 * several sources (the web's AWC layer is METARs plus SIGMET/CWA advisories).
 */
import { fetchAlertPolygons } from '@/data/alertPolygons';
import type { Viewport } from '@/data/arcgisQuery';
import { fetchFireDangerStations, fetchFuelMoistureSamples, fetchSignificantFirePotential } from '@/data/fireDanger';
import { fetchAqiContours, fetchCalFirePerimeters, fetchFireHotspots, fetchNdgdSmoke, fetchNgfsDetections } from '@/data/fireLayers';
import {
  fetchAirNowMonitors,
  fetchAwcAdvisories,
  fetchCaltransCameras,
  fetchColleges,
  fetchCriticalInfrastructure,
  fetchLandOwnership,
  fetchMetars,
  fetchRaws,
  fetchTfrs,
  fetchWaterGauges,
} from '@/data/monitoringLayers';

export interface FeatureSourceDef {
  load: (view: Viewport | null) => Promise<GeoJSON.FeatureCollection>;
  refreshMinutes: number;
  /** Loaded for the visible area after the map settles, from this zoom up. */
  viewport?: { minZoom: number };
}

export const FEATURE_SOURCES: Record<string, FeatureSourceDef> = {
  nwsAlerts: { load: fetchAlertPolygons, refreshMinutes: 2 },
  fireHotspots: { load: fetchFireHotspots, refreshMinutes: 5 },
  ngfsDetections: { load: fetchNgfsDetections, refreshMinutes: 5 },
  calFireHistoricalPerimeters: { load: fetchCalFirePerimeters, refreshMinutes: 12 * 60 },
  ndgdSmokeForecast: { load: fetchNdgdSmoke, refreshMinutes: 30 },
  aqi: { load: fetchAqiContours, refreshMinutes: 15 },
  fireRiskOutlook: { load: () => fetchSignificantFirePotential(1), refreshMinutes: 15 },
  fireDangerStations: { load: fetchFireDangerStations, refreshMinutes: 5 },
  lfmSamples: { load: fetchFuelMoistureSamples, refreshMinutes: 30 },
  rawsStations: { load: fetchRaws, refreshMinutes: 15 },
  airNowMonitors: { load: fetchAirNowMonitors, refreshMinutes: 15 },
  wildfireCameras: { load: fetchCaltransCameras, refreshMinutes: 5 },
  waterGauges: { load: fetchWaterGauges, refreshMinutes: 5 },
  tfrs: { load: fetchTfrs, refreshMinutes: 5 },
  awcAdvisories: { load: fetchAwcAdvisories, refreshMinutes: 5 },
  awcMetars: { load: fetchMetars, refreshMinutes: 5 },
  schoolsUniversities: { load: v => fetchColleges(v!), refreshMinutes: 0, viewport: { minZoom: 5 } },
  criticalInfrastructure: { load: v => fetchCriticalInfrastructure(v!), refreshMinutes: 0, viewport: { minZoom: 4 } },
  landOwnership: { load: v => fetchLandOwnership(v!), refreshMinutes: 0, viewport: { minZoom: 11 } },
};

/** Catalog keys whose data are GeoJSON sources, and which sources each draws. */
export const CATALOG_SOURCES: Record<string, string[]> = {
  weatherAlerts: ['nwsAlerts'],
  fireHotspots: ['fireHotspots'],
  ngfsDetections: ['ngfsDetections'],
  calFireHistoricalPerimeters: ['calFireHistoricalPerimeters'],
  ndgdSmokeForecast: ['ndgdSmokeForecast'],
  aqi: ['aqi'],
  fireRiskOutlook: ['fireRiskOutlook'],
  fdErc: ['fireDangerStations'],
  fdBi: ['fireDangerStations'],
  fdSc: ['fireDangerStations'],
  fdDeadFm: ['fireDangerStations'],
  fdLiveFm: ['fireDangerStations'],
  lfmSamples: ['lfmSamples'],
  rawsStations: ['rawsStations'],
  airNowMonitors: ['airNowMonitors'],
  wildfireCameras: ['wildfireCameras'],
  waterGauges: ['waterGauges'],
  tfrs: ['tfrs'],
  awc: ['awcAdvisories', 'awcMetars'],
  schoolsUniversities: ['schoolsUniversities'],
  criticalInfrastructure: ['criticalInfrastructure'],
  landOwnership: ['landOwnership'],
};
