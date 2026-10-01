/**
 * Meteogram.jsx
 * The forecast as small multiples on one time axis: temperature, humidity,
 * wind and precipitation rate, one panel each (never two scales on one
 * axis). In compare mode each panel carries both models in their own
 * colours. The selected valid time is a crosshair through every panel;
 * hovering shows values, clicking selects that time.
 *
 * Precipitation is drawn as a *rate*, which stays comparable when GFS
 * switches from 1 h to 3 h steps; totals per step are in the readout.
 */

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Table } from 'lucide-react';
import { MODEL_STYLE, formatValue, localTime, zulu } from './modelTheme';

const PANEL_H = 64;
const PAD_Y = 6;

const PANELS = [
  { key: 'temperature', label: 'Temperature', decimals: 0 },
  { key: 'relativeHumidity', label: 'Relative humidity', decimals: 0, fixed: [0, 100] },
  { key: 'windSpeed', label: 'Wind', decimals: 0, extra: 'windGust', floor: 0 },
  { key: 'precipitationRate', label: 'Precipitation rate', decimals: 2, floor: 0, bars: true },
];

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(320);
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function linePath(points) {
  let d = '';
  let pen = false;
  for (const [x, y] of points) {
    if (y == null) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    pen = true;
  }
  return d;
}

export default function Meteogram({ series, validTime, onSelect }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null); // ms
  const [showTable, setShowTable] = useState(false);

  // Shared x domain: the first series' (the timeline's) range.
  const primary = series[0].data.forecast;
  const t0 = Date.parse(primary[0].validTime);
  const t1 = Date.parse(primary[primary.length - 1].validTime);
  const x = (t) => ((t - t0) / Math.max(1, t1 - t0)) * width;
  const inRange = (e) => { const t = Date.parse(e.validTime); return t >= t0 && t <= t1; };

  const scales = useMemo(() => PANELS.map((p) => {
    const values = [];
    for (const s of series) {
      for (const e of s.data.forecast) {
        if (!inRange(e)) continue;
        for (const k of [p.key, p.extra]) if (k && e[k] != null) values.push(e[k]);
      }
    }
    let [lo, hi] = p.fixed ?? [Math.min(...values), Math.max(...values)];
    if (!values.length) { lo = 0; hi = 1; }
    if (p.floor != null) lo = Math.min(p.floor, lo);
    if (p.bars) hi = Math.max(hi, 0.02); // a dry forecast stays visibly dry, not full-height noise
    if (hi - lo < 1e-9) { hi += 1; lo -= p.floor != null ? 0 : 1; }
    return { lo, hi, y: (v) => (v == null ? null : PANEL_H - PAD_Y - ((v - lo) / (hi - lo)) * (PANEL_H - 2 * PAD_Y)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [series, t0, t1]);

  const nearest = (clientX, rect) => {
    const t = t0 + ((clientX - rect.left) / rect.width) * (t1 - t0);
    let best = primary[0];
    for (const e of primary) if (Math.abs(Date.parse(e.validTime) - t) < Math.abs(Date.parse(best.validTime) - t)) best = e;
    return best;
  };

  const selectedMs = Date.parse(validTime);
  const hoverEntry = hover != null ? primary.find((e) => Date.parse(e.validTime) === hover) : null;
  const valueAt = (s, key, ms) => s.data.forecast.find((e) => Date.parse(e.validTime) === ms)?.[key];

  return (
    <div className="space-y-1">
      <div
        ref={ref}
        className="relative select-none cursor-crosshair"
        onPointerMove={(e) => setHover(Date.parse(nearest(e.clientX, e.currentTarget.getBoundingClientRect()).validTime))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => onSelect(nearest(e.clientX, e.currentTarget.getBoundingClientRect()).validTime)}
      >
        {PANELS.map((p, pi) => {
          const sc = scales[pi];
          const unit = series[0].data.units[p.key];
          return (
            <div key={p.key} className="pt-2">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-sentinel-600 dark:text-sentinel-200">
                  {p.label} <span className="text-sentinel-400 dark:text-sentinel-300">({unit})</span>
                  <span className="ml-2 text-[11px] text-sentinel-400 dark:text-sentinel-300 tabular-nums">
                    {sc.lo.toFixed(p.decimals)}–{sc.hi.toFixed(p.decimals)}
                  </span>
                </span>
                {/* Direct labels: each model's value at the selected time, in text ink beside its swatch. */}
                <span className="flex gap-3 tabular-nums">
                  {series.map((s) => (
                    <span key={s.model} className="inline-flex items-center gap-1 text-sentinel-900 dark:text-white font-semibold">
                      <span aria-hidden className="w-2 h-0.5 rounded" style={{ background: MODEL_STYLE[s.model].color }} />
                      {series.length > 1 && <span className="font-normal text-sentinel-500 dark:text-sentinel-300">{MODEL_STYLE[s.model].label}</span>}
                      {formatValue(valueAt(s, p.key, selectedMs) ?? null, '', { decimals: p.decimals }).trim()}
                      {p.extra && valueAt(s, p.extra, selectedMs) != null && (
                        <span className="font-normal text-sentinel-500 dark:text-sentinel-300">g{Math.round(valueAt(s, p.extra, selectedMs))}</span>
                      )}
                    </span>
                  ))}
                </span>
              </div>
              <svg width={width} height={PANEL_H} className="block overflow-visible" role="img"
                aria-label={`${p.label} forecast, ${sc.lo.toFixed(p.decimals)} to ${sc.hi.toFixed(p.decimals)} ${unit}`}>
                <line x1={0} x2={width} y1={PANEL_H - PAD_Y} y2={PANEL_H - PAD_Y} className="stroke-sentinel-200 dark:stroke-sentinel-600" strokeWidth={1} />
                {hoverEntry && hover !== selectedMs && (
                  <line x1={x(hover)} x2={x(hover)} y1={0} y2={PANEL_H} className="stroke-sentinel-400/70" strokeWidth={1} />
                )}
                {series.map((s, si) => {
                  const pts = s.data.forecast.filter(inRange);
                  const color = MODEL_STYLE[s.model].color;
                  if (p.bars) {
                    return pts.map((e, i) => {
                      if (!e[p.key] || i === 0) return null;
                      const prev = Date.parse(pts[i - 1].validTime);
                      const full = Math.max(2, x(Date.parse(e.validTime)) - x(prev) - 2);
                      const w = series.length > 1 ? full / 2 : full;
                      const left = x(prev) + 1 + (series.length > 1 ? si * w : 0);
                      const top = sc.y(e[p.key]);
                      return <rect key={`${s.model}${e.validTime}`} x={left} y={top} width={w} height={Math.max(0, PANEL_H - PAD_Y - top)} rx={Math.min(2, w / 2)} fill={color} />;
                    });
                  }
                  return (
                    <g key={s.model}>
                      {p.extra && (
                        <path d={linePath(pts.map((e) => [x(Date.parse(e.validTime)), sc.y(e[p.extra])]))} fill="none" stroke={color} strokeWidth={1.25} strokeOpacity={0.55} />
                      )}
                      <path d={linePath(pts.map((e) => [x(Date.parse(e.validTime)), sc.y(e[p.key])]))} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    </g>
                  );
                })}
                {/* Selected time, drawn inside each panel so it never crosses the titles */}
                <line x1={x(selectedMs)} x2={x(selectedMs)} y1={0} y2={PANEL_H} className="stroke-sentinel-900 dark:stroke-white" strokeWidth={1} />
              </svg>
            </div>
          );
        })}
        {hoverEntry && (
          <div
            role="tooltip"
            className="absolute z-10 top-0 pointer-events-none rounded-md border border-sentinel-200 dark:border-sentinel-600 bg-white/95 dark:bg-sentinel-800/95 px-2 py-1.5 text-[11px] shadow-lg tabular-nums"
            style={{ left: Math.min(Math.max(0, x(hover) + 8), width - 170), minWidth: 160 }}
          >
            <div className="font-semibold text-sentinel-900 dark:text-white">{localTime(hoverEntry.validTime)} · {zulu(hoverEntry.validTime)}</div>
            {series.map((s) => (
              <div key={s.model} className="text-sentinel-600 dark:text-sentinel-200">
                <span className="font-semibold" style={{ color: MODEL_STYLE[s.model].color }}>{MODEL_STYLE[s.model].label}</span>{' '}
                {PANELS.map((p) => formatValue(valueAt(s, p.key, hover) ?? null, s.data.units[p.key], { decimals: p.decimals })).join(' · ')}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex justify-between text-[11px] text-sentinel-500 dark:text-sentinel-300 tabular-nums">
        <span>{localTime(primary[0].validTime)}</span>
        <button type="button" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable}
          className="inline-flex items-center gap-1 hover:text-sentinel-900 dark:hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 rounded">
          <Table size={12} aria-hidden /> {showTable ? 'Hide table' : 'Show as table'}
        </button>
        <span>{localTime(primary[primary.length - 1].validTime)}</span>
      </div>
      {showTable && <ForecastTable series={series} />}
    </div>
  );
}

function ForecastTable({ series }) {
  const cols = ['temperature', 'relativeHumidity', 'windSpeed', 'windDirection', 'windGust', 'precipitationAmount'];
  return (
    <div className="max-h-72 overflow-auto rounded border border-sentinel-200 dark:border-sentinel-700">
      {series.map((s) => (
        <table key={s.model} className="w-full text-[11px] tabular-nums">
          <caption className="text-left px-2 py-1 font-semibold text-sentinel-900 dark:text-white">
            {s.data.model.name} model forecast, run {zulu(s.data.run.runTime)}
          </caption>
          <thead className="text-sentinel-500 dark:text-sentinel-300 text-left">
            <tr>
              <th className="px-2 font-normal">Valid</th>
              <th className="px-2 font-normal">Hour</th>
              {cols.filter((c) => s.data.units[c]).map((c) => (
                <th key={c} className="px-2 font-normal">{s.data.variables[c].label} ({s.data.units[c]})</th>
              ))}
            </tr>
          </thead>
          <tbody className="text-sentinel-800 dark:text-sentinel-100">
            {s.data.forecast.map((e) => (
              <tr key={e.validTime} className="odd:bg-sentinel-100/40 dark:odd:bg-sentinel-800/50">
                <td className="px-2 whitespace-nowrap">{localTime(e.validTime)}</td>
                <td className="px-2">+{e.forecastHour}</td>
                {cols.filter((c) => s.data.units[c]).map((c) => <td key={c} className="px-2">{e[c] ?? '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}
