/**
 * LayerControl.jsx
 * Floating right panel to toggle all map data layers on/off.
 * Collapsible on mobile. Layers are grouped by the active map tab (Wildfire vs Weather).
 */

import { useState, memo, useMemo, useEffect } from 'react';
import {
  Layers, Flame, Gauge, Trees, Wind, CloudRain, CloudLightning, Radar, AlertTriangle, Ruler, Hexagon, Satellite, Thermometer, Activity, Droplets, Zap, Lock, GraduationCap, History, TrendingUp, Camera, Snowflake, Landmark, Waves, Waypoints, Navigation,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { trackSentinelUse } from '../../../shared/utils/analytics';
import LayerPanelSection from './LayerPanelSection';
import ModelLayerPanel from '../WeatherModels/ModelLayerPanel';
import { useWeatherModelsContext } from '../../context/WeatherModelsContext';
import { LIGHTNING_URL } from '../../api/lightning';
import { FIRE_DANGER_URL, STATION_LAYER_KEYS } from '../../api/fireDanger/stations';

function stationSublabel(text) {
  // Shown even before cloud/fire-danger is deployed, saying so (as Lightning does).
  return FIRE_DANGER_URL ? text : 'NFDRS stations · not set up for this build yet';
}

/** Layer row definitions — grouped under tab-specific sections below */
const LAYER_DEFS = {
  fireHotspots:      { label: 'Fire Hotspots',       sublabel: 'NASA FIRMS satellite',          icon: Flame,        color: '#ff4500' },
  ngfsDetections:    { label: 'GOES Fire Detections', sublabel: 'NOAA NESDIS NGFS satellite',   icon: Satellite,    color: '#ffa500' },
  calFireHistoricalPerimeters: { label: 'Historical Fire Perimeters', sublabel: 'CAL FIRE FRAP · past fire scars', icon: History, color: '#92400e' },
  incidentLocations: { label: 'Active Fires',        sublabel: 'WFIGS locations & perimeters · NWTT verified', icon: Flame, color: '#f59e0b' },
  evacZones:         { label: 'Evacuation Zones',    sublabel: 'Cal OES + IPAWS + field-reported zones', icon: AlertTriangle, color: '#ef4444' },
  ndgdSmokeForecast: { label: 'Smoke Concentration', sublabel: 'NOAA NDGD hourly (48h)',      icon: CloudRain,    color: '#eab308' },
  droughtOutlook:    { label: 'Drought Outlook',     sublabel: 'NOAA CPC Monthly Outlook',    icon: Droplets,     color: '#f59e0b' },
  fireWeatherOutlooks: { label: 'Fire Weather Outlooks', sublabel: 'SPC Day 1-8 fire weather', icon: Zap,          color: '#ff6b35' },
  // An official outlook, not an NFDRS adjective danger rating: named for what it is.
  fireRiskOutlook: { label: 'Significant Fire Potential', sublabel: 'NWCG 7-day outlook · official · by area', icon: Gauge, color: '#f97316' },
  // FEMS NFDRS station values: one row per field; turning one on turns the others off.
  fdErc: { label: 'Energy Release Component', sublabel: stationSublabel('ERC at NFDRS stations · FEMS'), icon: Flame, color: '#f97316' },
  fdBi: { label: 'Burning Index', sublabel: stationSublabel('BI at NFDRS stations · FEMS'), icon: Flame, color: '#f97316' },
  fdSc: { label: 'Spread Component', sublabel: stationSublabel('SC at NFDRS stations · FEMS'), icon: Wind, color: '#f97316' },
  fdDeadFm: { label: 'Dead Fuel Moisture', sublabel: stationSublabel('1-, 10-, 100-, 1000-hour at NFDRS stations'), icon: Droplets, color: '#38bdf8' },
  fdLiveFm: { label: 'Live Fuel Moisture', sublabel: stationSublabel('Herb & woody, NFDRS-modelled at stations'), icon: Droplets, color: '#22c55e' },
  wfpi: {
    label: 'Fire Potential Index (gridded)',
    sublabel: FIRE_DANGER_URL ? 'USGS WFPI 7-day forecast · a USGS model, not NFDRS' : 'USGS WFPI 7-day forecast · dates not set up for this build yet',
    icon: Layers, color: '#ef4444',
  },
  lfmSamples: { label: 'Live Fuel Moisture Samples', sublabel: 'Measured in the field · WA, OR, ID, MT, WY, SD, ND only', icon: Droplets, color: '#a855f7' },
  fuelModels: { label: 'Fuel Types & Models', sublabel: 'LANDFIRE 40 fuel models · static map, not moisture', icon: Trees, color: '#84cc16' },
  wpcEro:    { label: 'Excessive Rainfall Outlook', sublabel: 'WPC Day 1-3 flash-flood risk',      icon: CloudRain,  color: '#38bdf8' },
  wpcWssi:   { label: 'Winter Storm Severity',      sublabel: 'WPC Day 1-3 overall impact',        icon: Snowflake,  color: '#93c5fd' },
  wpcQpf:    { label: 'Precipitation Forecast',     sublabel: 'WPC Day 1-3 QPF (24hr)',            icon: Droplets,   color: '#0ea5e9' },
  wpcFronts: { label: 'Surface Analysis Fronts',    sublabel: 'WPC live analysis · fronts, highs & lows',       icon: Wind,       color: '#a78bfa' },
  rawsStations:      { label: 'RAWS Stations',       sublabel: 'Fire weather stations',       icon: Thermometer,  color: '#f97316' },
  airNowMonitors:    { label: 'Air Quality Monitors', sublabel: 'EPA AirNow sensor network',  icon: Activity,     color: '#38bdf8' },
  weatherAlerts:     { label: 'NWS & mesoscale',     sublabel: 'NWS alerts + SPC & WPC MDs', icon: Wind,         color: '#ef4444' },
  stormReports:      { label: 'Storm reports',       sublabel: 'NWS LSR · last 24 hours',     icon: CloudLightning, color: '#7c3aed' },
  damageAssessment:  { label: 'Damage assessment',    sublabel: 'NWS DAT · surveys, last 30 days', icon: Hexagon,    color: '#dc2626' },
  spcWeatherOutlooks: { label: 'SPC outlooks',     sublabel: 'Convective severe weather outlook',    icon: AlertTriangle, color: '#f59e0b' },
  mrms:              { label: 'MRMS Radar',          sublabel: 'NOAA Multi-Radar/Multi-Sensor · 2-min updates', icon: Radar, color: '#22c55e' },
  radarSites:        { label: 'Radar Site',          sublabel: 'NEXRAD & TDWR stations · click a site for its radar', icon: Radar, color: '#9ca3af' },
  // Shown even before cloud/lightning is deployed, saying so (as MRMS does), so the toggle is never missing.
  lightning:         { label: 'Lightning',           sublabel: LIGHTNING_URL ? 'NOAA GOES satellites · last 15 minutes' : 'NOAA GOES satellites · not set up for this build yet', icon: Zap, color: '#ffe14d' },
  satellite:         { label: 'Satellite',           sublabel: 'NOAA GOES-East/West · bands, regions & loops', icon: Satellite, color: '#8b5cf6' },
  aqi:               { label: 'AQI Heatmap',          sublabel: 'EPA AirNow gradient overlay',  icon: Wind,         color: '#3b82f6' },
  smoke:             { label: 'Smoke Forecast',      sublabel: 'NOAA HRRR',                   icon: CloudRain,    color: '#94a3b8' },
  waterGauges:        { label: 'Water Gauges',        sublabel: 'NOAA NWPS river & coastal gauges', icon: Droplets, color: '#1e90ff' },
  floodHazard:        { label: 'Flood Hazard',        sublabel: 'FEMA National Flood Hazard Layer · zoom in for zones', icon: Waves, color: '#00c8f0' },
  wildfireCameras:   { label: 'Live CA Cameras',      sublabel: 'Caltrans District CCTV · click for live feed', icon: Camera, color: '#14b8a6' },
  nhcTropical:      { label: 'NHC Tropical', sublabel: 'Storms, outlook, wind & surge · parts in its drawer', icon: Waypoints, color: '#4dffff' },
  fireBehaviorModeling: { label: 'Fire Behavior Modeling', sublabel: 'Spread projection · select a fire', icon: TrendingUp, color: '#ff3b1f' },
  // Not an AppContext layer: shared with the Models tab's own toggle (WindParticlesToggle).
  windParticles: { label: 'Wind Particles', sublabel: 'Animated wind flow · current model hour', icon: Wind, color: '#ff5a00' },
  routeToSafety: { label: 'Navigation', sublabel: 'Nearest open shelters · hazard-avoiding routes', icon: Navigation, color: '#22c55e' },
};


/**
 * Sections shown per map tab. Order matches visual stack top → bottom.
 */
const TAB_SECTIONS = {
  allhazard: [
    {
      id: 'ah-fire',
      title: 'Fire activity',
      groups: [
        {
          layers: ['incidentLocations', 'evacZones', 'fireHotspots', 'ngfsDetections', 'calFireHistoricalPerimeters', 'fireBehaviorModeling'],
        },
      ],
    },
    {
      id: 'ah-weather',
      title: 'Weather hazards',
      groups: [
        {
          layers: ['weatherAlerts', 'nhcTropical', 'stormReports', 'damageAssessment', 'waterGauges', 'floodHazard', 'spcWeatherOutlooks', 'fireWeatherOutlooks', 'wpcEro', 'wpcWssi', 'wpcQpf', 'wpcFronts'],
        },
      ],
    },
    {
      id: 'ah-fire-danger',
      title: 'Fire Danger & Fuels',
      groups: [
        {
          layers: ['fireRiskOutlook', 'wfpi', ...STATION_LAYER_KEYS, 'lfmSamples', 'fuelModels'],
        },
      ],
    },
    {
      id: 'ah-monitoring',
      title: 'Monitoring & imagery',
      groups: [
        {
          layers: ['ndgdSmokeForecast', 'smoke', 'droughtOutlook', 'airNowMonitors', 'aqi', 'radarSites', 'satellite', 'lightning', 'rawsStations', 'windParticles'],
        },
      ],
    },
  ],
  wildfire: [
    {
      id: 'wf-activity',
      title: 'Fire activity',
      groups: [
        {
          layers: [
            { key: 'weatherAlerts', label: 'Red Flag Warnings', sublabel: 'NWS active Red Flag Warnings' },
            'evacZones',
            'incidentLocations',
            'fireHotspots', 'ngfsDetections', 'calFireHistoricalPerimeters', 'satellite',
            'fireBehaviorModeling',
          ],
        },
      ],
    },
    {
      id: 'wf-fire-danger',
      title: 'Fire Danger & Fuels',
      groups: [
        {
          layers: [
            'fireRiskOutlook',
            'wfpi',
            ...STATION_LAYER_KEYS,
            'lfmSamples',
            'fuelModels',
            { key: 'fireWeatherOutlooks', label: 'Fire Weather Forecast', sublabel: 'SPC Day 1-8 fire weather outlook' },
          ],
        },
      ],
    },
    {
      id: 'wf-evac',
      title: 'Outlooks',
      groups: [
        {
          layers: [
            'ndgdSmokeForecast', 'droughtOutlook',
          ],
        },
      ],
    },
    {
      id: 'wf-monitor',
      title: 'Monitoring',
      groups: [
        {
          layers: ['waterGauges', 'rawsStations', 'airNowMonitors', 'wildfireCameras', 'windParticles'],
        },
      ],
    },
  ],
  weather: [
    {
      id: 'wx-imagery',
      title: 'Radar & satellite',
      groups: [
        {
          // MRMS always shows; its pull-up controls (MrmsPanel) explain when VITE_MRMS_URL isn't set.
          layers: ['mrms', 'radarSites', 'satellite', 'lightning', 'windParticles'],
        },
      ],
    },
    {
      id: 'wx-hazards',
      title: 'Weather hazards',
      groups: [
        {
          layers: ['weatherAlerts', 'nhcTropical', 'stormReports', 'damageAssessment', 'waterGauges', 'floodHazard', 'rawsStations'],
        },
      ],
    },
    {
      id: 'wx-outlooks',
      title: 'Outlooks',
      groups: [
        {
          layers: ['spcWeatherOutlooks', 'wpcEro', 'wpcWssi', 'wpcQpf', 'wpcFronts'],
        },
      ],
    },
  ],
};

function LayerToggle({ layerKey, label, sublabel, icon: Icon, locked, onToggle, active: activeOverride }) {
  const { layers, toggleLayer } = useApp();
  const active = activeOverride ?? layers[layerKey];
  const handleClick = onToggle || (() => {
    if (!active) trackSentinelUse('layer_toggle', { layer: layerKey });
    toggleLayer(layerKey);
  });

  if (locked) {
    return (
      <div className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg opacity-90">
        <div
          className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center border border-sentinel-500"
        >
          <Lock size={12} className="text-sentinel-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-sentinel-100 truncate flex items-center gap-1.5">
            {label}
            <span className="text-[9px] font-bold uppercase tracking-wide text-amber-400">Pro</span>
          </div>
          <div className="text-[10px] text-sentinel-300 truncate">{sublabel}</div>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg
                      hover:bg-white/10 transition-colors group text-left"
      aria-pressed={active}
      aria-label={`Toggle ${label}`}
    >
      <div
        className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center"
        style={{
          // Softer fire-600 tint than the toggle track: 15% fill, 30% border.
          backgroundColor: active ? 'rgba(255, 90, 0, 0.15)' : 'transparent',
          border: `1px solid ${active ? 'rgba(255, 90, 0, 0.3)' : '#52525b'}`,
        }}
      >
        <Icon size={14} style={{ color: active ? '#ff5a00' : '#a1a1aa' }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium truncate transition-colors ${active ? 'text-white' : 'text-sentinel-100'}`}>
          {label}
        </div>
        <div className="text-[10px] text-sentinel-300 leading-snug line-clamp-2">{sublabel}</div>
      </div>

      <div
        className={`shrink-0 relative w-9 h-5 rounded-full transition-colors duration-200
          ${active ? 'bg-fire-600/25 ring-1 ring-inset ring-fire-600/50' : 'bg-sentinel-500'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow
                      transition-transform duration-200 ${active ? 'translate-x-4' : ''}`}
        />
      </div>
    </button>
  );
}

function FireRiskDaySelector() {
  const { layers, fireRiskDay, setFireRiskDay } = useApp();

  if (!layers.fireRiskOutlook) {
    return null;
  }

  return (
    <div className="px-2.5 py-2.5 bg-sentinel-800/70 border-t border-sentinel-700">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-sentinel-300">
            Forecast Day
          </div>
          <div className="text-[10px] text-sentinel-400 mt-0.5">
            NIFC 7-Day Significant Fire Potential
          </div>
      </div>

      <span className="text-[10px] font-semibold text-orange-400">
        Day {fireRiskDay}
      </span>
    </div>

    <div className="grid grid-cols-7 gap-1">
      {[1, 2, 3, 4, 5, 6, 7].map((day) => {
        const active = fireRiskDay === day;

      return (
        <button
          key={day}
          type="button"
          onClick={() => setFireRiskDay(day)}
          aria-pressed={active}
          aria-label={`Show fire risk forecast Day ${day}`}
          className={`
            h-8 rounded-md text-[10px] font-semibold
            transition-all border
            ${
              active
                ? 'bg-orange-500 text-white border-orange-400 shadow-lg shadow-orange-900/30'
                : 'bg-sentinel-900 text-sentinel-300 border-sentinel-600 hover:bg-sentinel-700 hover:text-white hover:border-sentinel-500'
            }
          `}
          >
            D{day}
          </button>
        );
      })}
    </div>

    <div className="flex justify-between mt-2 text-[9px] text-sentinel-500">
      <span>Today</span>
      <span>+7 days</span>
    </div>
    </div>
  );
}

/** Wind particles live in the Models state, so this one setting is the same on every tab. */
function WindParticlesToggle({ label, sublabel, icon }) {
  const wm = useWeatherModelsContext();
  if (!wm) return null;
  const { particles, setParticles } = wm;
  return (
    <LayerToggle
      layerKey="windParticles"
      label={label}
      sublabel={sublabel}
      icon={icon}
      active={particles}
      onToggle={() => {
        if (!particles) trackSentinelUse('layer_toggle', { layer: 'windParticles' });
        setParticles(!particles);
      }}
    />
  );
}

const WPC_DAYS = [
  { key: 'day1', label: 'Day 1' },
  { key: 'day2', label: 'Day 2' },
  { key: 'day3', label: 'Day 3' },
];

// Fronts add the live surface analysis ("Now") ahead of the forecast days.
const FRONTS_DAYS = [{ key: 'now', label: 'Now' }, ...WPC_DAYS];

/**
 * Shared Day 1-3 selector for the WPC outlook layers (ERO, WSSI, QPF,
 * fronts) — same inline-under-the-toggle pattern as FireRiskDaySelector,
 * parameterized so the four layers don't each need a near-duplicate
 * component.
 */
function WpcDaySelector({ layerKey, product, subtitle, accentColor, days = WPC_DAYS, heading = 'Forecast Day' }) {
  const { layers, wpcOutlookDay, setWpcOutlookDay } = useApp();

  if (!layers[layerKey]) {
    return null;
  }

  const activeDay = wpcOutlookDay[product];

  return (
    <div className="px-2.5 py-2.5 bg-sentinel-800/70 border-t border-sentinel-700">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-sentinel-300">
            {heading}
          </div>
          <div className="text-[10px] text-sentinel-400 mt-0.5">
            {subtitle}
          </div>
        </div>
      </div>

      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map(({ key, label }) => {
          const active = activeDay === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setWpcOutlookDay(product, key)}
              aria-pressed={active}
              aria-label={`Show ${subtitle} ${label}`}
              className={`
                h-8 rounded-md text-[10px] font-semibold
                transition-all border
                ${active
                  ? 'text-white shadow-lg border-transparent'
                  : 'bg-sentinel-900 text-sentinel-300 border-sentinel-600 hover:bg-sentinel-700 hover:text-white hover:border-sentinel-500'
                }
              `}
              style={active ? { backgroundColor: accentColor } : undefined}
            >
              {label.replace('Day ', 'D')}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const LayerControl = memo(function LayerControl({
  activeMapTab = 'wildfire',
  infrastructureLayersEntitled = false,
  routingEntitled = false,
  measureActive = false,
  measureMode = 'distance',
  onMeasureActivate,
  onMeasureClose,
  dockedPanelClearance = 0,
}) {
  const { layerPanelOpen, toggleLayerPanel, layers, setLayer } = useApp();
  const [collapsed, setCollapsed] = useState({});

  const infraLayers = useMemo(() => [
    {
      key: 'criticalInfrastructure',
      label: 'Critical Infrastructure',
      sublabel: 'CMRA power lines · EIA natural gas pipelines',
      icon: Zap,
      color: '#fbbf24',
      locked: !infrastructureLayersEntitled,
    },
    {
      key: 'schoolsUniversities',
      label: 'Schools & Universities',
      sublabel: 'USGS National Map · colleges & universities',
      icon: GraduationCap,
      color: '#a78bfa',
      // Free for everyone; only power lines/pipelines and land ownership are Pro.
      locked: false,
    },
    {
      key: 'landOwnership',
      label: 'Land Ownership',
      sublabel: 'CAL FIRE FRAP · zoom in to load',
      icon: Landmark,
      color: '#16a34a',
      locked: !infrastructureLayersEntitled,
    },
  ], [infrastructureLayersEntitled]);

  // Pro-gated rows outside the Infrastructure section (same locked row).
  const lockedLayerKeys = useMemo(
    () => new Set(routingEntitled ? [] : ['routeToSafety']),
    [routingEntitled],
  );

  const sections = useMemo(() => {
    const tabKey = activeMapTab === 'weather' ? 'weather' : activeMapTab === 'allhazard' ? 'allhazard' : 'wildfire';
    const base = TAB_SECTIONS[tabKey] || TAB_SECTIONS.wildfire;
    if (activeMapTab !== 'wildfire' && activeMapTab !== 'weather' && activeMapTab !== 'allhazard') {
      return base;
    }
    return [
      ...base,
      {
        id: 'wf-infra',
        title: 'Infrastructure',
        groups: [{ layers: infraLayers.map((l) => l.key) }],
        infraLayers,
      },
      // Navigation (Pro): last in the list on All Hazards, Wildfire and Weather.
      {
        id: 'nav-safety',
        title: 'Evacuation',
        groups: [{ layers: ['routeToSafety'] }],
      },
    ];
  }, [activeMapTab, infraLayers]);

  // When switching tabs, reset accordion and expand the first section
  useEffect(() => {
    const firstId =
      activeMapTab === 'weather'   ? 'wx-imagery'  :
      activeMapTab === 'allhazard' ? 'ah-fire'     : 'wf-activity';
    setCollapsed({ [firstId]: false });
  }, [activeMapTab]);

  const toggleGroup = (key) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  // Station layers colour the same points by one field, so only one is on at a time.
  const toggleStationLayer = (key) => {
    const turningOn = !layers[key];
    if (turningOn) trackSentinelUse('layer_toggle', { layer: key });
    STATION_LAYER_KEYS.forEach((k) => setLayer(k, turningOn && k === key));
  };

  const isModelsTab = activeMapTab === 'models';


  return (
    <>
      <button
        onClick={toggleLayerPanel}
        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl
                   text-sentinel-900 dark:text-white text-sm font-medium transition-colors ${
                     layerPanelOpen ? 'bg-sentinel-100 dark:bg-sentinel-700' : 'hover:bg-sentinel-100/70 dark:hover:bg-sentinel-700/70'
                   }`}
        aria-label={isModelsTab ? 'Toggle model variables' : 'Toggle layer control'}
        aria-pressed={layerPanelOpen}
      >
        <Layers size={16} />
        <span className="hidden sm:inline">{isModelsTab ? 'Variables' : 'Layers'}</span>
      </button>

      {layerPanelOpen && (
        <div
          className="absolute left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0
                        bottom-20 sm:bottom-full sm:mb-2
                        w-[92vw] max-w-[380px] sm:w-full sm:max-w-none
                        bg-sentinel-900 backdrop-blur-md border border-sentinel-600
                        rounded-2xl shadow-2xl shadow-black/60 overflow-hidden
                        animate-dock-rise"
          style={dockedPanelClearance ? { marginBottom: `${dockedPanelClearance}px` } : undefined}
        >
          <div className="px-3 pt-3 pb-2 border-b border-sentinel-700">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                  {isModelsTab ? 'Model layers' : 'Map layers'}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <div className="relative group">
                  <button
                    type="button"
                    onClick={() => (measureActive && measureMode === 'distance') ? onMeasureClose?.() : onMeasureActivate?.('distance')}
                    className={`w-7 h-7 flex items-center justify-center rounded-md transition-all ${
                      measureActive && measureMode === 'distance'
                        ? 'bg-fire-600/25 text-white border border-fire-600/50'
                        : 'text-sentinel-200 hover:text-white hover:bg-sentinel-700'
                    }`}
                  >
                    <Ruler size={13} />
                  </button>
                  <span className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium bg-sentinel-800 text-sentinel-100 shadow pointer-events-none z-50 opacity-0 group-hover:opacity-100 transition-opacity">
                    Distance
                  </span>
                </div>
                <div className="relative group">
                  <button
                    type="button"
                    onClick={() => (measureActive && measureMode === 'polygon') ? onMeasureClose?.() : onMeasureActivate?.('polygon')}
                    className={`w-7 h-7 flex items-center justify-center rounded-md transition-all ${
                      measureActive && measureMode === 'polygon'
                        ? 'bg-fire-600/25 text-white border border-fire-600/50'
                        : 'text-sentinel-200 hover:text-white hover:bg-sentinel-700'
                    }`}
                  >
                    <Hexagon size={13} />
                  </button>
                  <span className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium bg-sentinel-800 text-sentinel-100 shadow pointer-events-none z-50 opacity-0 group-hover:opacity-100 transition-opacity">
                    Area
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Also capped to what's left between the header and the bottom bar
              (plus any docked outlook panel), so short landscape phone
              screens don't push the panel's header up under the page header. */}
          <div
            className="py-2 max-h-[min(60vh,28rem)] overflow-y-auto scrollbar-panel"
            style={{ maxHeight: `min(60vh, 28rem, calc(100dvh - 14rem - ${dockedPanelClearance}px))` }}
          >
            {/* The Models tab's model / variable / overlay choices live in this same
                pop-up, so switching tabs never changes how layers are picked. */}
            {isModelsTab ? (
              <ModelLayerPanel collapsed={collapsed} onToggleSection={toggleGroup} />
            ) : sections.map((section) => {
              const sectionKey = section.id;
              const isSectionCollapsed = collapsed[sectionKey];

              return (
                <LayerPanelSection
                  key={sectionKey}
                  title={section.title}
                  subtitle={section.subtitle}
                  collapsed={isSectionCollapsed}
                  onToggle={() => toggleGroup(sectionKey)}
                >
                  {section.groups.map((group, groupIndex) => (
                    <div key={`${sectionKey}-${group.label || groupIndex}`}>
                      {group.label && (
                        <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sentinel-400">
                          {group.label}
                        </div>
                      )}
                      <div className="rounded-lg bg-sentinel-900 border border-sentinel-700 divide-y divide-sentinel-700 overflow-hidden">
                        {group.layers.map((layerRef) => {
                          // A group entry may be a plain layer key, or an object
                          // overriding the label/sublabel for this tab's context
                          // (e.g. the wildfire tab renaming "NWS & mesoscale" to
                          // "Red Flag Warnings" for the same weatherAlerts layer).
                          const layerKey = typeof layerRef === 'string' ? layerRef : layerRef.key;

                          if (section.infraLayers) {
                            const layer = section.infraLayers.find((l) => l.key === layerKey);
                            if (!layer) return null;
                            return (
                              <LayerToggle
                                key={layer.key}
                                layerKey={layer.key}
                                label={layer.label}
                                sublabel={layer.sublabel}
                                icon={layer.icon}
                                color={layer.color}
                                locked={layer.locked}
                              />
                            );
                          }
                          const def = LAYER_DEFS[layerKey];
                          if (!def) return null;
                          const label = (typeof layerRef === 'object' && layerRef.label) || def.label;
                          const sublabel = (typeof layerRef === 'object' && layerRef.sublabel) || def.sublabel;
                          if (layerKey === 'windParticles') {
                            return <WindParticlesToggle key={layerKey} label={label} sublabel={sublabel} icon={def.icon} />;
                          }
                          return (
                            <div key={layerKey}>
                              <LayerToggle
                                key={layerKey}
                                layerKey={layerKey}
                                label={label}
                                sublabel={sublabel}
                                icon={def.icon}
                                color={def.color}
                                locked={lockedLayerKeys.has(layerKey)}
                                onToggle={STATION_LAYER_KEYS.includes(layerKey) ? () => toggleStationLayer(layerKey) : undefined}
                              />

                              {layerKey === 'fireRiskOutlook' && (
                                <FireRiskDaySelector />
                              )}
                              {layerKey === 'wpcEro' && (
                                <WpcDaySelector layerKey="wpcEro" product="ero" subtitle="WPC Excessive Rainfall Outlook" accentColor="#38bdf8" />
                              )}
                              {layerKey === 'wpcWssi' && (
                                <WpcDaySelector layerKey="wpcWssi" product="wssi" subtitle="WPC Winter Storm Severity Index" accentColor="#93c5fd" />
                              )}
                              {layerKey === 'wpcQpf' && (
                                <WpcDaySelector layerKey="wpcQpf" product="qpf" subtitle="WPC Precipitation Forecast" accentColor="#0ea5e9" />
                              )}
                              {layerKey === 'wpcFronts' && (
                                <WpcDaySelector layerKey="wpcFronts" product="fronts" subtitle="WPC surface analysis (now) or forecast chart" accentColor="#a78bfa" days={FRONTS_DAYS} heading="Analysis time" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </LayerPanelSection>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
});
export default LayerControl;
