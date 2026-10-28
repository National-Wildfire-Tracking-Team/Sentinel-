/**
 * The web's layer catalog and map tabs (src/app/components/LayerControl/LayerControl.jsx LAYER_DEFS
 * and TAB_SECTIONS, and the tab presets in LiveTrackerPage.jsx), so the app's layer panel lists the
 * same rows, labels and sections. `NATIVE_LAYERS` are the ones the app draws today; the rest show
 * in the panel as coming soon until their phase lands.
 */
export type MapTab = 'allhazard' | 'wildfire' | 'weather' | 'models';

export interface LayerDef {
  label: string;
  sublabel: string;
  color: string;
}

export const LAYER_DEFS: Record<string, LayerDef> = {
  incidentLocations: { label: 'Active Fires', sublabel: 'WFIGS locations & perimeters · NWTT verified', color: '#f59e0b' },
  evacZones: { label: 'Evacuation Zones', sublabel: 'Cal OES + IPAWS + field-reported zones', color: '#ef4444' },
  fireHotspots: { label: 'Fire Hotspots', sublabel: 'NASA FIRMS satellite', color: '#ff4500' },
  ngfsDetections: { label: 'GOES Fire Detections', sublabel: 'NOAA NESDIS NGFS satellite', color: '#ffa500' },
  calFireHistoricalPerimeters: { label: 'Historical Fire Perimeters', sublabel: 'CAL FIRE FRAP · past fire scars', color: '#92400e' },
  satellite: { label: 'Satellite Imagery', sublabel: 'NOAA GOES-East/West · bands, regions & loops', color: '#8b5cf6' },
  fireBehaviorModeling: { label: 'Fire Behavior Modeling', sublabel: 'Spread projection · select a fire', color: '#ff3b1f' },
  fireRiskOutlook: { label: 'Significant Fire Potential', sublabel: 'NWCG 7-day outlook · official · by area', color: '#f97316' },
  wfpi: { label: 'Fire Potential Index (gridded)', sublabel: 'USGS WFPI 7-day forecast · a USGS model, not NFDRS', color: '#ef4444' },
  fdErc: { label: 'Energy Release Component', sublabel: 'ERC at NFDRS stations · FEMS', color: '#f97316' },
  fdBi: { label: 'Burning Index', sublabel: 'BI at NFDRS stations · FEMS', color: '#f97316' },
  fdSc: { label: 'Spread Component', sublabel: 'SC at NFDRS stations · FEMS', color: '#f97316' },
  fdDeadFm: { label: 'Dead Fuel Moisture', sublabel: '1-, 10-, 100-, 1000-hour at NFDRS stations', color: '#38bdf8' },
  fdLiveFm: { label: 'Live Fuel Moisture', sublabel: 'Herb & woody, NFDRS-modelled at stations', color: '#22c55e' },
  lfmSamples: { label: 'Live Fuel Moisture Samples', sublabel: 'Measured in the field · WA, OR, ID, MT, WY, SD, ND only', color: '#a855f7' },
  fuelModels: { label: 'Fuel Types & Models', sublabel: 'LANDFIRE 40 fuel models · static map, not moisture', color: '#84cc16' },
  fireWeatherOutlooks: { label: 'Fire Weather Outlooks', sublabel: 'SPC Day 1-8 fire weather', color: '#ff6b35' },
  ndgdSmokeForecast: { label: 'Smoke Concentration', sublabel: 'NOAA NDGD hourly (48h)', color: '#eab308' },
  droughtOutlook: { label: 'Drought Outlook', sublabel: 'NOAA CPC Monthly Outlook', color: '#f59e0b' },
  waterGauges: { label: 'Water Gauges', sublabel: 'NOAA NWPS river & coastal gauges', color: '#1e90ff' },
  rawsStations: { label: 'RAWS Stations', sublabel: 'Fire weather stations', color: '#f97316' },
  airNowMonitors: { label: 'Air Quality Monitors', sublabel: 'EPA AirNow sensor network', color: '#38bdf8' },
  wildfireCameras: { label: 'Live CA Cameras', sublabel: 'Caltrans District CCTV · tap for live feed', color: '#14b8a6' },
  windParticles: { label: 'Wind Particles', sublabel: 'Animated wind flow · current model hour', color: '#ff5a00' },
  tfrs: { label: 'Temporary Flight Restrictions', sublabel: 'FAA TFRs · fire, security, VIP & more', color: '#ef4444' },
  awc: { label: 'Aviation Weather Center', sublabel: 'METAR & TAF, SIGMETs, PIREPs & more', color: '#38bdf8' },
  weatherAlerts: { label: 'NWS & mesoscale', sublabel: 'NWS alerts + SPC & WPC MDs', color: '#ef4444' },
  stormReports: { label: 'Storm reports', sublabel: 'NWS LSR · last 24 hours', color: '#7c3aed' },
  damageAssessment: { label: 'Damage assessment', sublabel: 'NWS DAT · surveys, last 30 days', color: '#dc2626' },
  spcWeatherOutlooks: { label: 'SPC outlooks', sublabel: 'Convective severe weather outlook', color: '#f59e0b' },
  wpcEro: { label: 'Excessive Rainfall Outlook', sublabel: 'WPC Day 1-3 flash-flood risk', color: '#38bdf8' },
  wpcWssi: { label: 'Winter Storm Severity', sublabel: 'WPC Day 1-3 overall impact', color: '#93c5fd' },
  wpcQpf: { label: 'Precipitation Forecast', sublabel: 'WPC Day 1-3 QPF (24hr)', color: '#0ea5e9' },
  wpcFronts: { label: 'Surface Analysis Fronts', sublabel: 'WPC live analysis · fronts, highs & lows', color: '#a78bfa' },
  floodHazard: { label: 'Flood Hazard', sublabel: 'FEMA National Flood Hazard Layer · zoom in for zones', color: '#00c8f0' },
  nhcTropical: { label: 'NHC Tropical', sublabel: 'Storms, outlook, wind & surge', color: '#4dffff' },
  mrms: { label: 'Composite Radar', sublabel: 'NOAA Multi-Radar/Multi-Sensor · 2-min updates', color: '#22c55e' },
  radarSites: { label: 'Individual Radar Site', sublabel: 'NEXRAD & TDWR stations · tap a site for its radar', color: '#9ca3af' },
  lightning: { label: 'Lightning', sublabel: 'NOAA GOES satellites · last 15 minutes', color: '#ffe14d' },
  aqi: { label: 'AQI Heatmap', sublabel: 'EPA AirNow gradient overlay', color: '#3b82f6' },
  smoke: { label: 'Smoke Forecast', sublabel: 'NOAA HRRR', color: '#94a3b8' },
  criticalInfrastructure: { label: 'Critical Infrastructure', sublabel: 'CMRA power lines · EIA natural gas pipelines', color: '#fbbf24' },
  schoolsUniversities: { label: 'Schools & Universities', sublabel: 'USGS National Map · colleges & universities', color: '#a78bfa' },
  landOwnership: { label: 'Land Ownership', sublabel: 'CAL FIRE FRAP · zoom in to load', color: '#16a34a' },
  routeToSafety: { label: 'Navigation', sublabel: 'Nearest open shelters · hazard-avoiding routes', color: '#22c55e' },
};

/** A row in a section: a layer key, or a key with labels overridden for that tab. */
export type LayerRow = string | { key: string; label: string; sublabel: string };

export interface LayerSection {
  id: string;
  title: string;
  rows: LayerRow[];
}

const RED_FLAG_ROW: LayerRow = { key: 'weatherAlerts', label: 'Red Flag Warnings', sublabel: 'NWS active Red Flag Warnings' };
const STATION_LAYER_KEYS = ['fdErc', 'fdBi', 'fdSc', 'fdDeadFm', 'fdLiveFm'];
const FIRE_DANGER_ROWS: LayerRow[] = ['fireRiskOutlook', 'wfpi', ...STATION_LAYER_KEYS, 'lfmSamples', 'fuelModels'];
const TAIL_SECTIONS: LayerSection[] = [
  { id: 'infra', title: 'Infrastructure', rows: ['criticalInfrastructure', 'schoolsUniversities', 'landOwnership'] },
  { id: 'nav-safety', title: 'Evacuation', rows: ['routeToSafety'] },
];

export const TAB_SECTIONS: Record<Exclude<MapTab, 'models'>, LayerSection[]> = {
  wildfire: [
    {
      id: 'wf-activity',
      title: 'Fire activity',
      // The web also lists Fire Behavior Modeling here; the app leaves it out.
      rows: [RED_FLAG_ROW, 'evacZones', 'incidentLocations', 'fireHotspots', 'ngfsDetections', 'calFireHistoricalPerimeters', 'satellite'],
    },
    {
      id: 'wf-fire-danger',
      title: 'Fire Danger & Fuels',
      rows: [...FIRE_DANGER_ROWS, { key: 'fireWeatherOutlooks', label: 'Fire Weather Forecast', sublabel: 'SPC Day 1-8 fire weather outlook' }],
    },
    { id: 'wf-outlooks', title: 'Outlooks', rows: ['ndgdSmokeForecast', 'droughtOutlook'] },
    { id: 'wf-monitor', title: 'Monitoring', rows: ['waterGauges', 'rawsStations', 'airNowMonitors', 'wildfireCameras', 'windParticles'] },
    { id: 'wf-aviation', title: 'Aviation', rows: ['tfrs'] },
    ...TAIL_SECTIONS,
  ],
  allhazard: [
    {
      id: 'ah-fire',
      title: 'Fire activity',
      rows: ['incidentLocations', 'evacZones', 'fireHotspots', 'ngfsDetections', 'calFireHistoricalPerimeters'],
    },
    {
      id: 'ah-weather',
      title: 'Weather hazards',
      rows: ['weatherAlerts', 'nhcTropical', 'stormReports', 'damageAssessment', 'waterGauges', 'floodHazard', 'spcWeatherOutlooks', 'fireWeatherOutlooks', 'wpcEro', 'wpcWssi', 'wpcQpf', 'wpcFronts'],
    },
    { id: 'ah-aviation', title: 'Aviation', rows: ['tfrs', 'awc'] },
    { id: 'ah-fire-danger', title: 'Fire Danger & Fuels', rows: FIRE_DANGER_ROWS },
    {
      id: 'ah-monitoring',
      title: 'Monitoring & imagery',
      rows: ['ndgdSmokeForecast', 'smoke', 'droughtOutlook', 'airNowMonitors', 'aqi', 'radarSites', 'satellite', 'lightning', 'rawsStations', 'windParticles'],
    },
    ...TAIL_SECTIONS,
  ],
  weather: [
    { id: 'wx-imagery', title: 'Radar & satellite', rows: ['mrms', 'radarSites', 'satellite', 'lightning', 'windParticles'] },
    {
      id: 'wx-hazards',
      title: 'Weather hazards',
      rows: ['weatherAlerts', 'nhcTropical', 'stormReports', 'damageAssessment', 'waterGauges', 'floodHazard', 'rawsStations'],
    },
    { id: 'wx-aviation', title: 'Aviation', rows: ['tfrs', 'awc'] },
    { id: 'wx-outlooks', title: 'Outlooks', rows: ['spcWeatherOutlooks', 'wpcEro', 'wpcWssi', 'wpcQpf', 'wpcFronts'] },
    ...TAIL_SECTIONS,
  ],
};

/** Layers the app draws today; the rest show as Soon in the layer panel. */
export const NATIVE_LAYERS = new Set([
  // Phase 1: wildfire core
  'incidentLocations',
  'evacZones',
  // Phase 3: weather & all hazards
  'weatherAlerts',
  'mrms',
  'lightning',
  'nhcTropical',
  'stormReports',
  'damageAssessment',
  'spcWeatherOutlooks',
  'fireWeatherOutlooks',
  'wpcEro',
  'wpcWssi',
  'wpcQpf',
  'wpcFronts',
  'droughtOutlook',
  'floodHazard',
  // Phase 4: fire activity, fire danger & fuels, smoke, monitoring, aviation, infrastructure
  'fireHotspots',
  'ngfsDetections',
  'calFireHistoricalPerimeters',
  'satellite',
  'fireRiskOutlook',
  'wfpi',
  'fdErc',
  'fdBi',
  'fdSc',
  'fdDeadFm',
  'fdLiveFm',
  'lfmSamples',
  'fuelModels',
  'ndgdSmokeForecast',
  'aqi',
  'waterGauges',
  'rawsStations',
  'airNowMonitors',
  'wildfireCameras',
  'tfrs',
  'awc',
  'criticalInfrastructure',
  'schoolsUniversities',
  'landOwnership',
  'radarSites',
  'windParticles',
]);

/** Plan named on locked rows (LayerControl.jsx lockedLayerPlans and infraLayers). */
export const FIRE_DANGER_LAYER_KEYS = new Set(FIRE_DANGER_ROWS as string[]);

export type LayerState = Record<string, boolean>;

/** Tab presets from LiveTrackerPage.jsx, limited to the keys the app can draw. */
export const TAB_PRESETS: Record<MapTab, LayerState> = {
  wildfire: { incidentLocations: true, evacZones: true, weatherAlerts: true },
  allhazard: { incidentLocations: true, evacZones: true, weatherAlerts: true, nhcTropical: true },
  // The web's Weather tab opens with only composite radar on.
  weather: { incidentLocations: false, evacZones: false, weatherAlerts: false, nhcTropical: false, mrms: true },
  models: { incidentLocations: false, evacZones: false },
};

export function rowKey(row: LayerRow): string {
  return typeof row === 'string' ? row : row.key;
}

export function rowLabels(row: LayerRow): { label: string; sublabel: string; color: string } {
  const def = LAYER_DEFS[rowKey(row)];
  if (typeof row === 'string') return def;
  return { label: row.label, sublabel: row.sublabel, color: def.color };
}
