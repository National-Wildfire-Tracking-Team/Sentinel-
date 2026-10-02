/**
 * MrmsStatus.jsx
 * Top-center status chip for the MRMS radar layer, like FloodHazardStatus:
 * what is shown and when (product, frame time, age), loading, delayed or
 * missing data, errors with Retry, and the NOAA attribution. The map's own
 * attribution control is disabled, so the credit lives here whenever the
 * layer is on. It never blocks the map apart from its Retry button.
 */

import { memo } from 'react';
import { AlertTriangle, Loader2, Radar, RotateCw } from 'lucide-react';
import { useMrmsContext } from '../../context/MrmsContext';

const FALLBACK_ATTRIBUTION = 'MRMS: NOAA NSSL and NWS NCEP via NOAA Open Data Dissemination on AWS. Processed by Sentinel; not endorsed by NOAA.';

function age(iso, now) {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  return minutes < 1 ? 'just now' : `${minutes} min ago`;
}

function statusOf(mrms, now) {
  const { manifest, error, loading, stale, spec, frame, live, playing } = mrms;
  if (!manifest) {
    if (error) return { tone: 'error', text: `MRMS radar unavailable: ${error.message}`, retry: true };
    return loading ? { tone: 'loading', text: 'Loading MRMS radar…' } : null;
  }
  if (!spec) return { tone: 'error', text: 'This MRMS product is not available' };
  if (!frame) {
    return { tone: 'error', text: `No ${spec.label.toLowerCase()} from MRMS in the last ${manifest.windowMinutes} minutes`, retry: true };
  }
  const when = new Date(frame.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const base = `${spec.label} · ${when}${live ? ` (${age(frame.time, now)})` : ''}`;
  if (stale) return { tone: 'error', text: `${base} · radar updates have stopped`, retry: true };
  if (spec.status === 'stale' && live) return { tone: 'info', text: `${base} · MRMS is delayed` };
  if (error) return { tone: 'info', text: `${base} · couldn't refresh`, retry: true };
  return { tone: playing ? 'playing' : 'info', text: base };
}

const MrmsStatus = memo(function MrmsStatus({ offset = false }) {
  const mrms = useMrmsContext();
  if (!mrms?.active) return null;
  const status = statusOf(mrms, Date.now());

  return (
    <div
      className={`absolute ${offset ? 'top-16' : 'top-3'} left-1/2 -translate-x-1/2 z-20 pointer-events-none max-w-[calc(100vw-9rem)] sm:max-w-md`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-1">
        {status && (
          <div
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium shadow-lg backdrop-blur-sm
              ${status.tone === 'error'
                ? 'bg-red-950/85 border-red-700/70 text-red-100'
                : 'bg-sentinel-900/85 border-sentinel-600 text-sentinel-100'}`}
          >
            {status.tone === 'loading' && <Loader2 size={12} className="shrink-0 animate-spin text-green-300" />}
            {(status.tone === 'info' || status.tone === 'playing') && <Radar size={12} className="shrink-0 text-green-300" />}
            {status.tone === 'error' && <AlertTriangle size={12} className="shrink-0 text-red-300" />}
            <span className="truncate tabular-nums">{status.text}</span>
            {status.retry && (
              <button
                type="button"
                onClick={mrms.retry}
                className="pointer-events-auto ml-1 inline-flex items-center gap-1 rounded-full bg-red-800/80 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-red-700"
              >
                <RotateCw size={10} />
                Retry
              </button>
            )}
          </div>
        )}
        <div className="rounded bg-black/55 px-1.5 py-0.5 text-[9px] leading-tight text-white/80 text-center max-w-full">
          {mrms.manifest?.attribution || FALLBACK_ATTRIBUTION}
        </div>
      </div>
    </div>
  );
});

export default MrmsStatus;
