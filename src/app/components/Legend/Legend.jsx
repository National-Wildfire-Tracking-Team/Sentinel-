/**
 * Legend.jsx
 * Map legend showing color scales for all active data layers.
 * Positioned bottom-left, collapsible, with the map's distance scale under it.
 * LegendFrame is the shared box; the Models tab fills it with ModelLegend.
 */

import { useState, memo } from 'react';
import MapScaleBar from '../Map/MapScaleBar';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AQI_CATEGORIES } from '../../utils/colorUtils';
import { HAZARD_CATEGORY_LABELS, hazardPinDataUrl } from '../Map/layers/HazardEventsLayer';
import {
  CLUSTER_FILL_COLOR,
  CLUSTER_ACTIVE_RING_COLOR,
  CLUSTER_CONTAINED_RING_COLOR,
} from '../Map/layers/IncidentLocationsLayer';
import { FLOOD_ATTRIBUTION, FLOOD_CATEGORIES } from '../../utils/floodHazard';
import { useMrmsContext } from '../../context/MrmsContext';
import { mrmsLegendRows } from '../../api/mrms';
import { useSatelliteContext } from '../../context/SatelliteContext';
import { LEGENDS as SATELLITE_LEGENDS, attributionFor } from '../../api/goesSatellite';

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

export function ColorRow({ color, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />
      <span className="text-sentinel-100 text-[11px]">{label}</span>
    </div>
  );
}

// A miniature of the map's incident cluster bubble (dark fill, colored ring, count).
function ClusterRow({ ringColor, label }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[8px] font-bold text-white"
        style={{ backgroundColor: CLUSTER_FILL_COLOR, border: `2px solid ${ringColor}` }}
      >
        5
      </span>
      <span className="text-sentinel-100 text-[11px]">{label}</span>
    </div>
  );
}

function IconRow({ src, label }) {
  return (
    <div className="flex items-center gap-2">
      <img src={src} alt="" className="w-4 h-4 shrink-0" />
      <span className="text-sentinel-100 text-[11px]">{label}</span>
    </div>
  );
}

export function Section({ title, children }) {
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

// 'other' is a catch-all fallback color, not a FEMA class worth a legend row.
const FLOOD_HAZARD_SCALE = Object.entries(FLOOD_CATEGORIES)
  .filter(([key]) => key !== 'other')
  .map(([, meta]) => ({ color: meta.color, label: meta.label }));

// MRMS radar: the active product's scale, from the manifest (so it always
// matches the frames). Its own component, so animation frames re-render only this.
function MrmsLegendSection() {
  const mrms = useMrmsContext();
  if (!mrms?.active || !mrms.spec) return null;
  const { spec } = mrms;
  return (
    <Section title={`MRMS ${spec.label}`}>
      {mrmsLegendRows(spec).map((row) => <ColorRow key={row.label} {...row} />)}
      <div className="text-sentinel-400 text-[10px] pt-1 mt-1 border-t border-sentinel-700 leading-snug">{spec.description}</div>
      <div className="text-sentinel-500 text-[9px] leading-snug">{mrms.manifest.attribution}</div>
    </Section>
  );
}

// Satellite: the selected product's interpretation, for the source on screen
// (the loop can come from a different source than the latest scan).
export function SatelliteLegendSection() {
  const sat = useSatelliteContext();
  if (!sat?.active || !sat.source || !sat.product) return null;
  const legend = SATELLITE_LEGENDS[sat.source.legend];
  return (
    <Section title={`${sat.satellite.label} ${sat.product.label}`}>
      {sat.product.detail && <div className="text-sentinel-300 text-[10px] mb-1">{sat.product.detail}</div>}
      {legend?.gradient && (
        <div>
          <div className="h-2 rounded-sm" style={{ background: `linear-gradient(to right, ${legend.gradient.join(', ')})` }} />
          <div className="flex justify-between text-[10px] text-sentinel-300 mt-0.5">
            <span>{legend.ends[0]}</span>
            <span>{legend.ends[1]}</span>
          </div>
        </div>
      )}
      {legend?.swatches?.map((row) => <ColorRow key={row.label} {...row} />)}
      {legend?.note && <div className="text-sentinel-400 text-[10px] pt-1 mt-1 border-t border-sentinel-700 leading-snug">{legend.note}</div>}
      <div className="text-sentinel-500 text-[9px] leading-snug">{attributionFor(sat.source)}</div>
    </Section>
  );
}

/**
 * The bottom-left legend box: a Legend header that expands to show `children`,
 * and the map's distance scale underneath (shown even while the legend is
 * hidden). With nothing to show, the header stays put but doesn't expand.
 */
export function LegendFrame({ map = null, children = null }) {
  const { legendOpen, layerPanelOpen } = useApp();
  const [collapsed, setCollapsed] = useState(true);
  const hasContent = Boolean(children);
  const expanded = hasContent && !collapsed;

  // Below lg the centered bottom bar is wide enough to reach under this
  // corner, so the legend stacks above it instead of beside it, and steps out
  // of the way of the Layers popover (which spans the same space) while open.
  return (
    <div
      className={`absolute bottom-20 lg:bottom-10 left-4 [@media(max-height:500px)]:left-[4.5rem] z-20 animate-fade-in transition-opacity ${
        layerPanelOpen ? 'max-lg:opacity-0 max-lg:pointer-events-none' : ''
      }`}
    >
      {legendOpen && (
      <div className="bg-sentinel-900/95 backdrop-blur-sm border border-sentinel-700 rounded-2xl shadow-2xl overflow-hidden w-48">
        {/* Header */}
        <button
          type="button"
          onClick={() => { if (hasContent) setCollapsed(c => !c); }}
          aria-expanded={hasContent ? expanded : undefined}
          className={`w-full flex items-center justify-between px-3 py-2 border-b border-sentinel-700 transition-colors ${
            hasContent ? 'hover:bg-sentinel-800/50' : 'cursor-default'
          }`}
        >
          <div className="flex items-center gap-1.5 text-sentinel-100">
            <Info size={12} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Legend</span>
          </div>
          {hasContent && (expanded
            ? <ChevronUp size={12} className="text-sentinel-300" />
            : <ChevronDown size={12} className="text-sentinel-300" />)}
        </button>

        {expanded && (
          <div className="p-3 space-y-3 max-h-72 supports-[height:100dvh]:max-h-[min(18rem,calc(100dvh-14rem))] overflow-y-auto">
            {children}
          </div>
        )}
      </div>
      )}
      {/* Hangs from the legend's bottom edge (overlapping its border by 1px so
          the two read as one shape), inset past the rounded corner. */}
      <MapScaleBar map={map} className={legendOpen ? '-mt-px ml-4 relative' : ''} />
    </div>
  );
}

const Legend = memo(function Legend({
  map = null,
  spcOutlookType = 'categorical',
  fireWxOutlookType = 'winds_low_humidity',
}) {
  const { layers } = useApp();

  // Incident report pins are a permanent (non-toggleable) layer, so the
  // legend is always reachable even if every toggleable layer is off.

  const spcScale = SPC_SCALES[spcOutlookType] || SPC_SCALES.categorical;

  return (
    <LegendFrame map={map}>
            {layers.incidentLocations && (
              <Section title="Fire Containment">
                {CONTAINMENT_SCALE.map(row => <ColorRow key={row.label} {...row} />)}
                <div className="pt-1 mt-1 border-t border-sentinel-700 space-y-1">
                  <ClusterRow ringColor={CLUSTER_ACTIVE_RING_COLOR} label="Grouped fires · some active" />
                  <ClusterRow ringColor={CLUSTER_CONTAINED_RING_COLOR} label="Grouped fires · all contained" />
                  <div className="text-sentinel-400 text-[10px]">Number = fires in the group. Zoom in to see each one.</div>
                </div>
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
              <Section title="NWS &amp; Mesoscale">
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
                <div className="text-sentinel-300 text-[10px] mt-1 mb-1">WPC mesoscale: green outline</div>
                <ColorRow color="#00b300" label="MPD polygon (dashed) · heavy rain" />
              </Section>
            )}

            {layers.spcWeatherOutlooks && (
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

            {layers.fireWeatherOutlooks && fireWxOutlookType === 'winds_low_humidity' && (
              <Section title="Fire Weather – Wind &amp; RH">
                {FIRE_WX_WIND_SCALE.map(row => <ColorRow key={row.label} {...row} />)}
              </Section>
            )}

            {layers.fireWeatherOutlooks && fireWxOutlookType === 'dry_thunderstorm' && (
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

            {layers.mrms && <MrmsLegendSection />}

            {layers.satellite && <SatelliteLegendSection />}

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

            {layers.floodHazard && (
              <Section title="FEMA Flood Hazard">
                {FLOOD_HAZARD_SCALE.map(row => <ColorRow key={row.label} {...row} />)}
                <div className="text-sentinel-400 text-[10px] pt-1 mt-1 border-t border-sentinel-700 leading-snug">
                  Zoomed out: shaded areas have digital FEMA flood maps. Unshaded areas have no digital map (paper FIRM or unmapped).
                </div>
                <div className="text-sentinel-500 text-[9px] leading-snug">{FLOOD_ATTRIBUTION}</div>
              </Section>
            )}

            <Section title="Incident Reports">
              {Object.entries(HAZARD_CATEGORY_LABELS).map(([key, label]) => (
                <IconRow key={key} src={hazardPinDataUrl(key)} label={label} />
              ))}
            </Section>
    </LegendFrame>
  );
});
export default Legend;
