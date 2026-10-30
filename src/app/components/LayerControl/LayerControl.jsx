/**
 * LayerControl.jsx
 * Floating right panel to toggle all map data layers on/off.
 * Collapsible on mobile. Layers are grouped by the active map tab (Wildfire vs Weather).
 */

import { useState, memo, useMemo, useEffect } from 'react';
import { Layers, Ruler, Hexagon, Lock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { trackSentinelUse } from '../../../shared/utils/analytics';
import LayerPanelSection from './LayerPanelSection';
import ModelLayerPanel from '../WeatherModels/ModelLayerPanel';
import { useWeatherModelsContext } from '../../context/WeatherModelsContext';
import { LIGHTNING_URL } from '../../api/lightning';
import { FIRE_DANGER_LAYER_KEYS, FIRE_DANGER_URL, STATION_LAYER_KEYS } from '../../api/fireDanger/stations';

function stationSublabel(text) {
  // Shown even before cloud/fire-danger is deployed, saying so (as Lightning does).
  return FIRE_DANGER_URL ? text : 'NFDRS stations · not set up for this build yet';
}

/** Layer row definitions — grouped under tab-specific sections below */
const LAYER_DEFS = {
  fireHotspots:      { label: 'Fire Hotspots',       sublabel: 'NASA FIRMS satellite',          color: '#ff4500' },
  ngfsDetections:    { label: 'GOES Fire Detections', sublabel: 'NOAA NESDIS NGFS satellite',   color: '#ffa500' },
  wui:      { label: 'California WUI', sublabel: 'CAL Fire Wildland-Urban Interface', color: '#9A7885' },
  calFireHistoricalPerimeters: { label: 'Historical Fire Perimeters', sublabel: 'CAL FIRE FRAP · past fire scars', color: '#92400e' },
  incidentLocations: { label: 'Active Fires',        sublabel: 'WFIGS locations & perimeters · global GOES · VIIRS · MTG satellites · NWTT verified', color: '#f59e0b' },
  evacZones:         { label: 'Evacuation Zones',    sublabel: 'Cal OES + IPAWS + field-reported zones', color: '#ef4444' },
  ndgdSmokeForecast: { label: 'Smoke Concentration', sublabel: 'NOAA NDGD hourly (48h)',      color: '#eab308' },
  droughtOutlook:    { label: 'Drought Outlook',     sublabel: 'NOAA CPC Monthly Outlook',    color: '#f59e0b' },
  fireWeatherOutlooks: { label: 'Fire Weather Outlooks', sublabel: 'SPC Day 1-8 fire weather', color: '#ff6b35' },
  // An official outlook, not an NFDRS adjective danger rating: named for what it is.
  fireRiskOutlook: { label: 'Significant Fire Potential', sublabel: 'NWCG 7-day outlook · official · by area', color: '#f97316' },
  // FEMS NFDRS station values: one row per field; turning one on turns the others off.
  fdErc: { label: 'Energy Release Component', sublabel: stationSublabel('ERC at NFDRS stations · FEMS'), color: '#f97316' },
  fdBi: { label: 'Burning Index', sublabel: stationSublabel('BI at NFDRS stations · FEMS'), color: '#f97316' },
  fdSc: { label: 'Spread Component', sublabel: stationSublabel('SC at NFDRS stations · FEMS'), color: '#f97316' },
  fdDeadFm: { label: 'Dead Fuel Moisture', sublabel: stationSublabel('1-, 10-, 100-, 1000-hour at NFDRS stations'), color: '#38bdf8' },
  fdLiveFm: { label: 'Live Fuel Moisture', sublabel: stationSublabel('Herb & woody, NFDRS-modelled at stations'), color: '#22c55e' },
  wfpi: {
    label: 'Fire Potential Index (gridded)',
    sublabel: FIRE_DANGER_URL ? 'USGS WFPI 7-day forecast · a USGS model, not NFDRS' : 'USGS WFPI 7-day forecast · dates not set up for this build yet',
    color: '#ef4444',
  },
  lfmSamples: { label: 'Live Fuel Moisture Samples', sublabel: 'Measured in the field · WA, OR, ID, MT, WY, SD, ND only', color: '#a855f7' },
  fuelModels: { label: 'Fuel Types & Models', sublabel: 'LANDFIRE 40 fuel models · static map, not moisture', color: '#84cc16' },
  wpcEro:    { label: 'Excessive Rainfall Outlook', sublabel: 'WPC Day 1-3 flash-flood risk',      color: '#38bdf8' },
  wpcWssi:   { label: 'Winter Storm Severity',      sublabel: 'WPC Day 1-3 overall impact',        color: '#93c5fd' },
  wpcQpf:    { label: 'Precipitation Forecast',     sublabel: 'WPC Day 1-3 QPF (24hr)',            color: '#0ea5e9' },
  wpcFronts: { label: 'Surface Analysis Fronts',    sublabel: 'WPC live analysis · fronts, highs & lows',       color: '#a78bfa' },
  rawsStations:      { label: 'RAWS Stations',       sublabel: 'Fire weather stations',       color: '#f97316' },
  airNowMonitors:    { label: 'Air Quality Monitors', sublabel: 'EPA AirNow sensor network',  color: '#38bdf8' },
  weatherAlerts:     { label: 'NWS & mesoscale',     sublabel: 'NWS alerts + SPC & WPC MDs', color: '#ef4444' },
  stormReports:      { label: 'Storm reports',       sublabel: 'NWS LSR · last 24 hours',     color: '#7c3aed' },
  damageAssessment:  { label: 'Damage assessment',    sublabel: 'NWS DAT · surveys, last 30 days', color: '#dc2626' },
  spcWeatherOutlooks: { label: 'SPC outlooks',     sublabel: 'Convective severe weather outlook',    color: '#f59e0b' },
  mrms:              { label: 'Composite Radar',     sublabel: 'NOAA Multi-Radar/Multi-Sensor · 2-min updates', color: '#22c55e' },
  radarSites:        { label: 'Individual Radar Site', sublabel: 'NEXRAD & TDWR stations · click a site for its radar', color: '#9ca3af' },
  // Shown even before cloud/lightning is deployed, saying so (as MRMS does), so the toggle is never missing.
  lightning:         { label: 'Lightning',           sublabel: LIGHTNING_URL ? 'NOAA GOES satellites · last 15 minutes' : 'NOAA GOES satellites · not set up for this build yet', color: '#ffe14d' },
  satellite:         { label: 'Satellite Imagery',   sublabel: 'NOAA GOES-East/West · bands, regions & loops', color: '#8b5cf6' },
  aqi:               { label: 'AQI Heatmap',          sublabel: 'EPA AirNow gradient overlay',  color: '#3b82f6' },
  smoke:             { label: 'Smoke Forecast',      sublabel: 'NOAA HRRR',                   color: '#94a3b8' },
  waterGauges:        { label: 'Water Gauges',        sublabel: 'NOAA NWPS river & coastal gauges', color: '#1e90ff' },
  floodHazard:        { label: 'Flood Hazard',        sublabel: 'FEMA National Flood Hazard Layer · zoom in for zones', color: '#00c8f0' },
  wildfireCameras:   { label: 'Live CA Cameras',      sublabel: 'Caltrans District CCTV · click for live feed', color: '#14b8a6' },
  nhcTropical:      { label: 'NHC Tropical', sublabel: 'Storms, outlook, wind & surge · parts in its drawer', color: '#4dffff' },
  awc:              { label: 'Aviation Weather Center', sublabel: 'METAR & TAF, SIGMETs, PIREPs & more · parts in its drawer', color: '#38bdf8' },
  tfrs:             { label: 'Temporary Flight Restrictions', sublabel: 'FAA TFRs · fire, security, VIP & more', color: '#ef4444' },
  fireBehaviorModeling: { label: 'Fire Behavior Modeling', sublabel: 'Spread projection · select a fire', color: '#ff3b1f' },
  // Not an AppContext layer: shared with the Models tab's own toggle (WindParticlesToggle).
  windParticles: { label: 'Wind Particles', sublabel: 'Animated wind flow · current model hour', color: '#ff5a00' },
  routeToSafety: { label: 'Navigation', sublabel: 'Nearest open shelters · hazard-avoiding routes', color: '#22c55e' },
};

// The wildfire tab's name for the same weatherAlerts layer (it shows Red Flag Warnings only there).
const RED_FLAG_ROW = { key: 'weatherAlerts', label: 'Red Flag Warnings', sublabel: 'NWS active Red Flag Warnings' };

/**
 * Simplified Sentinel: the only rows each tab offers while the mode is on, as
 * one list. All Hazards gets the Wildfire and Weather rows together, less the
 * alerts row (there it's every NWS alert and MD, not just Red Flag Warnings).
 */
const SIMPLIFIED_LAYERS = {
  wildfire: [RED_FLAG_ROW, 'evacZones', 'incidentLocations', 'fireHotspots', 'windParticles', 'routeToSafety'],
  weather: ['mrms', 'radarSites', 'lightning', 'windParticles', 'nhcTropical', 'routeToSafety'],
  allhazard: [
    'evacZones', 'incidentLocations', 'fireHotspots',
    'mrms', 'radarSites', 'lightning', 'windParticles', 'nhcTropical', 'routeToSafety',
  ],
};

const ROW_LIST = 'rounded-lg bg-sentinel-900 border border-sentinel-700 divide-y divide-sentinel-700 overflow-hidden';

// A row entry is a plain layer key, or an object overriding its label/sublabel for one tab.
const layerKeyOf = (layerRef) => (typeof layerRef === 'string' ? layerRef : layerRef.key);


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
          layers: ['incidentLocations', 'evacZones', 'fireHotspots', 'ngfsDetections', 'wui', 'calFireHistoricalPerimeters', 'fireBehaviorModeling'],
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
      id: 'ah-aviation',
      title: 'Aviation',
      groups: [{ layers: ['tfrs', 'awc'] }],
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
            RED_FLAG_ROW,
            'evacZones',
            'incidentLocations',
            'fireHotspots', 'ngfsDetections', 'wui', 'calFireHistoricalPerimeters', 'satellite',
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
    {
      id: 'wf-aviation',
      title: 'Aviation',
      groups: [{ layers: ['tfrs'] }],
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
      id: 'wx-aviation',
      title: 'Aviation',
      groups: [{ layers: ['tfrs', 'awc'] }],
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

function LayerToggle({ layerKey, label, sublabel, locked, lockedPlan = 'Pro', onToggle, active: activeOverride }) {
  const { layers, toggleLayer } = useApp();
  const active = activeOverride ?? layers[layerKey];
  const handleClick = onToggle || (() => {
    if (!active) trackSentinelUse('layer_toggle', { layer: layerKey });
    toggleLayer(layerKey);
  });

  if (locked) {
    // The lock sits where the switch would, since there's nothing to switch.
    return (
      <div className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg opacity-90">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-sentinel-100 truncate flex items-center gap-1.5">
            {label}
            <span className="text-[9px] font-bold uppercase tracking-wide text-amber-400">{lockedPlan}</span>
          </div>
          <div className="text-[10px] text-sentinel-300 truncate">{sublabel}</div>
        </div>
        <div className="shrink-0 w-9 h-5 flex items-center justify-center">
          <Lock size={13} className="text-sentinel-300" aria-hidden />
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
function WindParticlesToggle({ label, sublabel }) {
  const wm = useWeatherModelsContext();
  if (!wm) return null;
  const { particles, setParticles } = wm;
  return (
    <LayerToggle
      layerKey="windParticles"
      label={label}
      sublabel={sublabel}
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
  fireDangerEntitled = false,
  routingEntitled = false,
  measureActive = false,
  measureMode = 'distance',
  onMeasureActivate,
  onMeasureClose,
  dockedPanelClearance = 0,
  simplified = false,
}) {
  const { layerPanelOpen, toggleLayerPanel, layers, setLayer } = useApp();
  const [collapsed, setCollapsed] = useState({});

  const infraLayers = useMemo(() => [
    {
      key: 'criticalInfrastructure',
      label: 'Critical Infrastructure',
      sublabel: 'CMRA power lines · EIA natural gas pipelines',
      color: '#fbbf24',
      locked: !infrastructureLayersEntitled,
    },
    {
      key: 'schoolsUniversities',
      label: 'Schools & Universities',
      sublabel: 'USGS National Map · colleges & universities',
      color: '#a78bfa',
      // Free for everyone; only power lines/pipelines and land ownership are Pro.
      locked: false,
    },
    {
      key: 'landOwnership',
      label: 'Land Ownership',
      sublabel: 'CAL FIRE FRAP · zoom in to load',
      color: '#16a34a',
      locked: !infrastructureLayersEntitled,
    },
  ], [infrastructureLayersEntitled]);

  // Plan-gated rows outside the Infrastructure section (same locked row): key → plan named on it.
  const lockedLayerPlans = useMemo(() => {
    const locked = new Map();
    if (!routingEntitled) locked.set('routeToSafety', 'Pro');
    if (!fireDangerEntitled) FIRE_DANGER_LAYER_KEYS.forEach((key) => locked.set(key, 'Plus'));
    return locked;
  }, [routingEntitled, fireDangerEntitled]);

  const tabKey = activeMapTab === 'weather' ? 'weather' : activeMapTab === 'allhazard' ? 'allhazard' : 'wildfire';

  const sections = useMemo(() => {
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
  }, [activeMapTab, tabKey, infraLayers]);

  // Simplified Sentinel: a layer with no row here can't be switched off, so any
  // other layer that's on (restored with a tab, or turned on from elsewhere,
  // such as the Fire Danger feed) is switched off.
  useEffect(() => {
    if (!simplified || activeMapTab !== tabKey) return;
    const kept = new Set(SIMPLIFIED_LAYERS[tabKey].map(layerKeyOf));
    [...Object.keys(LAYER_DEFS), ...infraLayers.map((l) => l.key)].forEach((key) => {
      if (layers[key] && !kept.has(key)) setLayer(key, false);
    });
  }, [simplified, activeMapTab, tabKey, layers, setLayer, infraLayers]);

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

  const renderRow = (layerRef, infraLayerDefs) => {
    const layerKey = layerKeyOf(layerRef);

    if (infraLayerDefs) {
      const layer = infraLayerDefs.find((l) => l.key === layerKey);
      if (!layer) return null;
      return (
        <LayerToggle
          key={layer.key}
          layerKey={layer.key}
          label={layer.label}
          sublabel={layer.sublabel}
          color={layer.color}
          locked={layer.locked}
        />
      );
    }
    const def = LAYER_DEFS[layerKey];
    if (!def) return null;
    // e.g. the wildfire tab renaming "NWS & mesoscale" to "Red Flag Warnings"
    // for the same weatherAlerts layer.
    const label = (typeof layerRef === 'object' && layerRef.label) || def.label;
    const sublabel = (typeof layerRef === 'object' && layerRef.sublabel) || def.sublabel;
    if (layerKey === 'windParticles') {
      return <WindParticlesToggle key={layerKey} label={label} sublabel={sublabel} />;
    }
    return (
      <div key={layerKey}>
        <LayerToggle
          key={layerKey}
          layerKey={layerKey}
          label={label}
          sublabel={sublabel}
          color={def.color}
          locked={lockedLayerPlans.has(layerKey)}
          lockedPlan={lockedLayerPlans.get(layerKey)}
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
  };


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
            ) : simplified ? (
              <div className="px-2">
                <div className={ROW_LIST}>
                  {SIMPLIFIED_LAYERS[tabKey].map((layerRef) => renderRow(layerRef))}
                </div>
              </div>
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
                      <div className={ROW_LIST}>
                        {group.layers.map((layerRef) => renderRow(layerRef, section.infraLayers))}
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
