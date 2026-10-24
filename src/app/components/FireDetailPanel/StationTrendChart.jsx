/**
 * StationTrendChart.jsx
 * One FEMS station field over its observed window (solid) and FEMS's 7-day
 * forecast (dashed), as a small inline SVG with a hover readout. One field
 * per chart (no second axis). Only days FEMS returned are plotted: a missing
 * day breaks the line rather than being joined across.
 */

import { useMemo, useState } from 'react';

const W = 280;
const H = 92;
const PAD = { l: 28, r: 8, t: 8, b: 18 };

function fmtDay(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString([], { timeZone: 'UTC', month: 'short', day: 'numeric' });
}

/** Points as [{ date, value, forecast }], gaps (null) kept so lines break there. */
export function trendPoints(detail, field) {
  const obs = (detail?.observed ?? []).map((d) => ({ date: d.date, value: d[field], forecast: false }));
  const fc = (detail?.forecast ?? []).map((d) => ({ date: d.date, value: d[field], forecast: true }));
  return [...obs, ...fc];
}

function segments(points, x, y, forecast) {
  const paths = [];
  let cur = '';
  points.forEach((p, i) => {
    const inPart = forecast ? p.forecast || (points[i + 1]?.forecast && !p.forecast) : !p.forecast;
    if (!inPart || p.value == null) {
      if (cur) paths.push(cur);
      cur = '';
      return;
    }
    cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
  });
  if (cur) paths.push(cur);
  return paths;
}

export default function StationTrendChart({ detail, field, label, unit = '', color }) {
  const points = useMemo(() => trendPoints(detail, field), [detail, field]);
  const [hover, setHover] = useState(null);
  const values = points.map((p) => p.value).filter((v) => v != null);
  if (values.length < 2) return null;

  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < 1) { lo -= 1; hi += 1; }
  const x = (i) => PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(1, points.length - 1);
  const y = (v) => PAD.t + ((hi - v) * (H - PAD.t - PAD.b)) / (hi - lo);
  const split = points.findIndex((p) => p.forecast);
  const step = (W - PAD.l - PAD.r) / Math.max(1, points.length - 1);
  const h = hover != null ? points[hover] : null;

  return (
    <figure className="mb-2">
      <figcaption className="flex items-baseline justify-between text-[10px] text-sentinel-400 mb-0.5">
        <span className="font-semibold uppercase tracking-wider">{label}</span>
        <span className="tabular-nums text-sentinel-300 min-h-[14px]">
          {h ? `${fmtDay(h.date)}${h.forecast ? ' (forecast)' : ''}: ${h.value == null ? 'no value' : `${h.value}${unit}`}` : ''}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={`${label}: ${points.filter((p) => !p.forecast).length} observed days and ${points.filter((p) => p.forecast).length} forecast days`}
        onMouseLeave={() => setHover(null)}>
        {[lo, hi].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#3f3f46" strokeWidth="1" />
            <text x={PAD.l - 4} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#a1a1aa">{Math.round(v)}</text>
          </g>
        ))}
        {split > 0 && (
          <g>
            <line x1={x(split) - step / 2} x2={x(split) - step / 2} y1={PAD.t} y2={H - PAD.b} stroke="#71717a" strokeDasharray="2 2" />
            <text x={x(split) - step / 2 + 3} y={PAD.t + 8} fontSize="9" fill="#a1a1aa">forecast</text>
          </g>
        )}
        {segments(points, x, y, false).map((d) => <path key={d} d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />)}
        {segments(points, x, y, true).map((d) => <path key={d} d={d} fill="none" stroke={color} strokeWidth="2" strokeDasharray="4 3" />)}
        <text x={PAD.l} y={H - 4} fontSize="9" fill="#a1a1aa">{fmtDay(points[0].date)}</text>
        <text x={W - PAD.r} y={H - 4} fontSize="9" fill="#a1a1aa" textAnchor="end">{fmtDay(points[points.length - 1].date)}</text>
        {h?.value != null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="#d4d4d8" strokeWidth="1" />
            <circle cx={x(hover)} cy={y(h.value)} r="4" fill={color} stroke="#18181b" strokeWidth="2" />
          </>
        )}
        {points.map((p, i) => (
          <rect key={p.date} x={x(i) - step / 2} y={PAD.t} width={step} height={H - PAD.t - PAD.b} fill="transparent"
            onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
        ))}
      </svg>
    </figure>
  );
}
