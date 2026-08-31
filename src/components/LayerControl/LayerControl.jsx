/**
 * LayerControl.jsx
 * Floating right panel to toggle all map data layers on/off.
 * Collapsible on mobile. Layers are grouped by the active map tab (Wildfire vs Weather).
 */

import { useState, memo, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Layers, Flame, MapPin, Wind, CloudRain, CloudLightning, Eye, ChevronDown, ChevronRight, Radar, RadioTower, AlertTriangle, Ruler, Hexagon, Satellite, Map as MapIcon, Thermometer, Activity, Droplets, Zap, Lock, GraduationCap, History, TrendingUp, Crosshair, Camera, Mountain, Snowflake,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

/** Layer row definitions — grouped under tab-specific sections below */
const LAYER_DEFS = {
  fireHotspots:      { label: 'Fire Hotspots',       sublabel: 'NASA FIRMS satellite',          icon: Flame,        color: '#ff4500' },
  ngfsDetections:    { label: 'GOES Fire Detections', sublabel: 'NOAA NESDIS NGFS satellite',   icon: Satellite,    color: '#ffa500' },
  firePerimeters:    { label: 'Fire Perimeters',     sublabel: 'NIFC WFIGS',                  icon: MapPin,       color: '#ff6600' },
  calFireHistoricalPerimeters: { label: 'Historical Fire Perimeters', sublabel: 'CAL FIRE FRAP · past fire scars', icon: History, color: '#92400e' },
  incidentLocations: { label: 'Incident Locations',  sublabel: 'WFIGS · NWTT verified',       icon: Flame,        color: '#f59e0b' },
  goesFireTemperature:  { label: 'GOES Fire Temperature', sublabel: 'NOAA GOES-19 · Fire Temperature RGB', icon: Thermometer, color: '#ef4444' },
  evacZones:         { label: 'Evacuation Zones',    sublabel: 'Cal OES + IPAWS + field-reported zones', icon: AlertTriangle, color: '#ef4444' },
  ndgdSmokeForecast: { label: 'Smoke Concentration', sublabel: 'NOAA NDGD hourly (48h)',      icon: CloudRain,    color: '#eab308' },
  droughtOutlook:    { label: 'Drought Outlook',     sublabel: 'NOAA CPC Monthly Outlook',    icon: Droplets,     color: '#f59e0b' },
  fireWeatherOutlooks: { label: 'Fire Weather Outlooks', sublabel: 'SPC Day 1-8 fire weather', icon: Zap,          color: '#ff6b35' },
  fireRiskOutlook: { label: '7-day Fire Risk', sublabel: 'NIFC/NWCG Significant Fire Potential', icon: Flame, color: '#f97316' },
  wpcEro:    { label: 'Excessive Rainfall Outlook', sublabel: 'WPC Day 1-3 flash-flood risk',      icon: CloudRain,  color: '#38bdf8' },
  wpcWssi:   { label: 'Winter Storm Severity',      sublabel: 'WPC Day 1-3 overall impact',        icon: Snowflake,  color: '#93c5fd' },
  wpcQpf:    { label: 'Precipitation Forecast',     sublabel: 'WPC Day 1-3 QPF (24hr)',            icon: Droplets,   color: '#0ea5e9' },
  wpcFronts: { label: 'Surface Analysis Fronts',    sublabel: 'WPC Day 1-3 fronts & troughs',       icon: Wind,       color: '#a78bfa' },
  rawsStations:      { label: 'RAWS Stations',       sublabel: 'Fire weather stations',       icon: Thermometer,  color: '#f97316' },
  airNowMonitors:    { label: 'Air Quality Monitors', sublabel: 'EPA AirNow sensor network',  icon: Activity,     color: '#38bdf8' },
  weatherAlerts:     { label: 'NWS & mesoscale',     sublabel: 'NWS active alerts + SPC MDs', icon: Wind,         color: '#ef4444' },
  stormReports:      { label: 'Storm reports',       sublabel: 'NWS LSR · last 24 hours',     icon: CloudLightning, color: '#7c3aed' },
  damageAssessment:  { label: 'Damage assessment',    sublabel: 'NWS DAT · surveys, last 30 days', icon: Hexagon,    color: '#dc2626' },
  spcWeatherOutlooks: { label: 'SPC outlooks',     sublabel: 'Convective + fire weather',    icon: AlertTriangle, color: '#f59e0b' },
  goesEast:          { label: 'GOES East Imagery',   sublabel: 'NOAA GOES East · visible',    icon: Eye,           color: '#8b5cf6' },
  goesWest:          { label: 'GOES West Imagery',   sublabel: 'NOAA GOES West · visible',    icon: Eye,           color: '#7c3aed' },
  goesFire16:        { label: 'GOES East Fire RGB',  sublabel: 'NOAA GOES East · Day Land Cloud Fire RGB', icon: Eye, color: '#a855f7' },
  goesFire18:        { label: 'GOES West Fire RGB',  sublabel: 'NOAA GOES West · Day Land Cloud Fire RGB', icon: Eye, color: '#9333ea' },
  radar:             { label: 'NEXRAD Reflectivity', sublabel: 'NEXRAD Level 2 composite',     icon: Radar,        color: '#10b981' },
  nexradSites:       { label: 'NEXRAD Sites',        sublabel: 'Level 2 radar station status', icon: RadioTower,   color: '#06b6d4' },
  aqi:               { label: 'AQI Heatmap',          sublabel: 'EPA AirNow gradient overlay',  icon: Wind,         color: '#3b82f6' },
  smoke:             { label: 'Smoke Forecast',      sublabel: 'NOAA HRRR',                   icon: CloudRain,    color: '#94a3b8' },
  waterGauges:        { label: 'Water Gauges',        sublabel: 'NOAA NWPS river & coastal gauges', icon: Droplets, color: '#1e90ff' },
  wildfireCameras:   { label: 'Live CA Cameras',      sublabel: 'Caltrans District CCTV · click for live feed', icon: Camera, color: '#14b8a6' },
  fireBehaviorModeling: { label: 'Fire Behavior Modeling', sublabel: 'Spread projection · select a fire', icon: TrendingUp, color: '#ff3b1f' },
};

/**
 * Sections shown per map tab. Order matches visual stack top → bottom.
 */
const TAB_SECTIONS = {
  allhazard: [
    {
      id: 'ah-fire',
      title: 'Fire activity',
      subtitle: 'Perimeters, hotspots, and incidents',
      groups: [
        {
          label: 'Core layers',
          layers: ['fireHotspots', 'ngfsDetections', 'firePerimeters', 'calFireHistoricalPerimeters', 'incidentLocations'],
        },
        {
          label: 'Evacuation',
          layers: ['evacZones'],
        },
        {
          label: 'Modeling',
          layers: ['fireBehaviorModeling'],
        },
      ],
    },
    {
      id: 'ah-weather',
      title: 'Weather hazards',
      subtitle: 'Alerts, radar, and storm data',
      groups: [
        {
          label: 'Active weather',
          layers: ['weatherAlerts', 'stormReports', 'damageAssessment', 'radar', 'nexradSites'],
        },
        {
          label: 'Flood & water',
          layers: ['waterGauges'],
        },
        {
          label: 'Outlooks',
          layers: ['spcWeatherOutlooks', 'fireWeatherOutlooks', 'fireRiskOutlook', 'wpcEro', 'wpcWssi', 'wpcQpf', 'wpcFronts'],
        },
      ],
    },
    {
      id: 'ah-monitoring',
      title: 'Monitoring & imagery',
      subtitle: 'Smoke, air quality, and satellite',
      groups: [
        {
          label: 'Smoke & drought',
          layers: ['ndgdSmokeForecast', 'smoke', 'droughtOutlook'],
        },
        {
          label: 'Air quality',
          layers: ['airNowMonitors', 'aqi'],
        },
        {
          label: 'Satellite & stations',
          layers: ['goesEast', 'goesWest', 'rawsStations'],
        },
      ],
    },
  ],
  wildfire: [
    {
      id: 'wf-activity',
      title: 'Fire activity',
      subtitle: 'Perimeters, hotspots, and incidents',
      groups: [
        {
          label: 'Core layers',
          layers: ['fireHotspots', 'ngfsDetections', 'firePerimeters', 'calFireHistoricalPerimeters', 'incidentLocations', 'goesFireTemperature'],
        },
        {
          label: 'Modeling',
          layers: ['fireBehaviorModeling'],
        },
      ],
    },
    {
      id: 'wf-evac',
      title: 'Evacuation & outlooks',
      subtitle: 'Zones, smoke, and fire-weather products',
      groups: [
        {
          label: 'Evacuation',
          layers: ['evacZones'],
        },
        {
          label: 'Outlooks & smoke',
          layers: ['fireRiskOutlook', 'ndgdSmokeForecast', 'droughtOutlook', 'fireWeatherOutlooks', 'goesFire16', 'goesFire18'],
        },
      ],
    },
    {
      id: 'wf-monitor',
      title: 'Monitoring',
      subtitle: 'Stations, sensors, and air quality',
      groups: [
        {
          label: 'Flood & water',
          layers: ['waterGauges'],
        },
        {
          label: 'Stations',
          layers: ['rawsStations', 'airNowMonitors'],
        },
        {
          label: 'Overlays',
          layers: ['aqi'],
        },
        {
          label: 'Live cameras',
          layers: ['wildfireCameras'],
        },
      ],
    },
  ],
  weather: [
    {
      id: 'wx-hazards',
      title: 'Weather hazards',
      subtitle: 'Alerts, reports, and outlooks',
      groups: [
        {
          label: 'Active weather',
          layers: ['weatherAlerts', 'stormReports', 'damageAssessment'],
        },
        {
          label: 'Evacuation',
          layers: ['evacZones'],
        },
        {
          label: 'Outlooks',
          layers: ['spcWeatherOutlooks', 'fireWeatherOutlooks', 'fireRiskOutlook', 'wpcEro', 'wpcWssi', 'wpcQpf', 'wpcFronts'],
        },
        {
          label: 'Flood & water',
          layers: ['waterGauges'],
        },
        {
          label: 'Stations',
          layers: ['rawsStations'],
        },
      ],
    },
    {
      id: 'wx-air',
      title: 'Air quality',
      subtitle: 'Forecast and observations',
      groups: [
        {
          label: 'Overlays',
          layers: ['aqi', 'smoke'],
        },
      ],
    },
    {
      id: 'wx-imagery',
      title: 'Radar & satellite',
      subtitle: 'Precipitation and cloud imagery',
      groups: [
        {
          label: 'Imagery',
          layers: ['radar', 'nexradSites', 'goesEast', 'goesWest'],
        },
      ],
    },
  ],
};

function LayerToggle({ layerKey, label, sublabel, icon: Icon, color, locked }) {
  const { layers, toggleLayer } = useApp();
  const active = layers[layerKey];

  if (locked) {
    return (
      <div className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg opacity-90">
        <div
          className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center border border-zinc-600"
        >
          <Lock size={12} className="text-zinc-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-zinc-100 truncate flex items-center gap-1.5">
            {label}
            <span className="text-[9px] font-bold uppercase tracking-wide text-amber-400">Pro</span>
          </div>
          <div className="text-[10px] text-zinc-400 truncate">{sublabel}</div>
        </div>
        <Link
          to="/pricing"
          className="shrink-0 text-[10px] font-semibold text-amber-400 hover:text-amber-300 underline underline-offset-2"
        >
          Upgrade
        </Link>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => toggleLayer(layerKey)}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg
                      hover:bg-white/10 transition-colors group text-left"
      aria-pressed={active}
      aria-label={`Toggle ${label}`}
    >
      <div
        className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center"
        style={{
          backgroundColor: active ? `${color}22` : 'transparent',
          border: `1px solid ${active ? color + '55' : '#52525b'}`,
        }}
      >
        <Icon size={14} style={{ color: active ? color : '#a1a1aa' }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium truncate transition-colors ${active ? 'text-white' : 'text-zinc-100'}`}>
          {label}
        </div>
        <div className="text-[10px] text-zinc-400 leading-snug line-clamp-2">{sublabel}</div>
      </div>

      <div
        className={`shrink-0 relative w-9 h-5 rounded-full transition-colors duration-200
          ${active ? 'bg-fire-600' : 'bg-zinc-600'}`}
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
    <div className="px-2.5 py-2.5 bg-zinc-900/70 border-t border-zinc-800">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Forecast Day
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">
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
                : 'bg-zinc-950 text-zinc-400 border-zinc-700 hover:bg-zinc-800 hover:text-white hover:border-zinc-600'
            }
          `}
          >
            D{day}
          </button>
        );
      })}
    </div>

    <div className="flex justify-between mt-2 text-[9px] text-zinc-600">
      <span>Today</span>
      <span>+7 days</span>
    </div>
    </div>
  );
}

const WPC_DAYS = [
  { key: 'day1', label: 'Day 1' },
  { key: 'day2', label: 'Day 2' },
  { key: 'day3', label: 'Day 3' },
];

/**
 * Shared Day 1-3 selector for the WPC outlook layers (ERO, WSSI, QPF,
 * fronts) — same inline-under-the-toggle pattern as FireRiskDaySelector,
 * parameterized so the four layers don't each need a near-duplicate
 * component.
 */
function WpcDaySelector({ layerKey, product, subtitle, accentColor }) {
  const { layers, wpcOutlookDay, setWpcOutlookDay } = useApp();

  if (!layers[layerKey]) {
    return null;
  }

  const activeDay = wpcOutlookDay[product];

  return (
    <div className="px-2.5 py-2.5 bg-zinc-900/70 border-t border-zinc-800">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Forecast Day
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5">
            {subtitle}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1">
        {WPC_DAYS.map(({ key, label }) => {
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
                  : 'bg-zinc-950 text-zinc-400 border-zinc-700 hover:bg-zinc-800 hover:text-white hover:border-zinc-600'
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
  mapType = 'satellite',
  onMapTypeChange,
  measureActive = false,
  measureMode = 'distance',
  onMeasureActivate,
  onMeasureClose,
  precipRingActive = false,
  onPrecipRingToggle,
}) {
  const { layerPanelOpen, toggleLayerPanel, viewport, setViewport } = useApp();
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
      locked: !infrastructureLayersEntitled,
    },
  ], [infrastructureLayersEntitled]);

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
        subtitle: 'Energy & key facilities (Pro)',
        groups: [{ label: 'Layers', layers: infraLayers.map((l) => l.key) }],
        infraLayers,
      },
    ];
  }, [activeMapTab, infraLayers]);

  // When switching tabs, reset accordion and expand the first section
  useEffect(() => {
    const firstId =
      activeMapTab === 'weather'   ? 'wx-hazards'  :
      activeMapTab === 'allhazard' ? 'ah-fire'     : 'wf-activity';
    setCollapsed({ [firstId]: false });
  }, [activeMapTab]);

  const toggleGroup = (key) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  const tabAccent =
    activeMapTab === 'weather'   ? 'from-sky-600/40 to-black'           :
    activeMapTab === 'allhazard' ? 'from-red-700/40 via-fire-700/20 to-black' :
                                   'from-fire-600/35 to-black';

  const isWeatherTab = activeMapTab === 'weather';
  const isAllHazardTab = activeMapTab === 'allhazard';
  const mapTypeActiveClass =
    isWeatherTab   ? 'bg-sky-600 text-white shadow'  :
    isAllHazardTab ? 'bg-red-600 text-white shadow'   :
                     'bg-fire-600 text-white shadow';

  const isPitched = (viewport?.pitch ?? 0) > 0;
  const toggleTerrainTilt = () => {
    setViewport?.(isPitched ? { pitch: 0, bearing: 0 } : { pitch: 60, bearing: -20 });
  };

  const mapTypeButtons = (
    <>
      <button
        type="button"
        onClick={() => onMapTypeChange?.('satellite')}
        className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${
          mapType === 'satellite' ? mapTypeActiveClass : 'text-zinc-300 hover:text-white'
        }`}
        title="Worldview satellite imagery"
      >
        <Satellite size={11} />
        <span>SAT</span>
      </button>
      <button
        type="button"
        onClick={() => onMapTypeChange?.('rendered')}
        className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${
          mapType === 'rendered' ? mapTypeActiveClass : 'text-zinc-300 hover:text-white'
        }`}
        title="Dark streets map"
      >
        <MapIcon size={11} />
        <span>MAP</span>
      </button>
      <button
        type="button"
        onClick={toggleTerrainTilt}
        className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${
          isPitched ? mapTypeActiveClass : 'text-zinc-300 hover:text-white'
        }`}
        title="Toggle 3D terrain"
      >
        <Mountain size={11} />
        <span>3D</span>
      </button>
    </>
  );

  return (
    <>
      <button
        onClick={toggleLayerPanel}
        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl
                   text-sentinel-900 dark:text-white text-sm font-medium transition-colors ${
                     layerPanelOpen ? 'bg-sentinel-100 dark:bg-zinc-800' : 'hover:bg-sentinel-100/70 dark:hover:bg-zinc-800/70'
                   }`}
        aria-label="Toggle layer control"
        aria-pressed={layerPanelOpen}
      >
        <Layers size={16} />
        <span className="hidden sm:inline">Layers</span>
      </button>

      {layerPanelOpen && (
        <div
          className="absolute left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0
                        bottom-20 sm:bottom-full sm:mb-2
                        w-[92vw] max-w-[380px] sm:w-full sm:max-w-none
                        bg-black backdrop-blur-md border border-zinc-700
                        rounded-2xl shadow-2xl shadow-black/60 overflow-hidden
                        origin-bottom animate-slide-up-panel"
        >
          <div className={`px-3 pt-3 pb-2 border-b border-zinc-800 bg-gradient-to-b ${tabAccent}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                  Map layers
                </span>
                <p className="text-[10px] text-zinc-400 mt-0.5 truncate">
                  {activeMapTab === 'weather'   ? 'Weather, radar, and air quality' :
                   activeMapTab === 'allhazard' ? 'All hazards — fire, weather, smoke, and more' :
                   'Wildfire activity, evacuation zones (California + IPAWS polygons), and outlook data'}
                </p>
              </div>
              <div className="flex items-center shrink-0 bg-zinc-900 border border-zinc-700 rounded-lg p-0.5">
                {mapTypeButtons}
              </div>
            </div>

            <div className="flex items-center justify-end gap-1 mt-2">
              {(isWeatherTab || isAllHazardTab) && (
                <div className="relative group">
                  <button
                    type="button"
                    onClick={onPrecipRingToggle}
                    className={`w-7 h-7 flex items-center justify-center rounded-md transition-all ${
                      precipRingActive
                        ? 'bg-sky-500 text-white border border-sky-400'
                        : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                    }`}
                    aria-label="Toggle dBZ radar probe"
                    aria-pressed={precipRingActive}
                  >
                    <Crosshair size={13} />
                  </button>
                  <span className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium bg-gray-900 text-gray-100 shadow pointer-events-none z-50 opacity-0 group-hover:opacity-100 transition-opacity">
                    dBZ radar probe
                  </span>
                </div>
              )}
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => (measureActive && measureMode === 'distance') ? onMeasureClose?.() : onMeasureActivate?.('distance')}
                  className={`w-7 h-7 flex items-center justify-center rounded-md transition-all ${
                    measureActive && measureMode === 'distance'
                      ? 'bg-orange-500 text-white border border-orange-400'
                      : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <Ruler size={13} />
                </button>
                <span className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium bg-gray-900 text-gray-100 shadow pointer-events-none z-50 opacity-0 group-hover:opacity-100 transition-opacity">
                  Distance
                </span>
              </div>
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => (measureActive && measureMode === 'polygon') ? onMeasureClose?.() : onMeasureActivate?.('polygon')}
                  className={`w-7 h-7 flex items-center justify-center rounded-md transition-all ${
                    measureActive && measureMode === 'polygon'
                      ? 'bg-orange-500 text-white border border-orange-400'
                      : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <Hexagon size={13} />
                </button>
                <span className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium bg-gray-900 text-gray-100 shadow pointer-events-none z-50 opacity-0 group-hover:opacity-100 transition-opacity">
                  Area
                </span>
              </div>
            </div>
          </div>

          <div className="py-2 max-h-[min(60vh,28rem)] overflow-y-auto">
            {sections.map((section) => {
              const sectionKey = section.id;
              const isSectionCollapsed = collapsed[sectionKey];

              return (
                <div key={sectionKey} className="mb-1 last:mb-0 px-2">
                  <button
                    type="button"
                    onClick={() => toggleGroup(sectionKey)}
                    className="w-full flex items-start gap-2 px-1.5 py-2 rounded-lg hover:bg-white/5 transition-colors text-left"
                  >
                    {isSectionCollapsed ? (
                      <ChevronRight size={14} className="shrink-0 text-zinc-500 mt-0.5" />
                    ) : (
                      <ChevronDown size={14} className="shrink-0 text-zinc-500 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-white leading-tight">{section.title}</div>
                      <div className="text-[10px] text-zinc-400 mt-0.5 leading-snug">{section.subtitle}</div>
                    </div>
                  </button>

                  {!isSectionCollapsed && (
                    <div className="pl-1 pb-2 space-y-3">
                      {section.groups.map((group) => (
                        <div key={`${sectionKey}-${group.label}`}>
                          <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                            {group.label}
                          </div>
                          <div className="rounded-lg bg-zinc-950 border border-zinc-800 divide-y divide-zinc-800 overflow-hidden">
                            {group.layers.map((layerRef) => {
                              if (section.infraLayers) {
                                const layer = section.infraLayers.find((l) => l.key === layerRef);
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
                              const def = LAYER_DEFS[layerRef];
                              if (!def) return null;
                              return (
                                <div key={layerRef}>
                                  <LayerToggle
                                    key={layerRef}
                                    layerKey={layerRef}
                                    label={def.label}
                                    sublabel={def.sublabel}
                                    icon={def.icon}
                                    color={def.color}
                                  />

                                  {layerRef === 'fireRiskOutlook' && (
                                    <FireRiskDaySelector />
                                  )}
                                  {layerRef === 'wpcEro' && (
                                    <WpcDaySelector layerKey="wpcEro" product="ero" subtitle="WPC Excessive Rainfall Outlook" accentColor="#38bdf8" />
                                  )}
                                  {layerRef === 'wpcWssi' && (
                                    <WpcDaySelector layerKey="wpcWssi" product="wssi" subtitle="WPC Winter Storm Severity Index" accentColor="#93c5fd" />
                                  )}
                                  {layerRef === 'wpcQpf' && (
                                    <WpcDaySelector layerKey="wpcQpf" product="qpf" subtitle="WPC Precipitation Forecast" accentColor="#0ea5e9" />
                                  )}
                                  {layerRef === 'wpcFronts' && (
                                    <WpcDaySelector layerKey="wpcFronts" product="fronts" subtitle="WPC Surface Analysis Fronts" accentColor="#a78bfa" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
});
export default LayerControl;
