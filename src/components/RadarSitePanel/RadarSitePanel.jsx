/**
 * RadarSitePanel.jsx
 * Slide-in detail panel for a selected NEXRAD radar site. Shows live
 * operability status, last-scan timestamp, and lets the user switch between
 * available Level II products. The actual radar sweep is rendered on the map
 * by NexradScanLayer — this panel is controls + status only.
 */

import { memo } from 'react';
import { X, RadioTower } from 'lucide-react';
import { NEXRAD_STATUS } from '../../api/nexradSites';

const PRODUCTS = [
  { id: 'reflectivity', label: 'Reflectivity', available: true },
  { id: 'velocity', label: 'Velocity', available: true },
  { id: 'spectrumWidth', label: 'Spectrum Width', available: false },
  { id: 'zdr', label: 'ZDR', available: false },
  { id: 'cc', label: 'CC', available: false },
];

/** Combine the site's own RDA operability with the live scan-fetch status into one badge. */
function resolveDisplayStatus(siteStatus, scanStatus) {
  if (siteStatus === 'offline') {
    return { label: 'OFFLINE', color: NEXRAD_STATUS.offline.color };
  }
  if (scanStatus === 'live') return { label: 'LIVE', color: NEXRAD_STATUS.operate.color };
  if (scanStatus === 'loading') return { label: 'LOADING…', color: NEXRAD_STATUS.unknown.color };
  if (scanStatus === 'stale') return { label: 'DATA UNAVAILABLE', color: NEXRAD_STATUS.alarm.color };
  return { label: 'DATA UNAVAILABLE', color: NEXRAD_STATUS.unknown.color };
}

function formatScanTime(scanTime) {
  if (!scanTime) return null;
  const d = scanTime instanceof Date ? scanTime : new Date(scanTime);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function minutesAgo(scanTime) {
  if (!scanTime) return null;
  const d = scanTime instanceof Date ? scanTime : new Date(scanTime);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  return `${mins}m ago`;
}

const RadarSitePanel = memo(function RadarSitePanel({ site, product, onProductChange, meta, status, error, onClose }) {
  if (!site) return null;

  const display = resolveDisplayStatus(site.status, status);
  const scanTime = meta?.scan_time ?? null;

  return (
    <div className="
      fixed right-0 top-0 h-full w-full sm:w-[420px]
      bg-sentinel-900 border-l border-sentinel-700
      flex flex-col z-40 shadow-2xl shadow-black/60
      overflow-hidden
    ">
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-sentinel-700 shrink-0">
        <div className="flex items-start gap-2 min-w-0 mr-3">
          <div className="p-1.5 bg-cyan-900/50 rounded-lg shrink-0 mt-0.5">
            <RadioTower size={16} className="text-cyan-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white leading-tight break-words">
              {site.id} — {site.name}
            </h2>
            <div className="text-[11px] text-sentinel-400 mt-0.5">
              NWS NEXRAD Level II · {site.stationType || 'WSR-88D'}
            </div>
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold text-white mt-1"
              style={{ backgroundColor: display.color }}
            >
              {display.label}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-sentinel-400 hover:text-white transition-colors shrink-0 p-1"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Last scan */}
        <div className="flex gap-2 mb-4">
          <div className="flex-1 bg-sentinel-800/60 rounded-lg p-2.5 border border-sentinel-700">
            <div className="text-[10px] text-sentinel-400 uppercase tracking-wider font-bold mb-0.5">
              Last Scan
            </div>
            <div className="text-lg font-bold text-cyan-400">
              {formatScanTime(scanTime) ?? '—'}
            </div>
            {scanTime && (
              <div className="text-[10px] text-sentinel-500 mt-0.5">{minutesAgo(scanTime)}</div>
            )}
          </div>
        </div>

        {/* Product selector */}
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-sentinel-400">
          Product
        </div>
        <div className="grid grid-cols-3 gap-1.5 mb-4">
          {PRODUCTS.map((p) => {
            const active = product === p.id;
            if (!p.available) {
              return (
                <div
                  key={p.id}
                  className="h-12 rounded-md text-[10px] font-semibold border flex flex-col items-center justify-center gap-0.5 opacity-40 bg-zinc-950 text-zinc-600 border-zinc-800 cursor-not-allowed"
                >
                  <span>{p.label}</span>
                  <span className="text-[8px] uppercase tracking-wide text-amber-500/80">Soon</span>
                </div>
              );
            }
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onProductChange(p.id)}
                aria-pressed={active}
                className={`h-12 rounded-md text-[10px] font-semibold transition-all border ${
                  active
                    ? 'bg-cyan-500 text-white border-cyan-400 shadow-lg shadow-cyan-900/30'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-700 hover:bg-zinc-800 hover:text-white hover:border-zinc-600'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Status messaging */}
        {status === 'loading' && !meta && (
          <div className="flex items-center gap-2 text-xs text-sentinel-400 py-4">
            <div className="w-3 h-3 border-2 border-sentinel-500 border-t-cyan-400 rounded-full animate-spin" />
            Loading first scan — this can take a couple of minutes for a site that hasn't been viewed recently.
          </div>
        )}

        {status === 'stale' && (
          <div className="text-xs text-amber-300 bg-amber-900/20 border border-amber-800 rounded p-2 mb-3">
            Radar data temporarily unavailable.
          </div>
        )}

        {error && (
          <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded p-2 mb-3">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-3 border-t border-sentinel-800">
          <p className="text-[10px] text-sentinel-500 leading-relaxed">
            Live Level II data decoded from NOAA/Unidata radar feeds · Reflectivity + Velocity, lowest tilt.
            Spectrum Width, ZDR, and CC are decodable but not yet wired up.
          </p>
        </div>
      </div>
    </div>
  );
});

export default RadarSitePanel;
