/**
 * MrmsStatus.jsx
 * Status row at the top of the MRMS drawer (MrmsPanel, in the bottom bar's
 * pull-up sheet): what is shown and when (product, frame time, age),
 * loading, delayed or missing data, errors with Retry, and the NOAA
 * attribution. The map's own attribution control is disabled, so the credit
 * lives here.
 */

import { memo } from 'react';
import { AlertTriangle, Loader2, Radar, RotateCw } from 'lucide-react';
import { useMrmsContext } from '../../context/MrmsContext';
import { withClock } from '../../utils/formatUtils';
import { useTimeFormat } from '../../hooks/useTimeFormat';

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
  const when = new Date(frame.time).toLocaleTimeString([], withClock({ hour: 'numeric', minute: '2-digit' }));
  const base = `${spec.label} · ${when}${live ? ` (${age(frame.time, now)})` : ''}`;
  if (stale) return { tone: 'error', text: `${base} · radar updates have stopped`, retry: true };
  if (spec.status === 'stale' && live) return { tone: 'info', text: `${base} · MRMS is delayed` };
  if (error) return { tone: 'info', text: `${base} · couldn't refresh`, retry: true };
  return { tone: playing ? 'playing' : 'info', text: base };
}

const MrmsStatus = memo(function MrmsStatus() {
  useTimeFormat();
  const mrms = useMrmsContext();
  if (!mrms?.active) return null;
  const status = statusOf(mrms, Date.now());

  return (
    <div className="space-y-1" role="status" aria-live="polite">
      {status && (
        <div className="flex items-start gap-2 text-[11px]">
          {status.tone === 'loading' && <Loader2 size={13} className="mt-px shrink-0 animate-spin text-green-300 motion-reduce:animate-none" aria-hidden />}
          {(status.tone === 'info' || status.tone === 'playing') && <Radar size={13} className="mt-px shrink-0 text-green-300" aria-hidden />}
          {status.tone === 'error' && <AlertTriangle size={13} className="mt-px shrink-0 text-red-300" aria-hidden />}
          <span className={`min-w-0 flex-1 leading-snug tabular-nums ${status.tone === 'error' ? 'text-red-200' : 'text-sentinel-200'}`}>
            {status.text}
          </span>
          {status.retry && (
            <button
              type="button"
              onClick={mrms.retry}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-red-800/80 px-2 py-0.5 text-[10px] font-semibold text-white transition-transform duration-100 hover:bg-red-700 active:scale-95"
            >
              <RotateCw size={10} aria-hidden /> Retry
            </button>
          )}
        </div>
      )}
      <div className="text-[9px] leading-tight text-sentinel-500">
        {mrms.manifest?.attribution || FALLBACK_ATTRIBUTION}
      </div>
    </div>
  );
});

export default MrmsStatus;
