/**
 * ModelComparison.jsx
 * HRRR and GFS at the same valid time, side by side, with the difference
 * between them. The difference is shown in neutral ink: it says how far
 * apart the models are, not which one is right.
 */

import { compassPoint, entryAt, formatValue, zulu } from './modelTheme';
import { ModelChip } from './RunBadges';

const ROWS = [
  { key: 'temperature', label: 'Temperature', decimals: 0 },
  { key: 'relativeHumidity', label: 'Humidity', decimals: 0 },
  { key: 'windSpeed', label: 'Wind speed', decimals: 0 },
  { key: 'windDirection', label: 'Wind from', direction: true },
  { key: 'windGust', label: 'Gusts', decimals: 0 },
  { key: 'precipitationAmount', label: 'Precipitation', decimals: 2, period: true },
  { key: 'pressureSurface', label: 'Pressure', decimals: 0 },
];

function angleDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function cellText(data, entry, row) {
  if (data.unavailableVariables?.includes(row.key)) return { text: `Not in ${data.model.name}`, muted: true };
  if (!entry) return { text: '—', muted: true };
  const v = entry[row.key];
  if (v == null) return { text: '—', muted: true };
  if (row.direction) return { text: `${compassPoint(v)} (${v}°)` };
  const text = formatValue(row.decimals != null ? Number(v.toFixed(row.decimals)) : v, data.units[row.key], { decimals: row.decimals });
  return { text };
}

function difference(hrrr, gfs, row, hEntry, gEntry) {
  if (!hEntry || !gEntry) return '—';
  const a = hEntry[row.key];
  const b = gEntry[row.key];
  if (a == null || b == null) return '—';
  if (row.direction) return `${Math.round(angleDiff(a, b))}° apart`;
  // Precipitation totals only compare when they cover the same window.
  if (row.period && hEntry.precipitationPeriodHours !== gEntry.precipitationPeriodHours) return 'different periods';
  const d = a - b;
  const unit = hrrr.units[row.key];
  const mag = formatValue(Math.abs(Number(d.toFixed(row.decimals ?? 0))), unit, { decimals: row.decimals });
  return Math.abs(d) < 10 ** -(row.decimals ?? 0) ? 'same' : `${d > 0 ? '+' : '−'}${mag}`;
}

export default function ModelComparison({ hrrr, gfs, validTime }) {
  const hEntry = entryAt(hrrr.forecast, validTime);
  const gEntry = entryAt(gfs.forecast, validTime);
  return (
    <div>
      <table className="w-full text-sm tabular-nums">
        <caption className="sr-only">HRRR and GFS model forecasts for the same valid time</caption>
        <thead>
          <tr className="text-left align-bottom">
            <th scope="col" className="pb-2 font-normal text-xs text-sentinel-500 dark:text-sentinel-300">At {zulu(validTime)}</th>
            <th scope="col" className="pb-2 pr-2">
              <ModelChip model={hrrr.model} size="sm" />
              <div className="text-[11px] font-normal text-sentinel-500 dark:text-sentinel-300">run {zulu(hrrr.run.runTime)}</div>
            </th>
            <th scope="col" className="pb-2 pr-2">
              <ModelChip model={gfs.model} size="sm" />
              <div className="text-[11px] font-normal text-sentinel-500 dark:text-sentinel-300">run {zulu(gfs.run.runTime)}</div>
            </th>
            <th scope="col" className="pb-2 text-xs font-normal text-sentinel-500 dark:text-sentinel-300">HRRR − GFS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sentinel-100 dark:divide-sentinel-700">
          {ROWS.map((row) => {
            const h = cellText(hrrr, hEntry, row);
            const g = cellText(gfs, gEntry, row);
            const periods = [...new Set([hEntry, gEntry].map((e) => e?.precipitationPeriodHours).filter(Boolean))];
            const label = row.period && periods.length ? `${row.label} (${periods.join(' / ')} h)` : row.label;
            return (
              <tr key={row.key}>
                <th scope="row" className="py-1.5 pr-2 text-left font-normal text-sentinel-600 dark:text-sentinel-200">{label}</th>
                <td className={`py-1.5 pr-2 whitespace-nowrap font-semibold ${h.muted ? 'text-sentinel-400 font-normal text-xs' : 'text-sentinel-900 dark:text-white'}`}>{h.text}</td>
                <td className={`py-1.5 pr-2 whitespace-nowrap font-semibold ${g.muted ? 'text-sentinel-400 font-normal text-xs' : 'text-sentinel-900 dark:text-white'}`}>{g.text}</td>
                <td className="py-1.5 text-sentinel-500 dark:text-sentinel-300">{difference(hrrr, gfs, row, hEntry, gEntry)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!gEntry && (
        <p className="mt-2 text-xs text-sentinel-500 dark:text-sentinel-300">GFS has no forecast step at this exact time.</p>
      )}
      <p className="mt-3 text-xs text-sentinel-500 dark:text-sentinel-300">
        HRRR runs on a 3 km grid, GFS on ~25 km, and their runs may start at different times. A large difference
        means the models disagree here, not that either one is wrong.
      </p>
    </div>
  );
}
