/**
 * RadarSitePanel.jsx
 * Compact popup for a selected NEXRAD Level II radar site — status and
 * product switcher. Docked flush above MapBottomBar (or, if the Composite
 * Radar timeline is also open, flush above that instead) and matched to its
 * width, mirroring RadarTimeline.jsx's Composite Radar scrub bar, so radar
 * controls always grow directly out of the bottom bar instead of floating
 * in a corner. The actual radar sweep is rendered on the map by
 * NexradScanLayer — this widget is controls + status only.
 */

import { memo, forwardRef } from 'react';
import { X, RadioTower } from 'lucide-react';
import { NEXRAD_STATUS } from '../../api/nexradSites';

const PRODUCTS = [
  { id: 'reflectivity', label: 'Reflectivity' },
  { id: 'velocity', label: 'Velocity' },
  { id: 'spectrumWidth', label: 'Spectrum Width' },
  { id: 'zdr', label: 'Differential Reflectivity' },
  { id: 'cc', label: 'Correlation Coefficient' },
];

/** Combine the site's own RDA operability with the live scan-fetch status into one badge. */
function resolveDisplayStatus(siteStatus, scanStatus) {
  if (siteStatus === 'offline') {
    return { label: 'OFFLINE', color: NEXRAD_STATUS.offline.color };
  }
  if (scanStatus === 'live') return { label: 'LIVE', color: NEXRAD_STATUS.operate.color };
  if (scanStatus === 'historical') return { label: 'HISTORY', color: '#a78bfa' };
  if (scanStatus === 'no-history') return { label: 'NO HISTORY', color: NEXRAD_STATUS.unknown.color };
  if (scanStatus === 'loading') return { label: 'LOADING', color: NEXRAD_STATUS.unknown.color };
  if (scanStatus === 'stale') return { label: 'UNAVAILABLE', color: NEXRAD_STATUS.alarm.color };
  return { label: 'UNAVAILABLE', color: NEXRAD_STATUS.unknown.color };
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

const RadarSitePanel = memo(forwardRef(function RadarSitePanel({ site, product, onProductChange, meta, status, error, onClose, bottomBarWidth, bottomBarHeight, topAttached = false }, ref) {
  if (!site) return null;

  const display = resolveDisplayStatus(site.status, status);
  const scanTime = meta?.scan_time ?? null;
  const isLoading = status === 'loading';

  return (
    <div
      ref={ref}
      role="group"
      aria-label="NEXRAD Level II radar site"
      className={`absolute bottom-20 left-1/2 -translate-x-1/2 z-20 w-[min(34rem,calc(100vw-2rem))]
                    bg-white/90 dark:bg-sentinel-900/90 backdrop-blur-sm border border-sentinel-200 dark:border-sentinel-600
                    shadow-2xl shadow-black/10 dark:shadow-black/60 px-2.5 py-1.5 ${
                      // Squared off and borderless on top when the SPC outlook
                      // popup is docked directly above — otherwise this is the
                      // topmost element, so it keeps the rounded "growing out
                      // of the bar" cap.
                      topAttached ? 'rounded-none border-t-0' : 'rounded-t-2xl'
                    }`}
      style={{
        width: bottomBarWidth ? `${bottomBarWidth}px` : undefined,
        bottom: bottomBarHeight ? `${bottomBarHeight + 16}px` : undefined,
      }}
    >
      <div className="flex items-center gap-2">
        <RadioTower size={14} className="shrink-0 text-cyan-500 dark:text-cyan-400" />
        <div className="min-w-0 flex items-center gap-1.5 leading-tight">
          <span className="text-xs font-bold text-sentinel-900 dark:text-white truncate">{site.id}</span>
          <span className="text-[11px] text-sentinel-500 dark:text-sentinel-300 truncate">{site.name}</span>
        </div>
        {isLoading && (
          <span className="shrink-0 flex items-center gap-1.5 text-[10px] text-sentinel-500 dark:text-sentinel-400">
            <span className="w-2.5 h-2.5 border-2 border-sentinel-300 dark:border-sentinel-500 border-t-cyan-500 dark:border-t-cyan-400 rounded-full animate-spin" />
            <span className="hidden sm:inline">{meta ? 'Loading scan…' : 'Loading first scan…'}</span>
          </span>
        )}
        <div className="flex-1" />
        <span
          className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold text-white"
          style={{ backgroundColor: display.color }}
        >
          {display.label}
        </span>
        {!isLoading && (
          <span className="shrink-0 text-[10px] font-mono text-sentinel-500 dark:text-sentinel-300">
            {formatScanTime(scanTime) ?? '—'}
            {scanTime && <span className="ml-1 hidden sm:inline">({minutesAgo(scanTime)})</span>}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 text-sentinel-500 dark:text-sentinel-300 hover:text-sentinel-900 dark:hover:text-white transition-colors p-0.5"
        >
          <X size={14} />
        </button>
      </div>

      <div className="grid grid-cols-5 gap-1 mt-1.5">
        {PRODUCTS.map((p) => {
          const active = product === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onProductChange(p.id)}
              aria-pressed={active}
              className={`min-h-9 flex items-center justify-center text-center px-0.5 py-1 rounded text-[9px] leading-tight font-bold transition-all border ${
                active
                  ? 'bg-cyan-500 text-white border-cyan-400'
                  : 'bg-sentinel-100 dark:bg-sentinel-900 text-sentinel-600 dark:text-sentinel-300 border-sentinel-200 dark:border-sentinel-600 hover:bg-sentinel-200 dark:hover:bg-sentinel-700 hover:text-sentinel-900 dark:hover:text-white'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {status === 'no-history' && (
        <div className="mt-1.5 text-[10px] text-sentinel-500 dark:text-sentinel-400 bg-sentinel-100/70 dark:bg-sentinel-800/50 border border-sentinel-200 dark:border-sentinel-700 rounded px-1.5 py-1">
          No history yet for this site — it builds up the longer this site stays actively viewed (up to 2 hours).
        </div>
      )}

      {status === 'stale' && (
        <div className="mt-1.5 text-[10px] text-amber-600 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-800 rounded px-1.5 py-1">
          Radar data temporarily unavailable.
        </div>
      )}

      {error && (
        <div className="mt-1.5 text-[10px] text-red-500 dark:text-red-400 bg-red-100/70 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded px-1.5 py-1">
          {error}
        </div>
      )}
    </div>
  );
}));

export default RadarSitePanel;
