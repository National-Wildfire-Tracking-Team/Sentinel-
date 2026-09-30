/**
 * FloodHazardStatus.jsx
 * Small top-center status chip for the FEMA Flood Hazard layer: loading,
 * zoom hints, empty-area notice, error + retry — and the FEMA NFHL
 * attribution, which must stay visible whenever the layer is on (the map's
 * own attribution control is disabled, so this is where it lives).
 *
 * Rendered only while the layer is enabled. Never blocks the map: the chip
 * is pointer-events-none apart from its Retry button.
 */

import { memo } from 'react';
import { Droplets, Loader2, AlertTriangle, RotateCw } from 'lucide-react';
import { FLOOD_ATTRIBUTION } from '../../utils/floodHazard';

function statusMessage({ loading, error, belowMinZoom, data }) {
  if (error) return { tone: 'error', text: error };
  if (belowMinZoom) return { tone: 'info', text: 'Zoom in to view flood hazard data' };
  if (loading && !data?.level) return { tone: 'loading', text: 'Loading flood hazard data…' };
  if (data?.level === 'overview') {
    return { tone: loading ? 'loading' : 'info', text: 'Showing where FEMA flood maps exist — zoom in for flood zones' };
  }
  if (data?.level && !data.zones.features.length && !data.panels.features.length) {
    return { tone: 'info', text: 'No digital FEMA flood map for this area (paper FIRM only or unmapped)' };
  }
  if (data?.truncated) return { tone: 'info', text: 'Showing partial flood data — zoom in for full detail' };
  if (data?.stale) return { tone: 'info', text: 'Showing cached flood data — FEMA is not responding' };
  if (loading) return { tone: 'loading', text: 'Updating flood hazard data…' };
  return null;
}

const FloodHazardStatus = memo(function FloodHazardStatus({ loading, error, belowMinZoom, data, onRetry }) {
  const status = statusMessage({ loading, error, belowMinZoom, data });

  return (
    <div
      className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none
                 max-w-[calc(100vw-9rem)] sm:max-w-md"
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
            {status.tone === 'loading' && <Loader2 size={12} className="shrink-0 animate-spin text-sky-300" />}
            {status.tone === 'info' && <Droplets size={12} className="shrink-0 text-sky-300" />}
            {status.tone === 'error' && <AlertTriangle size={12} className="shrink-0 text-red-300" />}
            <span className="truncate">{status.text}</span>
            {status.tone === 'error' && onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="pointer-events-auto ml-1 inline-flex items-center gap-1 rounded-full bg-red-800/80 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-red-700"
              >
                <RotateCw size={10} />
                Retry
              </button>
            )}
          </div>
        )}
        <div className="rounded bg-black/55 px-1.5 py-0.5 text-[9px] leading-tight text-white/80 text-center max-w-full">
          {FLOOD_ATTRIBUTION}
        </div>
      </div>
    </div>
  );
});

export default FloodHazardStatus;
