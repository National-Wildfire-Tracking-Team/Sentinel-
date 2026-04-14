/**
 * LayerControl.jsx
 * Floating right panel to toggle all map data layers on/off.
 * Collapsible on mobile.
 */

import { useState } from 'react';
import {
  Layers, Flame, MapPin, Wind, CloudRain, Eye, ChevronDown, ChevronRight, CloudLightning, Radar,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

const LAYER_GROUPS = [
  {
    label: 'Fire Data',
    layers: [
      { key: 'fireHotspots',      label: 'Fire Hotspots',       sublabel: 'Raw NASA FIRMS JSON',   icon: Flame,    color: '#ff4500' },
      { key: 'firePerimeters',    label: 'Fire Perimeters',     sublabel: 'NIFC WFIGS',         icon: MapPin,   color: '#ff6600' },
      { key: 'incidentLocations', label: 'Incident Locations',  sublabel: 'WFIGS Current',      icon: Flame,    color: '#f59e0b' },
      { key: 'userReports',       label: 'Community Reports',   sublabel: 'NWTT verified',      icon: Flame,    color: '#22d3ee' },
    ],
  },
  {
    label: 'Air Quality',
    layers: [
      { key: 'aqi',   label: 'AQI Overlay',    sublabel: 'EPA AirNow + heatmap',   icon: Wind,    color: '#3b82f6' },
      { key: 'smoke', label: 'Smoke Forecast', sublabel: 'NOAA HRRR',   icon: CloudRain, color: '#94a3b8' },
    ],
  },
  {
    label: 'Weather',
    layers: [
      { key: 'weatherAlerts', label: 'Fire Weather Alerts', sublabel: 'NOAA NWS', icon: Wind, color: '#ef4444' },
      { key: 'spcOutlooks', label: 'SPC Risk Outlooks', sublabel: 'SPC Day 1-3 categorical', icon: CloudLightning, color: '#f472b6' },
      { key: 'spcReports', label: 'SPC Storm Reports', sublabel: 'NOAA SPC live reports', icon: CloudLightning, color: '#06b6d4' },
      { key: 'iemReports', label: 'IEM Storm Reports', sublabel: 'Iowa State Mesonet GeoJSON', icon: CloudLightning, color: '#60a5fa' },
    ],
  },
  {
    label: 'Satellite',
    layers: [
      { key: 'goesEast', label: 'GOES East Imagery', sublabel: 'NOAA GOES East', icon: Eye, color: '#8b5cf6' },
      { key: 'goesWest', label: 'GOES West Imagery', sublabel: 'NOAA GOES West', icon: Eye, color: '#7c3aed' },
    ],
  },
  {
    label: 'Radar',
    layers: [
      { key: 'radar', label: 'NEXRAD Reflectivity', sublabel: 'NEXRAD Level 2 composite', icon: Radar, color: '#10b981' },
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

function formatFirmsSourceLabel(sourceKey) {
  if (sourceKey === 'VIIRS_SNPP_NRT') return 'SNPP';
  if (sourceKey === 'VIIRS_NOAA20_NRT') return 'NOAA-20';
  if (sourceKey === 'MODIS_NRT') return 'MODIS';
  return sourceKey;
}

export default function LayerControl({
  activeMapTab = 'wildfire',
  hotspotsCount = 0,
  hotspotsSourceCounts = {},
  perimetersCount = 0,
}) {
  const { layerPanelOpen, toggleLayerPanel } = useApp();
  const [collapsed, setCollapsed] = useState({});
  const visibleGroups = LAYER_GROUPS.filter((group) => {
    if (activeMapTab === 'wildfire') return group.label === 'Fire Data';
    if (activeMapTab === 'radar') return group.label === 'Radar' || group.label === 'Weather';
    return group.label !== 'Fire Data' && group.label !== 'Radar';
  });
  const hotspotsBreakdown = Object.entries(hotspotsSourceCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

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
          <div className="px-3 py-2.5 border-b border-sentinel-700">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sentinel-100 uppercase tracking-widest">
                Map Layers
              </span>
              {/* Quick counts */}
              <div className="flex items-center gap-2 text-[10px] text-sentinel-300">
                <span>{hotspotsCount} hotspots</span>
                <span>·</span>
                <span>{perimetersCount} fires</span>
              </div>
            </div>
            {hotspotsBreakdown.length > 0 && (
              <div className="mt-1.5 text-[10px] text-sentinel-400 flex flex-wrap gap-x-2 gap-y-0.5">
                {hotspotsBreakdown.map(([source, count]) => (
                  <span key={source}>{formatFirmsSourceLabel(source)}: {count}</span>
                ))}
              </div>
            )}
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

                {!collapsed[group.label] && group.layers.map(layer => (
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
