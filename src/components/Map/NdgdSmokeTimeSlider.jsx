/**
 * NdgdSmokeTimeSlider.jsx
 * Hour selector for NOAA NDGD smoke forecast (matches feature todate).
 */

import { memo } from 'react';

function formatForecastHour(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const NdgdSmokeTimeSlider = memo(function NdgdSmokeTimeSlider({
  forecastHoursMs = [],
  valueIndex = 0,
  onIndexChange,
}) {
  const maxIdx = Math.max(0, forecastHoursMs.length - 1);
  const safeIdx = Math.min(Math.max(0, valueIndex), maxIdx);
  const label = forecastHoursMs.length ? formatForecastHour(forecastHoursMs[safeIdx]) : '';

  if (forecastHoursMs.length < 2) return null;

  return (
    <div
      className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 pointer-events-auto
                 w-[min(22rem,calc(100vw-8rem))] animate-fade-in"
    >
      <div className="bg-sentinel-900/95 backdrop-blur-md border border-sentinel-700/80 rounded-xl shadow-2xl px-3 py-2">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-[10px] font-bold text-sentinel-400 uppercase tracking-widest shrink-0">
            Smoke forecast
          </span>
          <span className="text-[11px] font-medium text-amber-100/95 truncate text-right" title={label}>
            {label}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={maxIdx}
          step={1}
          value={safeIdx}
          onChange={(e) => onIndexChange?.(Number(e.target.value))}
          className="w-full h-2 accent-amber-500 cursor-pointer
                     [&::-webkit-slider-thumb]:appearance-none
                     [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5
                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-400
                     [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-amber-200/80
                     [&::-webkit-slider-thumb]:shadow-md"
          aria-label="Smoke forecast hour"
        />
        <div className="flex justify-between text-[9px] text-sentinel-500 mt-1 px-0.5">
          <span className="truncate max-w-[45%]" title={formatForecastHour(forecastHoursMs[0])}>
            {formatForecastHour(forecastHoursMs[0])}
          </span>
          <span className="truncate max-w-[45%] text-right" title={formatForecastHour(forecastHoursMs[maxIdx])}>
            {formatForecastHour(forecastHoursMs[maxIdx])}
          </span>
        </div>
      </div>
    </div>
  );
});

export default NdgdSmokeTimeSlider;
