/**
 * PrecipitationRing.jsx
 * Center-locked crosshair and panel for sampling NEXRAD reflectivity (dBZ).
 *
 * Exports:
 * PrecipitationRing  – absolute-positioned overlay (renders outside <Map>)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, ChevronUp, Lock, Unlock, X } from 'lucide-react';
import { classifyDbz, sampleRadarAtPoint } from '../../services/radarProbe';

// dBZ value → display color
function dbzColor(dbz) {
  if (dbz === null) return '#4b5563';
  if (dbz < 15) return '#22d3ee';
  if (dbz < 30) return '#4ade80';
  if (dbz < 40) return '#facc15';
  if (dbz < 50) return '#f97316';
  if (dbz < 60) return '#ef4444';
  if (dbz <= 70) return '#f43f5e';
  return '#d946ef';
}

// ── PrecipitationRing ─────────────────────────────────────────────────────────

/**
 * Renders a crosshair ring fixed to the map center with a dBZ readout bubble.
 * Must be rendered as a sibling of <Map> inside the map container div.
 *
 * @param {{ active: boolean, lat: number, lng: number, moving?: boolean,
 *   locked?: boolean, radarVisible?: boolean, onLockToggle?: Function,
 *   onClose?: Function }} props
 */
export function PrecipitationRing({
  active,
  lat,
  lng,
  moving = false,
  locked = false,
  radarVisible = true,
  onLockToggle,
  onClose,
}) {
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('idle'); // 'idle'|'loading'|'ok'|'error'
  const [collapsed, setCollapsed] = useState(false);
  const abortRef = useRef(null);
  const coordsRef = useRef({ lat, lng });

  useEffect(() => {
    coordsRef.current = { lat, lng };
  }, [lat, lng]);

  const doQuery = useCallback(async (latitude, longitude) => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus('loading');
    try {
      const nextResult = await sampleRadarAtPoint(latitude, longitude, ctrl.signal);
      setResult(nextResult);
      setStatus('ok');
    } catch (e) {
      if (e.name !== 'AbortError') setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!active || !radarVisible) {
      abortRef.current?.abort();
      setResult(null);
      setStatus('idle');
      return undefined;
    }

    const sampleCurrentPoint = () => {
      const current = coordsRef.current;
      doQuery(current.lat, current.lng);
    };
    sampleCurrentPoint();
    const interval = setInterval(sampleCurrentPoint, moving ? 500 : 15_000);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [active, moving, radarVisible, doQuery]);

  if (!active) return null;

  const dbz = result?.dbz ?? null;
  const color = dbzColor(dbz);
  const hasData = status === 'ok' && dbz !== null;
  const scanTime = result?.scanTime
    ? new Intl.DateTimeFormat(undefined, {
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    }).format(result.scanTime)
    : 'Unavailable';

  return (
    <>
      {!locked && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-30" aria-hidden="true">
        <svg
          width="56" height="56" viewBox="0 0 56 56"
          style={{ filter: `drop-shadow(0 0 4px ${color}55)` }}
        >
          <circle cx="28" cy="28" r="25"
            fill="none" stroke={color} strokeWidth="1" opacity="0.2" />
          <circle cx="28" cy="28" r="19"
            fill="none" stroke={color} strokeWidth="2"
            strokeDasharray="6 3" opacity="0.9" />
          <circle cx="28" cy="28" r="2.5" fill={color} opacity="1" />
          <line x1="28" y1="2"  x2="28" y2="9"  stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.85" />
          <line x1="28" y1="47" x2="28" y2="54" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.85" />
          <line x1="2"  y1="28" x2="9"  y2="28" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.85" />
          <line x1="47" y1="28" x2="54" y2="28" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.85" />
        </svg>
        </div>
      )}

      <section
        className="absolute left-1/2 top-4 z-30 w-[min(19rem,calc(100%-2rem))] -translate-x-1/2 overflow-hidden rounded-lg border bg-black/90 text-white shadow-2xl backdrop-blur-sm"
        style={{ borderColor: `${color}88` }}
        aria-label="Radar probe"
      >
        <header className="flex h-10 items-center gap-2 border-b border-white/10 px-3">
          <span className="flex-1 text-xs font-semibold uppercase text-zinc-200">Radar Probe</span>
          {locked && <span className="text-[10px] font-semibold uppercase text-amber-300">Locked</span>}
          <button type="button" onClick={() => setCollapsed(value => !value)} className="flex h-7 w-7 items-center justify-center text-zinc-300 hover:text-white" aria-label={collapsed ? 'Expand radar probe' : 'Collapse radar probe'}>
            {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center text-zinc-300 hover:text-white" aria-label="Close radar probe">
            <X size={15} />
          </button>
        </header>

        {!collapsed && (
          <div className="px-3 py-3">
            {!radarVisible && <p className="text-xs text-amber-300">Enable NEXRAD Reflectivity to sample radar.</p>}
            {status === 'loading' && (
              <p className="text-xs text-zinc-400">Sampling radar...</p>
            )}
            {status === 'error' && (
              <p className="text-xs text-red-400">Radar data is temporarily unavailable.</p>
            )}
            {radarVisible && (status === 'idle' || (status === 'ok' && !hasData)) && (
              <p className="text-xs text-zinc-400">No measurable precipitation.</p>
            )}
            {hasData && (
              <div className="flex items-baseline justify-between gap-3">
                <strong className="text-2xl tabular-nums" style={{ color }}>{dbz.toFixed(1)} dBZ</strong>
                <span className="text-right text-xs font-medium text-zinc-200">{classifyDbz(dbz)}</span>
              </div>
            )}
            <dl className="mt-3 grid grid-cols-[5rem_1fr] gap-x-2 gap-y-1 text-[11px]">
              <dt className="text-zinc-500">Location</dt>
              <dd className="text-right tabular-nums text-zinc-200">{lat?.toFixed(4)}, {lng?.toFixed(4)}</dd>
              <dt className="text-zinc-500">Product</dt>
              <dd className="text-right text-zinc-200">{result?.product || 'NEXRAD N0Q'}</dd>
              <dt className="text-zinc-500">Scan time</dt>
              <dd className="text-right text-zinc-200">{scanTime}</dd>
            </dl>
            <button
              type="button"
              onClick={onLockToggle}
              className={`mt-3 flex h-8 w-full items-center justify-center gap-2 rounded-md text-xs font-semibold ${locked ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-zinc-700 text-white hover:bg-zinc-600'}`}
            >
              {locked ? <Unlock size={14} /> : <Lock size={14} />}
              {locked ? 'Unlock location' : 'Lock location'}
            </button>
          </div>
        )}
      </section>
    </>
  );
}
