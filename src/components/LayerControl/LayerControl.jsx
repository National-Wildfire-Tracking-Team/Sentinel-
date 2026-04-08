/**
 * LayerControl.jsx
 * Floating right panel to toggle all map data layers on/off.
 * Collapsible on mobile.
 */

import { useState } from 'react';
import {
  Layers, Flame, MapPin, Wind, CloudRain, Sun, Eye, EyeOff, ChevronDown, ChevronRight,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

const LAYER_GROUPS = [
  {
    label: 'Fire Data',
    layers: [
      { key: 'fireHotspots',      label: 'Fire Hotspots',       sublabel: 'NASA FIRMS VIIRS',   icon: Flame,    color: '#ff4500' },
      { key: 'firePerimeters',    label: 'Fire Perimeters',     sublabel: 'NIFC WFIGS',         icon: MapPin,   color: '#ff6600' },
      { key: 'incidentLocations', label: 'Incident Locations',  sublabel: 'WFIGS Current',      icon: Flame,    color: '#f59e0b' },
    ],
  },
  {
    label: 'Air Quality',
    layers: [
      { key: 'aqi',   label: 'AQI Stations',   sublabel: 'EPA AirNow',   icon: Wind,    color: '#3b82f6' },
      { key: 'smoke', label: 'Smoke Forecast', sublabel: 'NOAA HRRR',   icon: CloudRain, color: '#94a3b8' },
    ],
  },
  {
    label: 'Weather',
    layers: [
      { key: 'weatherAlerts', label: 'Fire Weather Alerts', sublabel: 'NOAA NWS',        icon: Wind,    color: '#ef4444' },
      { key: 'drought',       label: 'Drought Monitor',     sublabel: 'USDA/UNL USDM',  icon: Sun,     color: '#f59e0b' },
    ],
  },
  {
    label: 'Satellite',
    layers: [
      { key: 'goes', label: 'GOES Imagery', sublabel: 'NOAA GOES East + West', icon: Eye, color: '#8b5cf6' },
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
        <div className={`text-sm font-medium truncate transition-colors ${active ? 'text-white' : 'text-sentinel-400'}`}>
          {label}
        </div>
        <div className="text-[10px] text-sentinel-500 truncate">{sublabel}</div>
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

export default function LayerControl({ hotspotsCount = 0, perimetersCount = 0 }) {
  const { layerPanelOpen, toggleLayerPanel } = useApp();
  const [collapsed, setCollapsed] = useState({});

  const toggleGroup = (label) => setCollapsed(c => ({ ...c, [label]: !c[label] }));

  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-2">
      {/* Toggle button */}
      <button
        onClick={toggleLayerPanel}
        className="flex items-center gap-2 px-3 py-2 bg-sentinel-800/95 backdrop-blur-sm
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
        <div className="w-56 bg-sentinel-900/97 backdrop-blur-sm border border-sentinel-700
                        rounded-xl shadow-2xl overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-sentinel-700">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sentinel-300 uppercase tracking-widest">
                Map Layers
              </span>
              {/* Quick counts */}
              <div className="flex items-center gap-2 text-[10px] text-sentinel-500">
                <span>{hotspotsCount} hotspots</span>
                <span>·</span>
                <span>{perimetersCount} fires</span>
              </div>
            </div>
          </div>

          {/* Layer groups */}
          <div className="py-1 max-h-[60vh] overflow-y-auto">
            {LAYER_GROUPS.map(group => (
              <div key={group.label}>
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center gap-2 px-3 py-1.5
                             text-[10px] font-bold text-sentinel-500 uppercase tracking-widest
                             hover:text-sentinel-300 transition-colors"
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
