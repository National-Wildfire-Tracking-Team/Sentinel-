/**
 * HomeNearbyStrip.jsx
 * Sidebar strip for Home Setup / near-me mode:
 *   - near-me mode on: which radius is filtering the feed, plus any SPC/WPC
 *     Day 1 risk areas that intersect it, with a "Show all" escape hatch
 *   - Home Setup done, near-me off: the saved home + radius, with Edit
 *   - no Home Setup: a prompt to set it up
 */

import { Home, LocateFixed, CloudLightning, CloudRain, Snowflake, Loader2 } from 'lucide-react';
import { useHomeSetup } from '../../context/HomeSetupContext';
import { ERO_RISK_LEVELS } from '../../api/wpcEro';
import { WSSI_IMPACT_LEVELS } from '../../api/wpcWssi';

const SPC_RISK_LEVELS = ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH'];
const SPC_RISK_NAMES = {
  TSTM: 'General Thunderstorms', MRGL: 'Marginal Risk', SLGT: 'Slight Risk',
  ENH: 'Enhanced Risk', MDT: 'Moderate Risk', HIGH: 'High Risk',
};

const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** Highest level present among features, by an ordered level list. */
function highest(features, key, levels) {
  let best = -1;
  for (const f of features) {
    const idx = levels.indexOf(f.properties?.[key]);
    if (idx > best) best = idx;
  }
  return best >= 0 ? levels[best] : null;
}

function riskRows(spcOutlooks, wpcOutlooks) {
  const rows = [];
  const spc = highest(spcOutlooks, 'riskCategory', SPC_RISK_LEVELS);
  if (spc) rows.push({ key: 'spc', icon: CloudLightning, label: `SPC Day 1: ${SPC_RISK_NAMES[spc]}` });
  const ero = highest(wpcOutlooks.filter((f) => f.properties?.product === 'wpc-ero'), 'riskCategory', ERO_RISK_LEVELS);
  if (ero) rows.push({ key: 'ero', icon: CloudRain, label: `WPC Excessive Rainfall: ${titleCase(ero)}` });
  const wssi = highest(wpcOutlooks.filter((f) => f.properties?.product === 'wpc-wssi'), 'impactCategory', WSSI_IMPACT_LEVELS);
  if (wssi) rows.push({ key: 'wssi', icon: Snowflake, label: `WPC Winter Storm: ${titleCase(wssi)}` });
  return rows;
}

export default function HomeNearbyStrip({ nearbyOutlooks }) {
  const { home, isHomeSetupComplete, nearbyActive, clearNearby, openHomeSetup } = useHomeSetup();

  if (!isHomeSetupComplete) {
    return (
      <div className="px-3 py-2 border-b border-sentinel-700 shrink-0">
        <button
          type="button"
          onClick={openHomeSetup}
          className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 border border-dashed border-sentinel-500 hover:bg-sentinel-800 text-xs font-medium text-sentinel-100 rounded-md transition-colors"
        >
          <Home size={13} className="text-fire-400" />
          Set up Home for incidents &amp; alerts near you
        </button>
      </div>
    );
  }

  if (!nearbyActive) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border-b border-sentinel-700 shrink-0 text-xs text-sentinel-200">
        <Home size={13} className="text-fire-400 shrink-0" />
        <span className="truncate flex-1">{home.label || 'Home'} · {home.radiusMiles} mi</span>
        <button type="button" onClick={openHomeSetup} className="shrink-0 font-semibold text-sky-300 hover:text-sky-200">
          Edit
        </button>
      </div>
    );
  }

  const rows = riskRows(nearbyOutlooks.spcOutlooks, nearbyOutlooks.wpcOutlooks);

  return (
    <div className="px-3 py-2 border-b border-sky-800/60 bg-sky-950/30 shrink-0 space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-sky-100">
        <LocateFixed size={13} className="text-sky-300 shrink-0" />
        <span className="flex-1">
          Within <span className="font-semibold">{home.radiusMiles} mi</span> of your current location
        </span>
        <button type="button" onClick={clearNearby} className="shrink-0 font-semibold text-sky-300 hover:text-sky-200">
          Show all
        </button>
      </div>
      {nearbyOutlooks.loading && !rows.length ? (
        <div className="flex items-center gap-1.5 text-[11px] text-sentinel-300">
          <Loader2 size={11} className="animate-spin" /> Checking SPC/WPC outlooks…
        </div>
      ) : rows.length ? (
        rows.map(({ key, icon: Icon, label }) => (
          <div key={key} className="flex items-center gap-1.5 text-[11px] text-amber-200">
            <Icon size={12} className="shrink-0" /> {label}
          </div>
        ))
      ) : (
        <div className="text-[11px] text-sentinel-300">No SPC/WPC Day 1 risk areas in your radius.</div>
      )}
    </div>
  );
}
