/**
 * LayerControl.jsx
 * Floating right panel to toggle all map data layers on/off.
 * Collapsible on mobile.
 */

import { useState } from 'react';
import {
  Layers, Flame, MapPin, Wind, CloudRain, Eye, ChevronDown, ChevronRight, CloudLightning, Radar, AlertTriangle, Ruler, Hexagon, PlaneTakeoff, Satellite, Map as MapIcon, Thermometer, Crosshair,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

const LAYER_GROUPS = [
  {
    label: 'Fire Data',
    layers: [
      { key: 'fireHotspots',      label: 'Fire Hotspots',       sublabel: 'NASA FIRMS satellite',   icon: Flame,        color: '#ff4500' },
      { key: 'firePerimeters',    label: 'Fire Perimeters',     sublabel: 'NIFC WFIGS',             icon: MapPin,       color: '#ff6600' },
      { key: 'incidentLocations', label: 'Incident Locations',  sublabel: 'WFIGS Current',          icon: Flame,        color: '#f59e0b' },
      { key: 'userReports',       label: 'Community Reports',   sublabel: 'NWTT verified',          icon: Flame,        color: '#22d3ee' },
      { key: 'evacZones',         label: 'Evacuation Zones',    sublabel: 'Cal OES Hosted',         icon: AlertTriangle, color: '#ef4444' },
      { key: 'rawsStations',      label: 'RAWS Stations',       sublabel: 'Fire weather stations',  icon: Thermometer,  color: '#f97316' },
    ],
  },
  {
    label: 'Air Quality',
    hidden: true,
    layers: [
      { key: 'aqi',   label: 'AQI Overlay',    sublabel: 'EPA AirNow + heatmap',   icon: Wind,    color: '#3b82f6' },
      { key: 'smoke', label: 'Smoke Forecast', sublabel: 'NOAA HRRR',   icon: CloudRain, color: '#94a3b8' },
    ],
  },
  {
    label: 'Weather',
    layers: [
      { key: 'weatherAlerts',  label: 'Fire Weather Alerts',  sublabel: 'NOAA NWS',                  icon: Wind,          color: '#ef4444' },
      { key: 'spcOutlooks',    label: 'SPC Risk Outlooks',    sublabel: 'SPC Day 1-3 categorical',    icon: CloudLightning, color: '#f472b6' },
      { key: 'rawsStations',   label: 'RAWS Stations',        sublabel: 'Fire weather stations',      icon: Thermometer,   color: '#f97316' },
    ],
  },
  {
    label: 'Satellite',
    showOnWildfire: true,
    layers: [
      { key: 'goesEast',   label: 'GOES East Imagery',        sublabel: 'NOAA GOES East · visible',                            icon: Eye, color: '#8b5cf6' },
      { key: 'goesWest',   label: 'GOES West Imagery',        sublabel: 'NOAA GOES West · visible',                            icon: Eye, color: '#7c3aed' },
      { key: 'goesFire16', label: 'GOES-16 Fire RGB',         sublabel: 'ABI-L2-MCMIP Day Land Cloud Fire · s3://noaa-goes16', icon: Eye, color: '#f97316', wildfireOnly: true },
      { key: 'goesFire18', label: 'GOES-18 Fire RGB',         sublabel: 'ABI-L2-MCMIP Day Land Cloud Fire · s3://noaa-goes18', icon: Eye, color: '#fb923c', wildfireOnly: true },
    ],
  },
  {
    label: 'Radar',
    layers: [
      { key: 'radar', label: 'NEXRAD Reflectivity', sublabel: 'NEXRAD Level 2 composite', icon: Radar, color: '#10b981' },
    ],
  },
  {
    label: 'Aviation',
    showAlways: true,
    layers: [
      { key: 'flights', label: 'Live Flight Tracking', sublabel: 'OpenSky Network ADS-B', icon: PlaneTakeoff, color: '#ff5a00' },
    ],
  },
];

function LayerToggle({ layerKey, label, sublabel, icon: Icon, color }) {
  const { layers, toggleLayer } = useApp();
  const active = layers[layerKey];

  return (
    <button
      type="button"
      onClick={() => toggleLayer(layerKey)}
      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg
                      hover:bg-sentinel-700/50 transition-colors group text-left"
      aria-pressed={active}
      aria-label={`Toggle ${label}`}
    >
      {/* Color swatch / icon */}
      <div
        className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center"
        style={{ backgroundColor: active ? `${color}25` : 'transparent',
                 border: `1px solid ${active ? color + '60' : '#2d3540'}` }}
      >
        <Icon size={14} style={{ color: active ? color : '#5a6a7a' }} />
      </div>

      {/* Labels */}
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium truncate transition-colors ${active ? 'text-white' : 'text-sentinel-200'}`}>
          {label}
        </div>
        <div className="text-[10px] text-sentinel-300 truncate">{sublabel}</div>
      </div>

      {/* Toggle switch */}
      <div
        className={`shrink-0 relative w-9 h-5 rounded-full transition-colors duration-200
          ${active ? 'bg-fire-600' : 'bg-sentinel-600'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow
                      transition-transform duration-200 ${active ? 'translate-x-4' : ''}`}
        />
      </div>
    </button>
  );
}

export default function LayerControl({
  activeMapTab = 'wildfire',
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
  const visibleGroups = LAYER_GROUPS.filter((group) => {
    if (group.hidden) return false;
    if (group.showAlways) return true;
    if (activeMapTab === 'wildfire') return group.label === 'Fire Data' || group.showOnWildfire;
    return group.label !== 'Fire Data';
  });

  const toggleGroup = (label) => setCollapsed(c => ({ ...c, [label]: !c[label] }));

  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-2">
      {/* Toggle button */}
      <button
        onClick={toggleLayerPanel}
        className="flex items-center gap-2 px-3 py-2 bg-sentinel-800
                   border border-sentinel-700 rounded-xl shadow-xl
                   text-white text-sm font-medium
                   hover:bg-sentinel-700 transition-colors"
        aria-label="Toggle layer control"
      >
        <Layers size={15} />
        <span className="hidden sm:inline">Layers</span>
      </button>

      {/* Layer panel */}
      {layerPanelOpen && (
        <div className="w-56 bg-sentinel-900 border border-sentinel-700
                        rounded-xl shadow-2xl overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="px-3 pt-2 pb-1.5 border-b border-sentinel-700">
            {/* Row 1: label + map type toggle */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sentinel-100 uppercase tracking-widest">
                Map Layers
              </span>
              {/* Map type toggle */}
              <div className="flex items-center bg-sentinel-800 border border-sentinel-600 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => onMapTypeChange?.('satellite')}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${
                    mapType === 'satellite'
                      ? 'bg-fire-600 text-white shadow'
                      : 'text-sentinel-300 hover:text-white'
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
                      ? 'bg-fire-600 text-white shadow'
                      : 'text-sentinel-300 hover:text-white'
                  }`}
                  title="Map view"
                >
                  <MapIcon size={11} />
                  <span>MAP</span>
                </button>
              </div>
            </div>
            {/* Row 2: measurement tools pushed right */}
            <div className="flex items-center justify-end gap-1 mt-1.5">
              <div className="relative group">
                <button
                  onClick={() => (measureActive && measureMode === 'distance') ? onMeasureClose?.() : onMeasureActivate?.('distance')}
                  className={`w-7 h-7 flex items-center justify-center rounded-md transition-all ${
                    measureActive && measureMode === 'distance'
                      ? 'bg-orange-500 text-white border border-orange-400'
                      : 'text-sentinel-300 hover:text-white hover:bg-sentinel-700'
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
                  onClick={() => (measureActive && measureMode === 'polygon') ? onMeasureClose?.() : onMeasureActivate?.('polygon')}
                  className={`w-7 h-7 flex items-center justify-center rounded-md transition-all ${
                    measureActive && measureMode === 'polygon'
                      ? 'bg-orange-500 text-white border border-orange-400'
                      : 'text-sentinel-300 hover:text-white hover:bg-sentinel-700'
                  }`}
                >
                  <Hexagon size={13} />
                </button>
                <span className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium bg-gray-900 text-gray-100 shadow pointer-events-none z-50 opacity-0 group-hover:opacity-100 transition-opacity">
                  Area
                </span>
              </div>

              {/* Precipitation ring – dBZ sampler at map center */}
              <div className="relative group">
                <button
                  onClick={() => onPrecipRingToggle?.()}
                  className={`w-7 h-7 flex items-center justify-center rounded-md transition-all ${
                    precipRingActive
                      ? 'bg-cyan-500 text-white border border-cyan-400'
                      : 'text-sentinel-300 hover:text-white hover:bg-sentinel-700'
                  }`}
                  title="Precip Ring"
                >
                  <Crosshair size={13} />
                </button>
                <span className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium bg-gray-900 text-gray-100 shadow pointer-events-none z-50 opacity-0 group-hover:opacity-100 transition-opacity">
                  Precip Ring
                </span>
              </div>
            </div>
          </div>

          {/* Layer groups */}
          <div className="py-1 max-h-[60vh] overflow-y-auto">
            {visibleGroups.map(group => (
              <div key={group.label}>
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center gap-2 px-3 py-1.5
                             text-[10px] font-bold text-sentinel-300 uppercase tracking-widest
                             hover:text-white transition-colors"
                >
                  {collapsed[group.label]
                    ? <ChevronRight size={10} />
                    : <ChevronDown size={10} />
                  }
                  {group.label}
                </button>

                {!collapsed[group.label] && group.layers
                  .filter(layer => !layer.wildfireOnly || activeMapTab === 'wildfire')
                  .map(layer => (
                    <LayerToggle key={layer.key} layerKey={layer.key} {...layer} />
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
