/**
 * ModelReadout.jsx
 * One model's values at the selected forecast hour. Variables the model
 * doesn't provide say so ("Not in GFS"); missing values show a dash. Nothing
 * is estimated.
 */

import { Navigation2 } from 'lucide-react';
import { compassPoint, formatValue } from './modelTheme';

function Cell({ label, children, sub }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-sentinel-500 dark:text-sentinel-300">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-sentinel-900 dark:text-white leading-tight">{children}</div>
      {sub && <div className="text-[11px] text-sentinel-500 dark:text-sentinel-300 leading-snug">{sub}</div>}
    </div>
  );
}

export function WindValue({ speed, direction, units }) {
  if (speed == null) return '—';
  const from = compassPoint(direction);
  return (
    <span className="inline-flex items-center gap-1.5">
      {direction != null && (
        // Arrow points where the wind blows to; the label says where it's from.
        <Navigation2 size={15} aria-hidden className="shrink-0" style={{ transform: `rotate(${direction + 180}deg)` }} />
      )}
      {formatValue(speed, units.windSpeed)}
      {from && <span className="text-sm font-normal text-sentinel-500 dark:text-sentinel-300">from {from}</span>}
      {!from && <span className="text-sm font-normal text-sentinel-500 dark:text-sentinel-300">calm</span>}
    </span>
  );
}

export default function ModelReadout({ data, entry }) {
  if (!entry) {
    return <p className="text-sm text-sentinel-500 dark:text-sentinel-300">No {data.model.name} value at this time.</p>;
  }
  const { units } = data;
  const missing = (v) => data.unavailableVariables?.includes(v);
  const period = entry.precipitationPeriodHours;
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4">
        <div className="text-5xl font-semibold tracking-tight tabular-nums text-sentinel-900 dark:text-white">
          {formatValue(entry.temperature, units.temperature, { decimals: 0 })}
        </div>
        <div className="pb-1.5 text-sm text-sentinel-500 dark:text-sentinel-300">air temperature at 2 m</div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Cell label="Wind at 10 m">
          <WindValue speed={entry.windSpeed} direction={entry.windDirection} units={units} />
        </Cell>
        <Cell label="Gusts" sub={missing('windGust') ? `Not in ${data.model.name}` : null}>
          {missing('windGust') ? '—' : formatValue(entry.windGust, units.windGust)}
        </Cell>
        <Cell label="Relative humidity">{formatValue(entry.relativeHumidity, units.relativeHumidity)}</Cell>
        <Cell
          label="Precipitation"
          sub={period ? `Total in the ${period} h ending at this time` : 'No preceding step at the run start'}
        >
          {formatValue(entry.precipitationAmount, units.precipitationAmount, { decimals: 2 })}
        </Cell>
        <Cell label="Surface pressure">{formatValue(entry.pressureSurface, units.pressureSurface, { decimals: 0 })}</Cell>
      </div>
    </div>
  );
}
