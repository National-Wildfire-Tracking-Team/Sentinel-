/**
 * RadarSitePanel.jsx
 * Radar Site controls, shown in the bottom bar's pull-up sheet (DockSheet,
 * via MapDockSheet) under the "Radar Site" tab. The first thing inside is the
 * selected station's status: station, product, elevation, scan time and age,
 * loading and errors with Retry, then the data credit.
 */

import { memo, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Radar, RotateCw } from 'lucide-react';
import { useRadarSiteContext } from '../../context/RadarSiteContext';
import { withClock } from '../../utils/formatUtils';
import { useTimeFormat } from '../../hooks/useTimeFormat';

const ATTRIBUTION = 'Radar: NOAA NWS NEXRAD Level 3 via Unidata & AWS Open Data · site list from supercell-wx';

function age(ms, now) {
  const minutes = Math.max(0, Math.round((now - ms) / 60000));
  return minutes < 1 ? 'just now' : `${minutes} min ago`;
}

/** Status lines for the selected station (formerly the top-of-map chip). */
function statusOf(radar, now) {
  const { site, product, status, scan, error, stale } = radar;
  if (!site) return { tone: 'hint', title: 'No radar site selected', detail: 'Tap a station pill on the map to load its radar' };
  const title = `${site.id} · ${site.place}${site.state ? `, ${site.state}` : ''}`;
  if (status === 'idle' || (status === 'loading' && !scan)) return { tone: 'loading', title, detail: 'Loading latest scan…' };
  if (status === 'empty') return { tone: 'error', title, detail: 'No scans in the last 3 hours', retry: true };
  if (!scan) return { tone: 'error', title, detail: `Radar unavailable${error ? `: ${error.message}` : ''}`, retry: true };

  const when = new Date(scan.time).toLocaleTimeString([], withClock({ hour: 'numeric', minute: '2-digit' }));
  const detail = `${product?.label ?? 'Reflectivity'} ${scan.elevation.toFixed(1)}° · ${when} (${age(scan.time, now)})`;
  if (stale) return { tone: 'error', title, detail: `${detail} · radar is delayed`, retry: true };
  if (error) return { tone: 'info', title, detail: `${detail} · couldn't refresh`, retry: true };
  return { tone: 'info', title, detail };
}

/** Minute tick so "n min ago" stays current. */
function useNow(enabled) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

const RadarSitePanel = memo(function RadarSitePanel() {
  useTimeFormat();
  const radar = useRadarSiteContext();
  const now = useNow(Boolean(radar?.active));
  if (!radar?.active) return null;
  const status = statusOf(radar, now);

  return (
    <div className="px-3 pt-2.5 pb-3 space-y-2">
      <div className="flex items-start gap-2" role="status" aria-live="polite">
        {status.tone === 'loading' && <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin text-gray-300 motion-reduce:animate-none" aria-hidden />}
        {(status.tone === 'info' || status.tone === 'hint') && <Radar size={14} className="mt-0.5 shrink-0 text-gray-300" aria-hidden />}
        {status.tone === 'error' && <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-300" aria-hidden />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-white">{status.title}</div>
          <div className={`text-[11px] leading-snug tabular-nums ${status.tone === 'error' ? 'text-red-200' : 'text-sentinel-300'}`}>
            {status.detail}
          </div>
        </div>
        {status.retry && (
          <button
            type="button"
            onClick={radar.retry}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-red-800/80 px-2 py-0.5 text-[10px] font-semibold text-white transition-transform duration-100 hover:bg-red-700 active:scale-95"
          >
            <RotateCw size={10} aria-hidden /> Retry
          </button>
        )}
      </div>
      {radar.site && <div className="text-[9px] leading-tight text-sentinel-500">{ATTRIBUTION}</div>}
    </div>
  );
});

export default RadarSitePanel;
