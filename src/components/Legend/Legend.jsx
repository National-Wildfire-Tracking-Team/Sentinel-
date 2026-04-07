/**
 * Legend.jsx
 * Map legend showing color scales for all active data layers.
 * Positioned bottom-left, collapsible.
 */

import { useState } from 'react';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AQI_CATEGORIES, DROUGHT_CATEGORIES } from '../../utils/colorUtils';

const FRP_SCALE = [
  { color: '#ffe066', label: 'Very Low  (<10 MW)' },
  { color: '#ffea00', label: 'Low  (10–50 MW)' },
  { color: '#ffaa00', label: 'Moderate  (50–100 MW)' },
  { color: '#ff8c00', label: 'High  (100–200 MW)' },
  { color: '#ff4500', label: 'Very High  (200–500 MW)' },
  { color: '#ff0000', label: 'Extreme  (>500 MW)' },
];

function ColorRow({ color, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />
      <span className="text-sentinel-300 text-[11px]">{label}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-3">
      <div className="text-[10px] font-bold text-sentinel-500 uppercase tracking-widest mb-1.5">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

export default function Legend() {
  const { layers, legendOpen, toggleLegend } = useApp();
  const [collapsed, setCollapsed] = useState(false);

  if (!legendOpen) return null;

  const anyActive = layers.fireHotspots || layers.aqi || layers.drought || layers.firePerimeters;
  if (!anyActive) return null;

  return (
    <div className="absolute bottom-10 left-4 z-20 animate-fade-in">
      <div className="bg-sentinel-900/95 backdrop-blur-sm border border-sentinel-700 rounded-xl shadow-2xl overflow-hidden w-48">
        {/* Header */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="w-full flex items-center justify-between px-3 py-2 border-b border-sentinel-700
                     hover:bg-sentinel-800/50 transition-colors"
        >
          <div className="flex items-center gap-1.5 text-sentinel-300">
            <Info size={12} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Legend</span>
          </div>
          {collapsed ? <ChevronDown size={12} className="text-sentinel-500" /> : <ChevronUp size={12} className="text-sentinel-500" />}
        </button>

        {!collapsed && (
          <div className="p-3 space-y-3 max-h-72 overflow-y-auto">

            {/* Fire Hotspots FRP scale */}
            {layers.fireHotspots && (
              <Section title="Fire Intensity (FRP)">
                {FRP_SCALE.map(row => <ColorRow key={row.label} {...row} />)}
              </Section>
            )}

            {/* Fire perimeter */}
            {layers.firePerimeters && (
              <Section title="Fire Perimeters">
                <ColorRow color="#ff6600" label="Active perimeter" />
              </Section>
            )}

            {/* AQI scale */}
            {layers.aqi && (
              <Section title="Air Quality Index">
                {AQI_CATEGORIES.map(cat => (
                  <ColorRow key={cat.label} color={cat.color} label={`${cat.min}–${cat.max} ${cat.label.split(' ')[0]}`} />
                ))}
              </Section>
            )}

            {/* Drought scale */}
            {layers.drought && (
              <Section title="Drought Monitor">
                {DROUGHT_CATEGORIES.map(cat => (
                  <ColorRow key={cat.dm} color={cat.color} label={cat.label} />
                ))}
              </Section>
            )}

            {/* Weather alerts */}
            {layers.weatherAlerts && (
              <Section title="Weather Alerts">
                <ColorRow color="#ef4444" label="Red Flag Warning" />
                <ColorRow color="#f59e0b" label="Fire Weather Watch" />
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
