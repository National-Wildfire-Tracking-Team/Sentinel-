/**
 * Legend.jsx
 * Map legend showing color scales for all active data layers.
 * Positioned bottom-left, collapsible.
 */

import { useState, memo } from 'react';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AQI_CATEGORIES } from '../../utils/colorUtils';

const CONTAINMENT_SCALE = [
  { color: '#ef4444', label: 'Uncontained (0%)' },
  { color: '#f97316', label: 'Low (1–24%)' },
  { color: '#eab308', label: 'Moderate (25–49%)' },
  { color: '#84cc16', label: 'High (50–74%)' },
  { color: '#22c55e', label: 'Contained (75–100%)' },
];

const FRP_SCALE = [
  { color: '#ffe066', label: 'Very Low  (<10 MW)' },
  { color: '#ffea00', label: 'Low  (10–50 MW)' },
  { color: '#ffaa00', label: 'Moderate  (50–100 MW)' },
  { color: '#ff8c00', label: 'High  (100–200 MW)' },
  { color: '#ff4500', label: 'Very High  (200–500 MW)' },
  { color: '#ff0000', label: 'Extreme  (>500 MW)' },
];

const RADAR_DBZ_SCALE = [
  { color: '#04e9e7', label: '5–15 dBZ (Light)' },
  { color: '#009df4', label: '15–20 dBZ (Light)' },
  { color: '#01c501', label: '20–30 dBZ (Moderate)' },
  { color: '#fdf802', label: '30–40 dBZ (Moderate)' },
  { color: '#e5bc00', label: '40–45 dBZ (Heavy)' },
  { color: '#fd9500', label: '45–50 dBZ (Very Heavy)' },
  { color: '#fd0000', label: '50–55 dBZ (Intense)' },
  { color: '#d40000', label: '55–60 dBZ (Extreme)' },
  { color: '#bc0000', label: '60–65 dBZ (Extreme)' },
  { color: '#f800fd', label: '65+ dBZ (Possible Hail)' },
];

// Official SPC categorical palette (NOAA fill colors)
const SPC_CATEGORICAL_SCALE = [
  { color: '#C1E9C1', label: 'TSTM · General Thunderstorms' },
  { color: '#66A366', label: 'MRGL · Marginal Risk' },
  { color: '#FFE066', label: 'SLGT · Slight Risk' },
  { color: '#FFA366', label: 'ENH · Enhanced Risk' },
  { color: '#FF6666', label: 'MDT · Moderate Risk' },
  { color: '#FF88FF', label: 'HIGH · High Risk' },
];

// Probabilistic palettes – probability tiers used by SPC
const SPC_PROB_SCALE = [
  { color: '#008B00', label: '2%' },
  { color: '#004000', label: '5%' },
  { color: '#804000', label: '10%' },
  { color: '#FFFF00', label: '15%' },
  { color: '#FF0000', label: '30%' },
  { color: '#FF00FF', label: '45%' },
  { color: '#800080', label: '60%+' },
];

// Significant tornado uses a different hatching scale; approximate with colors
const SPC_TOR_SCALE = [
  { color: '#008B00', label: '2%' },
  { color: '#004000', label: '5%' },
  { color: '#804000', label: '10%' },
  { color: '#FFFF00', label: '15%' },
  { color: '#FF8000', label: '30%' },
  { color: '#FF0000', label: '45%' },
  { color: '#FF00FF', label: '60%+' },
];

const SPC_SCALES = {
  categorical: { title: 'SPC Categorical Outlook',  scale: SPC_CATEGORICAL_SCALE },
  tornado:     { title: 'SPC Tornado Probability',   scale: SPC_TOR_SCALE },
  hail:        { title: 'SPC Hail Probability',      scale: SPC_PROB_SCALE },
  wind:        { title: 'SPC Wind Probability',      scale: SPC_PROB_SCALE },
  severe:      { title: 'SPC Severe Probability',    scale: SPC_PROB_SCALE },
};

function ColorRow({ color, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />
      <span className="text-sentinel-100 text-[11px]">{label}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-3">
      <div className="text-[10px] font-bold text-sentinel-300 uppercase tracking-widest mb-1.5">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

const Legend = memo(function Legend({ spcOutlookType = 'categorical', spcActiveDay = 'day1' }) {
  const { layers, legendOpen, toggleLegend } = useApp();
  const [collapsed, setCollapsed] = useState(true);

  if (!legendOpen) return null;

  const anyActive = layers.fireHotspots || layers.aqi || layers.firePerimeters || layers.spcOutlooks
    || layers.weatherAlerts || layers.radar || layers.incidentLocations
    || layers.spcReports || layers.iemReports;
  if (!anyActive) return null;

  const spcScale = SPC_SCALES[spcOutlookType] || SPC_SCALES.categorical;

  return (
    <div className="absolute bottom-10 left-4 z-20 animate-fade-in">
      <div className="bg-sentinel-900/95 backdrop-blur-sm border border-sentinel-700 rounded-xl shadow-2xl overflow-hidden w-48">
        {/* Header */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="w-full flex items-center justify-between px-3 py-2 border-b border-sentinel-700
                     hover:bg-sentinel-800/50 transition-colors"
        >
          <div className="flex items-center gap-1.5 text-sentinel-100">
            <Info size={12} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Legend</span>
          </div>
          {collapsed ? <ChevronDown size={12} className="text-sentinel-300" /> : <ChevronUp size={12} className="text-sentinel-300" />}
        </button>

        {!collapsed && (
          <div className="p-3 space-y-3 max-h-72 overflow-y-auto">

            {layers.incidentLocations && (
              <Section title="Fire Containment">
                {CONTAINMENT_SCALE.map(row => <ColorRow key={row.label} {...row} />)}
              </Section>
            )}

            {layers.fireHotspots && (
              <Section title="Fire Intensity (FRP)">
                {FRP_SCALE.map(row => <ColorRow key={row.label} {...row} />)}
              </Section>
            )}

            {layers.firePerimeters && (
              <Section title="Fire Perimeters">
                <ColorRow color="#ff6600" label="Active perimeter" />
              </Section>
            )}

            {layers.aqi && (
              <Section title="Air Quality Index">
                {AQI_CATEGORIES.map(cat => (
                  <ColorRow key={cat.label} color={cat.color} label={`${cat.min}–${cat.max} ${cat.label.split(' ')[0]}`} />
                ))}
              </Section>
            )}

            {layers.weatherAlerts && (
              <Section title="Weather Alerts">
                <ColorRow color="#ED368D" label="Red Flag Warning" />
                <ColorRow color="#F8DCB1" label="Fire Weather Watch" />
                <ColorRow color="#E43831" label="Tornado Warning" />
                <ColorRow color="#F3A93C" label="Severe Tstm Warning" />
                <ColorRow color="#9DF55A" label="Flash Flood Warning" />
                <ColorRow color="#BE2B82" label="Extreme Heat Warning" />
                <ColorRow color="#CC2936" label="Hurricane Warning" />
                <ColorRow color="#9E5936" label="Fire Warning" />
              </Section>
            )}

            {layers.spcOutlooks && (
              <Section title={spcScale.title}>
                {spcScale.scale.map(row => <ColorRow key={row.label} {...row} />)}
              </Section>
            )}

            {(layers.spcReports || layers.iemReports) && (
              <Section title="Storm Reports">
                <ColorRow color="#ef4444" label="Tornado" />
                <ColorRow color="#3b82f6" label="Hail" />
                <ColorRow color="#f59e0b" label="Wind" />
              </Section>
            )}

            {layers.radar && (
              <Section title="Radar Reflectivity (dBZ)">
                {RADAR_DBZ_SCALE.map(row => <ColorRow key={row.label} {...row} />)}
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
export default Legend;
