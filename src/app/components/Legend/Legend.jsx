/**
 * Legend.jsx
 * Map legend showing color scales for all active data layers.
 * Positioned bottom-left, collapsible.
 */

import { useState, memo } from 'react';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AQI_CATEGORIES } from '../../utils/colorUtils';
import { HAZARD_CATEGORY_COLORS } from '../Map/layers/HazardEventsLayer';
import { NEXRAD_STATUS } from '../../api/nexradSites';
import { VELOCITY_SCALE as LIVE_VELOCITY_SCALE } from '../../utils/radarRaster';

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

// SPC Fire Weather Outlook palettes
const FIRE_WX_WIND_SCALE = [
  { color: '#FFE066', label: 'ELEVATED – Wind/RH Risk' },
  { color: '#FF6666', label: 'CRITICAL – Wind/RH Risk' },
  { color: '#FF00FF', label: 'EXTREME – Wind/RH Risk' },
];

const FIRE_WX_LIGHTNING_SCALE = [
  { color: '#8BD8F5', label: 'ELEVATED – Dry Lightning (Isolated)' },
  { color: '#3C6FCD', label: 'CRITICAL – Dry Lightning (Scattered)' },
];

// WPC outlook palettes
const WPC_ERO_SCALE = [
  { color: '#7FBF7F', label: 'Marginal' },
  { color: '#FFE066', label: 'Slight' },
  { color: '#FF6666', label: 'Moderate' },
  { color: '#FF00FF', label: 'High' },
];

const WPC_WSSI_SCALE = [
  { color: '#B0B8C0', label: 'Winter Weather Area' },
  { color: '#8FC1E3', label: 'Minor' },
  { color: '#3A7CA5', label: 'Moderate' },
  { color: '#8E5BA6', label: 'Major' },
  { color: '#C0392B', label: 'Extreme' },
];

const WPC_QPF_SCALE = [
  { color: '#7fff00', label: '≥ 0.0"' },
  { color: '#00cd00', label: '≥ 0.1"' },
  { color: '#008b00', label: '≥ 0.3"' },
  { color: '#104e8b', label: '≥ 0.5"' },
  { color: '#1e90ff', label: '≥ 0.8"' },
  { color: '#00b2ee', label: '≥ 1.0"' },
  { color: '#00eeee', label: '≥ 1.3"' },
  { color: '#8968cd', label: '≥ 1.5"' },
  { color: '#912cee', label: '≥ 1.8"' },
  { color: '#8b008b', label: '≥ 2.0"' },
  { color: '#8b0000', label: '≥ 2.5"' },
  { color: '#cd0000', label: '≥ 3.0"' },
  { color: '#ee4000', label: '≥ 4.0"' },
];

const WPC_FRONTS_SCALE = [
  { color: '#2E6FDB', label: 'Cold front' },
  { color: '#DB2E2E', label: 'Warm front' },
  { color: '#9B59B6', label: 'Stationary front' },
  { color: '#7B4FA6', label: 'Occluded front' },
  { color: '#D97706', label: 'Trough' },
];

const FIRE_BEHAVIOR_SCALE = [
  { color: '#ffd11a', label: '+6h projected spread' },
  { color: '#ff8c1a', label: '+3h projected spread' },
  { color: '#ff3b1f', label: '+1h projected spread' },
];

const NDGD_SMOKE_SCALE = [
  { color: '#ffffa3', label: '0–3 µg/m³' },
  { color: '#fad157', label: '3–25 µg/m³' },
  { color: '#f2a62c', label: '25–63 µg/m³' },
  { color: '#ab5213', label: '63–158 µg/m³' },
  { color: '#690000', label: '158–1000 µg/m³' },
];

const LIVE_VELOCITY_LEGEND_SCALE = LIVE_VELOCITY_SCALE.map(({ min, color }) => ({
  color,
  label: `${min > 0 ? '+' : ''}${min} kt${min < 0 ? ' (toward)' : min > 0 ? ' (away)' : ''}`,
}));

const Legend = memo(function Legend({
  spcOutlookType = 'categorical',
  spcActiveDay = 'day1',
  spcWeatherOutlookMode = 'convective',
  fireWxOutlookType = 'winds_low_humidity',
  radarScanActive = false,
  radarScanProduct = null,
  radarMode = 'composite',
}) {
  const { layers, legendOpen, toggleLegend } = useApp();
  const [collapsed, setCollapsed] = useState(true);

  if (!legendOpen) return null;

  // Hazard event report dots are a permanent (non-toggleable) layer, so the
  // legend is always reachable even if every toggleable layer is off.

  const spcScale = SPC_SCALES[spcOutlookType] || SPC_SCALES.categorical;

  return (
    <div className="absolute bottom-20 sm:bottom-10 left-4 z-20 animate-fade-in">
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

            {layers.fireBehaviorModeling && (
              <Section title="Fire Behavior Modeling">
                {FIRE_BEHAVIOR_SCALE.map(row => <ColorRow key={row.label} {...row} />)}
                <div className="text-sentinel-400 text-[10px] pt-1 mt-1 border-t border-sentinel-700">
                  Estimated from nearby RAWS wind &amp; fuel moisture — situational awareness only, not an official forecast.
                </div>
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
              <Section title="NWS &amp; SPC">
                <ColorRow color="#ED368D" label="Red Flag Warning" />
                <ColorRow color="#F8DCB1" label="Fire Weather Watch" />
                <ColorRow color="#E43831" label="Tornado Warning" />
                <ColorRow color="#F3A93C" label="Severe Tstm Warning" />
                <ColorRow color="#9DF55A" label="Flash Flood Warning" />
                <ColorRow color="#BE2B82" label="Extreme Heat Warning" />
                <ColorRow color="#CC2936" label="Hurricane Warning" />
                <ColorRow color="#9E5936" label="Fire Warning" />
                <div className="pt-1 mt-1 border-t border-sentinel-700" />
                <div className="text-sentinel-300 text-[10px] mb-1">SPC mesoscale: red outline</div>
                <ColorRow color="#e3000f" label="MD polygon (dashed)" />
              </Section>
            )}

            {layers.spcWeatherOutlooks && spcWeatherOutlookMode === 'convective' && (
              <Section title={spcScale.title}>
                {spcScale.scale.map(row => <ColorRow key={row.label} {...row} />)}
              </Section>
            )}

            {layers.stormReports && (
              <Section title="Storm Reports">
                <ColorRow color="#ef4444" label="Tornado" />
                <ColorRow color="#3b82f6" label="Hail" />
                <ColorRow color="#f59e0b" label="Wind" />
                <div className="text-sentinel-300 text-[10px] pt-1 mt-1 border-t border-sentinel-700">
                  NWS LSR: reports from the last 24 hours
                </div>
              </Section>
            )}

            {layers.damageAssessment && (
              <Section title="Damage Assessment (EF/damage scale)">
                <ColorRow color="#84cc16" label="EF0" />
                <ColorRow color="#eab308" label="EF1" />
                <ColorRow color="#f59e0b" label="EF2" />
                <ColorRow color="#f97316" label="EF3" />
                <ColorRow color="#dc2626" label="EF4" />
                <ColorRow color="#7f1d1d" label="EF5" />
                <ColorRow color="#3b82f6" label="TSTM/Wind" />
                <ColorRow color="#9ca3af" label="Unknown" />
                <div className="text-sentinel-300 text-[10px] pt-1 mt-1 border-t border-sentinel-700">
                  NWS DAT: post-storm surveys, last 30 days
                </div>
              </Section>
            )}

            {(layers.radar || (radarScanActive && radarScanProduct === 'reflectivity')) && (
              <Section title="Radar Reflectivity (dBZ)">
                {RADAR_DBZ_SCALE.map(row => <ColorRow key={row.label} {...row} />)}
              </Section>
            )}

            {radarScanActive && radarScanProduct === 'velocity' && (
              <Section title="Radar Velocity (kt)">
                {LIVE_VELOCITY_LEGEND_SCALE.map(row => <ColorRow key={row.label} {...row} />)}
              </Section>
            )}

            {layers.radar && radarMode === 'site' && (
              <Section title="NEXRAD Sites">
                <ColorRow color={NEXRAD_STATUS.operate.color} label={NEXRAD_STATUS.operate.label} />
                <ColorRow color={NEXRAD_STATUS.alarm.color} label={NEXRAD_STATUS.alarm.label} />
                <ColorRow color={NEXRAD_STATUS.offline.color} label={NEXRAD_STATUS.offline.label} />
                <ColorRow color={NEXRAD_STATUS.unknown.color} label={NEXRAD_STATUS.unknown.label} />
              </Section>
            )}

            {layers.ndgdSmokeForecast && (
              <Section title="NOAA Smoke Forecast (NDGD)">
                <div className="text-sentinel-300 text-[10px] mb-1">Hourly surface smoke · µg/m³</div>
                {NDGD_SMOKE_SCALE.map(row => <ColorRow key={row.label} {...row} />)}
              </Section>
            )}

            <Section title="NHC Tropical Weather">
              <div className="text-sentinel-300 text-[10px] mb-1">Invests · disturbance outlook (✕ marker)</div>
              <ColorRow color="#FFE566" label="Low formation chance" />
              <ColorRow color="#FFA040" label="Medium formation chance" />
              <ColorRow color="#FF4444" label="High formation chance" />
              <div className="pt-1 mt-1 border-t border-sentinel-700" />
              <div className="text-sentinel-300 text-[10px] mb-1">Active storms (SSHWS)</div>
              <ColorRow color="#a3e8f0" label="Tropical Depression" />
              <ColorRow color="#4dffff" label="Tropical Storm" />
              <ColorRow color="#ffffd9" label="Category 1" />
              <ColorRow color="#ffd98c" label="Category 2" />
              <ColorRow color="#ff9e59" label="Category 3" />
              <ColorRow color="#ff738a" label="Category 4" />
              <ColorRow color="#ff4d70" label="Category 5" />
              <div className="pt-1 mt-1 border-t border-sentinel-700" />
              <ColorRow color="#888888" label="Past track (observed)" />
              <ColorRow color="#c0c0c0" label="Forecast cone" />
              <div className="pt-1 mt-1 border-t border-sentinel-700" />
              <div className="text-sentinel-300 text-[10px] mb-1">Watches / warnings</div>
              <ColorRow color="#FF0000" label="Hurricane Warning" />
              <ColorRow color="#FF00FF" label="Hurricane Watch" />
              <ColorRow color="#FF8C00" label="Tropical Storm Warning" />
              <ColorRow color="#F0E68C" label="Tropical Storm Watch" />
            </Section>

            {(layers.fireWeatherOutlooks || (layers.spcWeatherOutlooks && spcWeatherOutlookMode === 'fireWx'))
              && fireWxOutlookType === 'winds_low_humidity' && (
              <Section title="Fire Weather – Wind &amp; RH">
                {FIRE_WX_WIND_SCALE.map(row => <ColorRow key={row.label} {...row} />)}
              </Section>
            )}

            {(layers.fireWeatherOutlooks || (layers.spcWeatherOutlooks && spcWeatherOutlookMode === 'fireWx'))
              && fireWxOutlookType === 'dry_thunderstorm' && (
              <Section title="Fire Weather – Dry Lightning">
                {FIRE_WX_LIGHTNING_SCALE.map(row => <ColorRow key={row.label} {...row} />)}
              </Section>
            )}

            {layers.wpcEro && (
              <Section title="WPC Excessive Rainfall Outlook">
                {WPC_ERO_SCALE.map(row => <ColorRow key={row.label} {...row} />)}
              </Section>
            )}

            {layers.wpcWssi && (
              <Section title="WPC Winter Storm Severity Index">
                {WPC_WSSI_SCALE.map(row => <ColorRow key={row.label} {...row} />)}
              </Section>
            )}

            {layers.wpcQpf && (
              <Section title="WPC Precipitation Forecast (24hr)">
                {WPC_QPF_SCALE.map(row => <ColorRow key={row.label} {...row} />)}
              </Section>
            )}

            {layers.wpcFronts && (
              <Section title="WPC Surface Analysis Fronts">
                {WPC_FRONTS_SCALE.map(row => <ColorRow key={row.label} {...row} />)}
              </Section>
            )}

            <Section title="Event Reports">
              <ColorRow color={HAZARD_CATEGORY_COLORS.wildfire} label="Wildfire" />
              <ColorRow color={HAZARD_CATEGORY_COLORS.flooding} label="Flooding" />
              <ColorRow color={HAZARD_CATEGORY_COLORS.hazmat} label="Hazmat" />
              <ColorRow color={HAZARD_CATEGORY_COLORS.other} label="Other" />
            </Section>
          </div>
        )}
      </div>
    </div>
  );
});
export default Legend;
