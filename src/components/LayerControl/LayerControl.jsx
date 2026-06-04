/**
 * LayerControl.jsx
 * Floating right panel to toggle all map data layers on/off.
 * Collapsible on mobile. Layers are grouped by the active map tab (Wildfire vs Weather).
 */

import { useState, memo, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Layers, Flame, MapPin, Wind, CloudRain, CloudLightning, Eye, ChevronDown, ChevronRight, Radar, AlertTriangle, Ruler, Hexagon, PlaneTakeoff, Satellite, Map as MapIcon, Thermometer, Activity, Droplets, Zap, Lock, Users, GraduationCap, Waves,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

/** Layer row definitions — grouped under tab-specific sections below */
const LAYER_DEFS = {
  fireHotspots:      { label: 'Fire Hotspots',       sublabel: 'NASA FIRMS satellite',          icon: Flame,        color: '#ff4500' },
  firePerimeters:    { label: 'Fire Perimeters',     sublabel: 'NIFC WFIGS',                  icon: MapPin,       color: '#ff6600' },
  incidentLocations: { label: 'Incident Locations',  sublabel: 'WFIGS · NWTT verified',       icon: Flame,        color: '#f59e0b' },
  evacZones:         { label: 'Evacuation Zones',    sublabel: 'Cal OES + IPAWS (CAP polygons)', icon: AlertTriangle, color: '#ef4444' },
  reporterEvacZones: { label: 'Reporter Evac Zones', sublabel: 'Field-reported boundaries',   icon: Users,        color: '#f97316' },
  ndgdSmokeForecast: { label: 'Smoke Concentration', sublabel: 'NOAA NDGD hourly (48h)',      icon: CloudRain,    color: '#eab308' },
  droughtOutlook:    { label: 'Drought Outlook',     sublabel: 'NOAA CPC Monthly Outlook',    icon: Droplets,     color: '#f59e0b' },
  fireWeatherOutlooks: { label: 'Fire Weather Outlooks', sublabel: 'SPC Day 1-8 fire weather', icon: Zap,          color: '#ff6b35' },
  rawsStations:      { label: 'RAWS Stations',       sublabel: 'Fire weather stations',       icon: Thermometer,  color: '#f97316' },
  airNowMonitors:    { label: 'Air Quality Monitors', sublabel: 'EPA AirNow sensor network',  icon: Activity,     color: '#38bdf8' },
  weatherAlerts:     { label: 'NWS & mesoscale',     sublabel: 'NWS active alerts + SPC MDs', icon: Wind,         color: '#ef4444' },
  stormReports:      { label: 'Storm reports',       sublabel: 'NWS LSR · last 24 hours',     icon: CloudLightning, color: '#7c3aed' },
  nhcStorms:         { label: 'Tropical Storms',     sublabel: 'NHC active storms + forecast cone', icon: Wind,        color: '#38bdf8' },
  spcWeatherOutlooks: { label: 'SPC outlooks',     sublabel: 'Convective + fire weather',    icon: AlertTriangle, color: '#f59e0b' },
  goesEast:          { label: 'GOES East Imagery',   sublabel: 'NOAA GOES East · visible',    icon: Eye,           color: '#8b5cf6' },
  goesWest:          { label: 'GOES West Imagery',   sublabel: 'NOAA GOES West · visible',    icon: Eye,           color: '#7c3aed' },
  radar:             { label: 'NEXRAD Reflectivity', sublabel: 'NEXRAD Level 2 composite',     icon: Radar,        color: '#10b981' },
  aqi:               { label: 'AQI Heatmap',          sublabel: 'EPA AirNow gradient overlay',  icon: Wind,         color: '#3b82f6' },
  smoke:             { label: 'Smoke Forecast',      sublabel: 'NOAA HRRR',                   icon: CloudRain,    color: '#94a3b8' },
  flights:           { label: 'Live Flight Tracking', sublabel: 'OpenSky Network ADS-B',      icon: PlaneTakeoff, color: '#ff5a00' },
  nhcTropicalWeather: { label: 'Tropical Weather',   sublabel: 'NHC storms · disturbance outlook', icon: Waves, color: '#38bdf8' },
};

/**
 * Sections shown per map tab. Order matches visual stack top → bottom.
 */
const TAB_SECTIONS = {
  wildfire: [
    {
      id: 'wf-activity',
      title: 'Fire activity',
      subtitle: 'Perimeters, hotspots, and incidents',
      groups: [
        {
          label: 'Core layers',
          layers: ['fireHotspots', 'firePerimeters', 'incidentLocations'],
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
          layers: ['evacZones', 'reporterEvacZones'],
        },
        {
          label: 'Outlooks & smoke',
          layers: ['ndgdSmokeForecast', 'droughtOutlook', 'fireWeatherOutlooks'],
        },
      ],
    },
    {
      id: 'wf-monitor',
      title: 'Monitoring',
      subtitle: 'Stations, sensors, and air quality',
      groups: [
        {
          label: 'Stations',
          layers: ['rawsStations', 'airNowMonitors'],
        },
        {
          label: 'Overlays',
          layers: ['aqi'],
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
          layers: ['weatherAlerts', 'stormReports', 'nhcStorms', 'spcWeatherOutlooks'],
        },
        {
          label: 'Tropical',
          layers: ['nhcTropicalWeather'],
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
          layers: ['radar', 'goesEast', 'goesWest'],
        },
      ],
    },
    {
      id: 'wx-aviation',
      title: 'Aviation',
      subtitle: 'ADS-B traffic',
      groups: [
        {
          label: 'Traffic',
          layers: ['flights'],
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
  const { layerPanelOpen, toggleLayerPanel } = useApp();
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
    const base = TAB_SECTIONS[activeMapTab === 'weather' ? 'weather' : 'wildfire'] || TAB_SECTIONS.wildfire;
    if (activeMapTab !== 'wildfire' && activeMapTab !== 'weather') {
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

  // When switching Wildfire / Weather, reset accordion and expand the first section
  useEffect(() => {
    const firstId = activeMapTab === 'weather' ? 'wx-hazards' : 'wf-activity';
    setCollapsed({ [firstId]: false });
  }, [activeMapTab]);

  const toggleGroup = (key) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  const tabAccent =
    activeMapTab === 'weather'
      ? 'from-sky-600/40 to-black'
      : 'from-fire-600/35 to-black';

  const isWeatherTab = activeMapTab === 'weather';
  const mapTypeActiveClass = isWeatherTab
    ? 'bg-sky-600 text-white shadow'
    : 'bg-fire-600 text-white shadow';

  const mapTypeButtons = isWeatherTab
    ? (
      <>
        <button
          type="button"
          onClick={() => onMapTypeChange?.('rendered')}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${
            mapType === 'rendered'
              ? mapTypeActiveClass
              : 'text-zinc-300 hover:text-white'
          }`}
          title="Dark streets map"
        >
          <MapIcon size={11} />
          <span>MAP</span>
        </button>
        <button
          type="button"
          onClick={() => onMapTypeChange?.('satellite')}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${
            mapType === 'satellite'
              ? mapTypeActiveClass
              : 'text-zinc-300 hover:text-white'
          }`}
          title="Satellite view"
        >
          <Satellite size={11} />
          <span>SAT</span>
        </button>
      </>
    )
    : (
      <>
        <button
          type="button"
          onClick={() => onMapTypeChange?.('satellite')}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${
            mapType === 'satellite'
              ? mapTypeActiveClass
              : 'text-zinc-300 hover:text-white'
          }`}
          title="Satellite view"
        >
          <Satellite size={11} />
          <span>SAT</span>
        </button>
        <button
          type="button"
          onClick={() => onMapTypeChange?.('rendered')}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${
            mapType === 'rendered'
              ? mapTypeActiveClass
              : 'text-zinc-300 hover:text-white'
          }`}
          title="Map view"
        >
          <MapIcon size={11} />
          <span>MAP</span>
        </button>
      </>
    );

  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-2">
      <button
        onClick={toggleLayerPanel}
        className="flex items-center gap-2 px-3 py-2 bg-black/95 backdrop-blur-sm
                   border border-zinc-700 rounded-xl shadow-xl
                   text-white text-sm font-medium
                   hover:bg-zinc-950 hover:border-zinc-500 transition-colors"
        aria-label="Toggle layer control"
      >
        <Layers size={15} />
        <span className="hidden sm:inline">Layers</span>
      </button>

      {layerPanelOpen && (
        <div
          className="w-[17.5rem] sm:w-72 bg-black backdrop-blur-md border border-zinc-700
                        rounded-xl shadow-2xl shadow-black/60 overflow-hidden animate-fade-in"
        >
          <div className={`px-3 pt-3 pb-2 border-b border-zinc-800 bg-gradient-to-b ${tabAccent}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                  Map layers
                </span>
                <p className="text-[10px] text-zinc-400 mt-0.5 truncate">
                  {activeMapTab === 'weather'
                    ? 'Weather, radar, and air quality'
                    : 'Wildfire activity, evacuation zones (California + IPAWS polygons), and outlook data'}
                </p>
              </div>
              <div className="flex items-center shrink-0 bg-zinc-900 border border-zinc-700 rounded-lg p-0.5">
                {mapTypeButtons}
              </div>
            </div>

            <div className="flex items-center justify-end gap-1 mt-2">
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
                                <LayerToggle
                                  key={layerRef}
                                  layerKey={layerRef}
                                  label={def.label}
                                  sublabel={def.sublabel}
                                  icon={def.icon}
                                  color={def.color}
                                />
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
    </div>
  );
});
export default LayerControl;
