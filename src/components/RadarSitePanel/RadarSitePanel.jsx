/**
 * RadarSitePanel.jsx
 * Compact floating widget for a selected NEXRAD radar site — status, last
 * scan time, and product switcher. Styled as a small collapsible card
 * (matching Legend.jsx's floating-card conventions) rather than a full-height
 * slide-in, so it stays out of the way of the map. The actual radar sweep is
 * rendered on the map by NexradScanLayer — this widget is controls + status.
 */

import { memo, useState } from 'react';
import { X, RadioTower, ChevronDown, ChevronUp, Play, Pause, Rss, Crosshair, Map as MapIcon, Eye } from 'lucide-react';
import { NEXRAD_STATUS } from '../../api/nexradSites';

const PRODUCTS = [
  { id: 'reflectivity', label: 'REF', available: true },
  { id: 'velocity', label: 'VEL', available: true },
  { id: 'spectrumWidth', label: 'SW', available: false },
  { id: 'zdr', label: 'ZDR', available: false },
  { id: 'cc', label: 'CC', available: false },
];

/** Combine the site's own RDA operability with the live scan-fetch status into one badge. */
function resolveDisplayStatus(siteStatus, scanStatus) {
  if (siteStatus === 'offline') {
    return { label: 'OFFLINE', color: NEXRAD_STATUS.offline.color };
  }
  if (scanStatus === 'live') return { label: 'LIVE', color: NEXRAD_STATUS.operate.color };
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

const RadarSitePanel = memo(function RadarSitePanel({
  site, product, onProductChange, meta, status, error, onClose,
  frames = [], playbackIndex = null, playing = false, onPlayToggle, onScrub, onJumpLive, onRecenter,
  sitesVisible = true, onToggleSitesVisible, viewerCount = null,
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (!site) return null;

  const display = resolveDisplayStatus(site.status, status);
  const isReplaying = playbackIndex !== null;
  const scanTime = isReplaying ? frames[playbackIndex]?.scanTime : meta?.scan_time ?? null;
  const canLoop = frames.length > 1;

  return (
    <div className="absolute top-4 right-4 z-30 w-64 bg-sentinel-900/95 backdrop-blur-sm border border-sentinel-700 rounded-xl shadow-2xl shadow-black/60 overflow-hidden animate-fade-in">
      {/* Header — always visible, single compact row */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-sentinel-700">
        <RadioTower size={14} className="text-cyan-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-white truncate">{site.id}</div>
          <div className="text-[10px] text-sentinel-400 truncate">{site.name}</div>
        </div>
        <span
          className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold text-white"
          style={{ backgroundColor: display.color }}
        >
          {display.label}
        </span>
        {onToggleSitesVisible && (
          <button
            onClick={onToggleSitesVisible}
            className={`shrink-0 transition-colors p-0.5 ${sitesVisible ? 'text-sentinel-400 hover:text-white' : 'text-cyan-400'}`}
            aria-label={sitesVisible ? 'Hide other radar site markers' : 'Show other radar site markers'}
            aria-pressed={!sitesVisible}
            title={sitesVisible ? 'Hide other site markers' : 'Show other site markers'}
          >
            <MapIcon size={14} />
          </button>
        )}
        {onRecenter && (
          <button
            onClick={onRecenter}
            className="shrink-0 text-sentinel-400 hover:text-white transition-colors p-0.5"
            aria-label="Center map on this radar site"
            title="Center on site"
          >
            <Crosshair size={14} />
          </button>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="shrink-0 text-sentinel-400 hover:text-white transition-colors p-0.5"
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        <button
          onClick={onClose}
          className="shrink-0 text-sentinel-400 hover:text-white transition-colors p-0.5"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>

      {!collapsed && (
        <div className="px-3 py-2.5">
          {/* Scan time row */}
          <div className="flex items-center justify-between mb-2.5 text-[11px]">
            <span className="text-sentinel-400 uppercase tracking-wide font-semibold">
              {isReplaying ? 'Replay' : 'Scan'}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-cyan-300 font-mono font-semibold">
                {formatScanTime(scanTime) ?? '—'}
                {scanTime && !isReplaying && (
                  <span className="text-sentinel-500 ml-1.5 font-sans">({minutesAgo(scanTime)})</span>
                )}
              </span>
              {viewerCount != null && (
                <span
                  className="flex items-center gap-0.5 text-sentinel-400 font-sans"
                  title="People currently viewing this radar site"
                >
                  <Eye size={11} />
                  {viewerCount}
                </span>
              )}
            </div>
          </div>

          {/* Loop playback — only once at least 2 scans have been captured this session */}
          {canLoop && (
            <div className="flex items-center gap-1.5 mb-2.5">
              <button
                type="button"
                onClick={onPlayToggle}
                aria-label={playing ? 'Pause radar loop' : 'Play radar loop'}
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded bg-zinc-950 border border-zinc-700 text-cyan-300 hover:bg-zinc-800 transition-colors"
              >
                {playing ? <Pause size={11} /> : <Play size={11} />}
              </button>
              <input
                type="range"
                min={0}
                max={frames.length - 1}
                step={1}
                value={playbackIndex ?? frames.length - 1}
                onChange={(e) => onScrub(Number(e.target.value))}
                className="flex-1 accent-cyan-400 h-1"
                aria-label="Radar scan history scrubber"
              />
              <button
                type="button"
                onClick={onJumpLive}
                disabled={!isReplaying}
                title="Jump to live"
                aria-label="Jump to live scan"
                className={`shrink-0 w-6 h-6 flex items-center justify-center rounded border transition-colors ${
                  isReplaying
                    ? 'bg-zinc-950 border-zinc-700 text-sentinel-400 hover:text-cyan-300 hover:bg-zinc-800'
                    : 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300 cursor-default'
                }`}
              >
                <Rss size={11} />
              </button>
            </div>
          )}

          {/* Product selector — compact row */}
          <div className="grid grid-cols-5 gap-1 mb-2">
            {PRODUCTS.map((p) => {
              const active = product === p.id;
              if (!p.available) {
                return (
                  <div
                    key={p.id}
                    title={`${p.label} — coming soon`}
                    className="h-8 rounded text-[9px] font-semibold border flex items-center justify-center opacity-40 bg-zinc-950 text-zinc-600 border-zinc-800 cursor-not-allowed"
                  >
                    {p.label}
                  </div>
                );
              }
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onProductChange(p.id)}
                  aria-pressed={active}
                  className={`h-8 rounded text-[10px] font-bold transition-all border ${
                    active
                      ? 'bg-cyan-500 text-white border-cyan-400'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-700 hover:bg-zinc-800 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {status === 'loading' && !meta && (
            <div className="flex items-center gap-2 text-[10px] text-sentinel-400 py-1.5">
              <div className="w-2.5 h-2.5 border-2 border-sentinel-500 border-t-cyan-400 rounded-full animate-spin shrink-0" />
              Loading first scan…
            </div>
          )}

          {status === 'stale' && (
            <div className="text-[10px] text-amber-300 bg-amber-900/20 border border-amber-800 rounded p-1.5">
              Radar data temporarily unavailable.
            </div>
          )}

          {error && (
            <div className="text-[10px] text-red-400 bg-red-900/20 border border-red-800 rounded p-1.5">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default RadarSitePanel;
