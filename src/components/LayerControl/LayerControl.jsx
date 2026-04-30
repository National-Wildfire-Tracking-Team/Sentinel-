/**
 * LayerControl.jsx
 * Floating right panel to toggle all map data layers on/off.
 * Collapsible on mobile.
 * Layer groups are scoped to the active map tab (wildfire vs weather).
 */

import { useState, memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Layers, Flame, MapPin, Wind, CloudRain, CloudLightning, Eye, ChevronDown, ChevronRight, Radar, AlertTriangle, Ruler, Hexagon, Satellite, Map as MapIcon, Thermometer, Activity, Droplets, Zap, Lock,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

/** Wildfire tab: fire-first grouping, then environment, then broader weather & imagery */
const WILDFIRE_LAYER_GROUPS = [
  {
    label: 'Fire & incidents',
    layers: [
      { key: 'fireHotspots', label: 'Fire Hotspots', sublabel: 'NASA FIRMS satellite', icon: Flame, color: '#ff4500' },
      { key: 'firePerimeters', label: 'Fire Perimeters', sublabel: 'NIFC WFIGS', icon: MapPin, color: '#ff6600' },
      { key: 'incidentLocations', label: 'Incident Locations', sublabel: 'WFIGS · NWTT verified', icon: Flame, color: '#f59e0b' },
      { key: 'evacZones', label: 'Evacuation Zones', sublabel: 'Cal OES Hosted + PROD', icon: AlertTriangle, color: '#ef4444' },
    ],
  },
  {
    label: 'Fire weather & air',
    layers: [
      { key: 'rawsStations', label: 'RAWS Stations', sublabel: 'Fire weather stations', icon: Thermometer, color: '#f97316' },
      { key: 'fireWeatherOutlooks', label: 'Fire Weather Outlooks', sublabel: 'SPC Day 1–8 fire weather', icon: Zap, color: '#ff6b35' },
      { key: 'airNowMonitors', label: 'Air Quality Monitors', sublabel: 'EPA AirNow sensor network', icon: Activity, color: '#38bdf8' },
      { key: 'ndgdSmokeForecast', label: 'Smoke Concentration', sublabel: 'NOAA NDGD hourly (48h)', icon: CloudRain, color: '#eab308' },
      { key: 'droughtOutlook', label: 'Drought Outlook', sublabel: 'NOAA CPC Monthly Outlook', icon: Droplets, color: '#f59e0b' },
    ],
  },
  {
    label: 'Alerts & convective',
    layers: [
      { key: 'weatherAlerts', label: 'NWS & mesoscale', sublabel: 'NWS active alerts + SPC MDs', icon: Wind, color: '#ef4444' },
      { key: 'stormReports', label: 'Storm reports', sublabel: 'NWS LSR · last 24 hours', icon: CloudLightning, color: '#7c3aed' },
      { key: 'spcWeatherOutlooks', label: 'SPC outlooks', sublabel: 'Convective Day 1–3', icon: AlertTriangle, color: '#f59e0b' },
    ],
  },
  {
    label: 'Satellite',
    layers: [
      { key: 'goesEast', label: 'GOES East Imagery', sublabel: 'NOAA GOES East · visible', icon: Eye, color: '#8b5cf6' },
      { key: 'goesWest', label: 'GOES West Imagery', sublabel: 'NOAA GOES West · visible', icon: Eye, color: '#7c3aed' },
    ],
  },
  {
    label: 'Radar',
    layers: [
      { key: 'radar', label: 'NEXRAD Reflectivity', sublabel: 'NEXRAD Level 2 composite', icon: Radar, color: '#10b981' },
    ],
  },
];

/** Weather tab: hazards first, then imagery — no duplicate fire-only rows */
const WEATHER_LAYER_GROUPS = [
  {
    label: 'Hazards & outlooks',
    layers: [
      { key: 'weatherAlerts', label: 'NWS & mesoscale', sublabel: 'NWS active alerts + SPC MDs', icon: Wind, color: '#ef4444' },
      { key: 'stormReports', label: 'Storm reports', sublabel: 'NWS LSR · last 24 hours', icon: CloudLightning, color: '#7c3aed' },
      { key: 'spcWeatherOutlooks', label: 'SPC outlooks', sublabel: 'Convective Day 1–3', icon: AlertTriangle, color: '#f59e0b' },
    ],
  },
  {
    label: 'Satellite & radar',
    layers: [
      { key: 'goesEast', label: 'GOES East Imagery', sublabel: 'NOAA GOES East · visible', icon: Eye, color: '#8b5cf6' },
      { key: 'goesWest', label: 'GOES West Imagery', sublabel: 'NOAA GOES West · visible', icon: Eye, color: '#7c3aed' },
      { key: 'radar', label: 'NEXRAD Reflectivity', sublabel: 'NEXRAD Level 2 composite', icon: Radar, color: '#10b981' },
    ],
  },
];

function LayerToggle({ layerKey, label, sublabel, icon: Icon, color, locked }) {
  const { layers, toggleLayer } = useApp();
  const active = layers[layerKey];

  if (locked) {
    return (
      <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg opacity-70 border-b border-sentinel-800/80 last:border-b-0">
        <div
          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border border-sentinel-600 bg-sentinel-800/40"
        >
          <Lock size={13} className="text-sentinel-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-sentinel-100 truncate flex items-center gap-1.5">
            {label}
            <span className="text-[9px] font-bold uppercase tracking-wide text-amber-400/90">Pro</span>
          </div>
          <div className="text-[10px] text-sentinel-400 truncate">{sublabel}</div>
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
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                      hover:bg-sentinel-800/60 transition-colors group text-left
                      border-b border-sentinel-800/80 last:border-b-0"
      aria-pressed={active}
      aria-label={`Toggle ${label}`}
    >
      <div
        className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
        style={{
          backgroundColor: active ? `${color}22` : 'rgba(30, 36, 46, 0.6)',
          border: `1px solid ${active ? color + '55' : '#2d3540'}`,
        }}
      >
        <Icon size={15} style={{ color: active ? color : '#6b7a8c' }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium truncate transition-colors ${active ? 'text-white' : 'text-sentinel-100'}`}>
          {label}
        </div>
        <div className="text-[10px] text-sentinel-400 leading-snug truncate">{sublabel}</div>
      </div>

      <div
        className={`shrink-0 relative w-9 h-5 rounded-full transition-colors duration-200
          ${active ? 'bg-fire-600' : 'bg-sentinel-600'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm
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

  const isWeatherTab = activeMapTab === 'weather';
  const accentBar = isWeatherTab ? 'bg-sky-500' : 'bg-fire-500';

  const layerGroups = useMemo(() => {
    const base = activeMapTab === 'wildfire' ? WILDFIRE_LAYER_GROUPS : WEATHER_LAYER_GROUPS;
    const infraLayers = [
      {
        key: 'criticalInfrastructure',
        label: 'Critical Infrastructure',
        sublabel: 'CMRA power lines · EIA natural gas pipelines',
        icon: Zap,
        color: '#fbbf24',
        locked: !infrastructureLayersEntitled,
      },
    ];
    if (activeMapTab === 'wildfire') {
      return [...base, { label: 'Infrastructure', layers: infraLayers }];
    }
    return base;
  }, [activeMapTab, infrastructureLayersEntitled]);

  const toggleGroup = (label) => setCollapsed(c => ({ ...c, [label]: !c[label] }));

  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-2">
      <button
        onClick={toggleLayerPanel}
        className="flex items-center gap-2 px-3.5 py-2.5 bg-sentinel-800/95 backdrop-blur-sm
                   border border-sentinel-600 rounded-xl shadow-lg shadow-black/20
                   text-white text-sm font-medium
                   hover:bg-sentinel-700 hover:border-sentinel-500 transition-all"
        aria-label="Toggle layer control"
      >
        <Layers size={16} strokeWidth={2} />
        <span className="hidden sm:inline">Layers</span>
      </button>

      {layerPanelOpen && (
        <div
          className="w-[min(18rem,calc(100vw-5.5rem))] bg-sentinel-900/98 backdrop-blur-md border border-sentinel-600
                        rounded-xl shadow-2xl shadow-black/30 overflow-hidden animate-fade-in"
        >
          <div className={`h-0.5 w-full ${accentBar}`} aria-hidden />

          <div className="px-3.5 pt-3 pb-2 border-b border-sentinel-700/90">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-sentinel-300 uppercase tracking-[0.2em] block">
                  Map layers
                </span>
                <span className="text-xs text-sentinel-400 mt-0.5 block truncate">
                  {isWeatherTab ? 'Weather mode' : 'Wildfire mode'}
                </span>
              </div>
              <div className="flex shrink-0 items-center bg-sentinel-800 border border-sentinel-600 rounded-lg p-0.5 gap-0.5">
                <button
                  type="button"
                  onClick={() => onMapTypeChange?.('satellite')}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-semibold transition-all ${
                    mapType === 'satellite'
                      ? 'bg-fire-600 text-white shadow-sm'
                      : 'text-sentinel-300 hover:text-white'
                  }`}
                  title="Satellite view"
                >
                  <Satellite size={12} />
                  <span>Sat</span>
                </button>
                <button
                  type="button"
                  onClick={() => onMapTypeChange?.('rendered')}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-semibold transition-all ${
                    mapType === 'rendered'
                      ? 'bg-fire-600 text-white shadow-sm'
                      : 'text-sentinel-300 hover:text-white'
                  }`}
                  title="Map view"
                >
                  <MapIcon size={12} />
                  <span>Map</span>
                </button>
              </div>
            </div>
            <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-sentinel-800/80">
              <span className="text-[10px] font-medium text-sentinel-500 uppercase tracking-wide mr-auto">Measure</span>
              <div className="relative group">
                <button
                  onClick={() => (measureActive && measureMode === 'distance') ? onMeasureClose?.() : onMeasureActivate?.('distance')}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
                    measureActive && measureMode === 'distance'
                      ? 'bg-orange-500 text-white border border-orange-400 shadow-sm'
                      : 'text-sentinel-300 hover:text-white hover:bg-sentinel-700 border border-transparent'
                  }`}
                >
                  <Ruler size={14} />
                </button>
                <span className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium bg-gray-950 text-gray-100 shadow-lg pointer-events-none z-50 opacity-0 group-hover:opacity-100 transition-opacity border border-gray-800">
                  Distance
                </span>
              </div>
              <div className="relative group">
                <button
                  onClick={() => (measureActive && measureMode === 'polygon') ? onMeasureClose?.() : onMeasureActivate?.('polygon')}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
                    measureActive && measureMode === 'polygon'
                      ? 'bg-orange-500 text-white border border-orange-400 shadow-sm'
                      : 'text-sentinel-300 hover:text-white hover:bg-sentinel-700 border border-transparent'
                  }`}
                >
                  <Hexagon size={14} />
                </button>
                <span className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium bg-gray-950 text-gray-100 shadow-lg pointer-events-none z-50 opacity-0 group-hover:opacity-100 transition-opacity border border-gray-800">
                  Area
                </span>
              </div>
            </div>
          </div>

          <div className="max-h-[min(60vh,28rem)] overflow-y-auto overscroll-contain">
            {layerGroups.map((group, gi) => (
              <div
                key={group.label}
                className={gi > 0 ? 'border-t border-sentinel-800/90' : ''}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center gap-2 px-3.5 py-2
                             text-left bg-sentinel-900/50 hover:bg-sentinel-800/40 transition-colors"
                >
                  <span className="text-sentinel-400 shrink-0">
                    {collapsed[group.label]
                      ? <ChevronRight size={14} strokeWidth={2} />
                      : <ChevronDown size={14} strokeWidth={2} />}
                  </span>
                  <span className={`flex-1 min-w-0 text-left text-[11px] font-bold uppercase tracking-wider ${isWeatherTab ? 'text-sky-200/90' : 'text-sentinel-200'}`}>
                    {group.label}
                  </span>
                </button>

                {!collapsed[group.label] && (
                  <div className="px-1.5 pb-2">
                    {group.layers
                      .filter(layer => !layer.wildfireOnly || activeMapTab === 'wildfire')
                      .map(layer => (
                        <LayerToggle key={layer.key} layerKey={layer.key} {...layer} locked={layer.locked} />
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
export default LayerControl;
