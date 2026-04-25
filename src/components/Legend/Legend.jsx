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

const SPC_RISK_SCALE = [
  { color: '#55BB55', label: 'TSTM (General Thunderstorms)' },
  { color: '#005500', label: 'MRGL (Marginal)' },
  { color: '#DDAA00', label: 'SLGT (Slight)' },
  { color: '#FF6600', label: 'ENH (Enhanced)' },
  { color: '#FF0000', label: 'MDT (Moderate)' },
  { color: '#FF00FF', label: 'HIGH (High)' },
];

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

const Legend = memo(function Legend() {
  const { layers, legendOpen, toggleLegend } = useApp();
  const [collapsed, setCollapsed] = useState(true);

  if (!legendOpen) return null;

  const anyActive = layers.fireHotspots || layers.aqi || layers.firePerimeters || layers.spcOutlooks || layers.weatherAlerts || layers.radar || layers.incidentLocations || layers.spcReports || layers.iemReports;
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
          <div className="flex items-center gap-1.5 text-sentinel-100">
            <Info size={12} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Legend</span>
          </div>
          {collapsed ? <ChevronDown size={12} className="text-sentinel-300" /> : <ChevronUp size={12} className="text-sentinel-300" />}
        </button>

        {!collapsed && (
          <div className="p-3 space-y-3 max-h-72 overflow-y-auto">

            {/* Incident Locations containment scale */}
            {layers.incidentLocations && (
              <Section title="Fire Containment">
                {CONTAINMENT_SCALE.map(row => <ColorRow key={row.label} {...row} />)}
              </Section>
            )}

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

            {/* NOAA/NWS alerts – official NWS palette (sample of most
                fire-relevant types; full palette in utils/nwsColors.js) */}
            {layers.weatherAlerts && (
              <Section title="NOAA/NWS Alerts">
                <ColorRow color="#ED368D" label="Red Flag Warning" />
                <ColorRow color="#F8DCB1" label="Fire Weather Watch" />
                <ColorRow color="#E43831" label="Tornado Warning" />
                <ColorRow color="#F3A93C" label="Severe Thunderstorm Warning" />
                <ColorRow color="#9DF55A" label="Flash Flood Warning" />
                <ColorRow color="#BE2B82" label="Extreme Heat Warning" />
                <ColorRow color="#CC2936" label="Hurricane Warning" />
                <ColorRow color="#9E5936" label="Fire Warning" />
              </Section>
            )}

            {layers.spcOutlooks && (
              <Section title="SPC Risk Outlooks">
                {SPC_RISK_SCALE.map(row => <ColorRow key={row.label} {...row} />)}
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
