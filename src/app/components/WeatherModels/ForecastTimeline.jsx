/**
 * ForecastTimeline.jsx
 * Steps through a run's forecast hours. The selection is a valid time (an
 * ISO string), not an index, so every consumer — readout, comparison,
 * meteogram, map marker, and future model map layers — follows the same
 * clock whichever model it shows. Animation later is just advancing it.
 */

import { memo, useMemo } from 'react';
import { forecastHourLabel, localTime, nowIndex, zulu } from './modelTheme';

const JUMPS = [1, 3, 6, 12, 24, 48, 72, 120, 168];

function ForecastTimeline({ forecast, validTime, onChange, runTime, nowMs = Date.now() }) {
  const index = Math.max(0, forecast.findIndex((e) => e.validTime === validTime));
  const nowIdx = nowIndex(forecast, nowMs);
  const nowMsHour = Date.parse(forecast[nowIdx]?.validTime);

  const jumps = useMemo(() => {
    const out = [{ label: 'Now', i: nowIdx }];
    for (const h of JUMPS) {
      const target = nowMsHour + h * 3_600_000;
      const i = forecast.findIndex((e) => Date.parse(e.validTime) === target);
      if (i !== -1) out.push({ label: `+${h}h`, i });
    }
    return out;
  }, [forecast, nowIdx, nowMsHour]);

  if (!forecast.length) return null;
  const entry = forecast[index];
  const max = forecast.length - 1;
  const pastPct = (nowIdx / Math.max(1, max)) * 100;

  const onKey = (e) => {
    if (e.key === 'Home') { e.preventDefault(); onChange(forecast[nowIdx].validTime); }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="text-sm text-sentinel-900 dark:text-white">
          <span className="font-semibold">{localTime(entry.validTime, { month: 'short', day: 'numeric', minute: '2-digit' })}</span>
          <span className="ml-2 text-sentinel-500 dark:text-sentinel-300 tabular-nums">
            valid {zulu(entry.validTime)} · {forecastHourLabel(entry.forecastHour)} from the {zulu(runTime)} run
          </span>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Jump to forecast time">
          {jumps.map((j) => (
            <button
              key={j.label}
              type="button"
              onClick={() => onChange(forecast[j.i].validTime)}
              aria-pressed={j.i === index}
              className={`px-2 py-0.5 rounded text-xs font-medium tabular-nums transition-colors
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500
                ${j.i === index
                  ? 'bg-sentinel-900 text-white dark:bg-white dark:text-sentinel-900'
                  : 'text-sentinel-600 dark:text-sentinel-200 hover:bg-sentinel-100 dark:hover:bg-sentinel-700'}`}
            >
              {j.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative">
        {/* Hours before now are earlier in this run: still forecasts, shaded so they read as past. */}
        <div
          aria-hidden
          className="absolute top-1/2 -translate-y-1/2 left-0 h-1.5 rounded-l bg-sentinel-300/50 dark:bg-sentinel-500/50 pointer-events-none"
          style={{ width: `${pastPct}%` }}
        />
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={index}
          onKeyDown={onKey}
          onChange={(e) => onChange(forecast[Number(e.target.value)].validTime)}
          aria-label="Forecast time"
          aria-valuetext={`${localTime(entry.validTime)}, forecast hour ${entry.forecastHour}`}
          className="relative w-full h-1.5 cursor-pointer accent-sky-600 dark:accent-sky-400"
        />
      </div>
      <div className="flex justify-between text-[11px] text-sentinel-500 dark:text-sentinel-300 tabular-nums">
        <span>{localTime(forecast[0].validTime)} (run start)</span>
        <span>{localTime(forecast[max].validTime)} ({forecastHourLabel(forecast[max].forecastHour)})</span>
      </div>
    </div>
  );
}

export default memo(ForecastTimeline);
