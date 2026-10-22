/**
 * RadarSitePanel.jsx
 * Radar Site controls, shown in the bottom bar's pull-up sheet (DockSheet,
 * via MapDockSheet) under the "Individual Radar Site" tab. From the top: what to show
 * (Radar, Velocity, Correlation Coefficient, Differential Reflectivity), the
 * selected station's status (station, product, elevation, scan time and age,
 * loading and errors with Retry), the "Reflectivity Gates" L/H range on Radar
 * (only gates between them are drawn; each moves by 1 and snaps to the 10s)
 * and the radar's opacity.
 */

import { memo, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Radar, RotateCw } from 'lucide-react';
import { useRadarSiteContext } from '../../context/RadarSiteContext';
import { RADAR_KINDS, siteProduct } from '../../api/nexradLevel3';
import { withClock } from '../../utils/formatUtils';
import { DBZ_MAX, snapDbz } from '../../utils/radarSweep';
import { useTimeFormat } from '../../hooks/useTimeFormat';

/** Radar / Velocity / Correlation Coefficient / Differential Reflectivity. */
function KindSelector({ value, onChange, site }) {
  return (
    <div role="radiogroup" aria-label="Radar product" className="grid grid-cols-2 gap-1">
      {RADAR_KINDS.map(({ id, label }) => {
        const active = value === id;
        const unavailable = site && !siteProduct(site, id);
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={unavailable}
            title={unavailable ? `${site.id} is a TDWR: no ${label.toLowerCase()}` : undefined}
            onClick={() => onChange(id)}
            className={`min-h-8 rounded-md border px-2 py-1 text-[11px] font-semibold leading-tight transition-[transform,background-color,color] duration-100 active:scale-[0.97]
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${
              active
                ? 'border-sky-400 bg-sky-500 text-white shadow-lg shadow-sky-900/30'
                : 'border-sentinel-600 bg-sentinel-900 text-sentinel-300 hover:border-sentinel-500 hover:bg-sentinel-700 hover:text-white'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

const TICKS = Array.from({ length: DBZ_MAX / 10 + 1 }, (_, i) => i * 10);
const dbzLabel = (v) => (v >= DBZ_MAX ? `${DBZ_MAX}+` : String(v));
// Where a value sits along a .radar-range track: thumb centres run from 8px to (width − 8px).
const along = (t) => `calc(8px + (100% - 16px) * ${t})`;

function Track({ from, to }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-2 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-sentinel-600">
      <div className="absolute inset-y-0 rounded-full bg-sky-400" style={{ left: `${from * 100}%`, right: `${(1 - to) * 100}%` }} />
    </div>
  );
}

/**
 * "Reflectivity Gates": only radar gates from L to H dBZ are drawn (H at 70+
 * has no upper limit). The two handles move independently by 1 and snap to
 * the 10s; L can't pass H.
 */
function ReflectivityGates({ low, high, onLow, onHigh }) {
  // The last handle moved sits on top, so two handles at the same value can be pulled apart.
  const [lastMoved, setLastMoved] = useState('high');
  const lowOnTop = low === DBZ_MAX || (low !== 0 && lastMoved === 'low');
  return (
    <div role="group" aria-labelledby="radar-site-gates" className="border-t border-sentinel-700 pt-2">
      <div className="flex items-baseline gap-2">
        <span id="radar-site-gates" className="text-xs font-semibold text-white">Reflectivity Gates</span>
        <span className="min-w-0 flex-1 truncate text-[10px] text-sentinel-400">Recommended minimum of 10dBZ</span>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-white" aria-hidden>
          L {dbzLabel(low)} · H {dbzLabel(high)}
        </span>
      </div>
      <div className="relative mt-1 h-3 text-[9px] font-bold leading-none text-sentinel-200" aria-hidden>
        <span className="absolute -translate-x-1/2" style={{ left: along(low / DBZ_MAX) }}>L</span>
        <span className="absolute -translate-x-1/2" style={{ left: along(high / DBZ_MAX) }}>H</span>
      </div>
      <div className="relative h-4">
        <Track from={low / DBZ_MAX} to={high / DBZ_MAX} />
        <input
          type="range" min={0} max={DBZ_MAX} step={1} value={low}
          onChange={(e) => { setLastMoved('low'); onLow(Math.min(snapDbz(e.target.value), high)); }}
          aria-label="L: lowest reflectivity shown"
          aria-valuetext={`${dbzLabel(low)} dBZ`}
          className="radar-range radar-range--dual"
          style={{ zIndex: lowOnTop ? 2 : 1 }}
        />
        <input
          type="range" min={0} max={DBZ_MAX} step={1} value={high}
          onChange={(e) => { setLastMoved('high'); onHigh(Math.max(snapDbz(e.target.value), low)); }}
          aria-label="H: highest reflectivity shown"
          aria-valuetext={high >= DBZ_MAX ? `${DBZ_MAX}+ dBZ, no upper limit` : `${high} dBZ`}
          className="radar-range radar-range--dual"
          style={{ zIndex: lowOnTop ? 1 : 2 }}
        />
      </div>
      <div className="relative mt-0.5 h-3 text-[10px] tabular-nums text-sentinel-400" aria-hidden>
        {TICKS.map((t) => (
          <span key={t} className="absolute -translate-x-1/2" style={{ left: along(t / DBZ_MAX) }}>{dbzLabel(t)}</span>
        ))}
      </div>
    </div>
  );
}

/** Radar opacity: fully transparent (left) … fully opaque (right). */
function OpacitySlider({ value, onChange }) {
  const pct = Math.round(value * 100);
  return (
    <div className="pt-1">
      <div className="flex items-baseline gap-2">
        <label htmlFor="radar-site-opacity" className="flex-1 text-xs font-semibold text-white">Opacity</label>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-white" aria-hidden>{pct}%</span>
      </div>
      <div className="relative mt-1 h-4">
        <Track from={0} to={value} />
        <input
          id="radar-site-opacity"
          type="range" min={0} max={100} step={1} value={pct}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          aria-valuetext={`${pct}%`}
          className="radar-range relative"
        />
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-sentinel-400" aria-hidden>
        <span>Transparent</span>
        <span>Opaque</span>
      </div>
    </div>
  );
}

function age(ms, now) {
  const minutes = Math.max(0, Math.round((now - ms) / 60000));
  return minutes < 1 ? 'just now' : `${minutes} min ago`;
}

/** Status lines for the selected station, noting when NWS reports it down or a TDWR shows reflectivity in place of CC/ZDR. */
function statusOf(radar, now) {
  let s = baseStatus(radar, now);
  if (radar.site && radar.siteDown) s = { ...s, tone: s.tone === 'loading' ? s.tone : 'error', detail: `NWS reports this radar down · ${s.detail}` };
  const chosen = RADAR_KINDS.find((k) => k.id === radar.chosenKind);
  if (radar.site && chosen && radar.chosenKind !== radar.kind) {
    return { ...s, detail: `${s.detail} · TDWR has no ${chosen.label.toLowerCase()}` };
  }
  return s;
}

function baseStatus(radar, now) {
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
      <KindSelector value={radar.kind ?? 'reflectivity'} onChange={radar.setKind} site={radar.site} />
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
      {(radar.kind ?? 'reflectivity') === 'reflectivity' && <ReflectivityGates low={radar.dbzLow ?? 0} high={radar.dbzHigh ?? DBZ_MAX} onLow={radar.setDbzLow} onHigh={radar.setDbzHigh} />}
      <OpacitySlider value={radar.opacity ?? 1} onChange={radar.setOpacity} />
    </div>
  );
});

export default RadarSitePanel;
