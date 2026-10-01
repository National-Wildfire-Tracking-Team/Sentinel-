/**
 * ModelInspectPopup.jsx
 * Click-to-inspect on the Models map. The map field is an 8-bit picture;
 * the numbers here come from the point API at full precision, for the
 * selected variable and valid time, labelled with the run they came from.
 * If the point API's run differs from the run the map is drawing (a newer
 * run that's still arriving), that's said rather than hidden.
 */

import { Popup } from 'react-map-gl';
import { Loader2, Navigation2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useWeatherModelsContext } from '../../context/WeatherModelsContext';
import { MODEL_STYLE, compassPoint, zulu } from './modelTheme';
import { pointValue } from '../../utils/modelFieldSelection';

function fmt(value, unit, variable) {
  if (value == null || !Number.isFinite(value)) return '—';
  const decimals = /precip/.test(variable) ? 2 : 0;
  const n = Number(value.toFixed(decimals));
  const s = (Object.is(n, -0) ? 0 : n).toFixed(decimals);
  return ['°F', '°C', '%'].includes(unit) ? `${s}${unit}` : `${s} ${unit}`;
}

function Row({ model, state, variable, validTime, fieldRunId }) {
  const style = MODEL_STYLE[model];
  if (state.loading) return <div className="flex items-center gap-1.5 text-sentinel-300"><Loader2 size={12} className="animate-spin" /> {style.label}</div>;
  if (state.error) return <div className="text-red-300">{style.label}: {state.error.message}</div>;
  const { value, unit, entry, missing } = pointValue(state.data, variable, validTime);
  const runId = state.data?.run?.runTime;
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-bold" style={{ color: style.hexDark }}>{style.label}</span>
        <span className="text-base font-semibold tabular-nums text-white">
          {missing === 'not-provided' ? <span className="text-xs font-normal text-sentinel-300">Not in {style.label}</span> : fmt(value, unit, variable)}
        </span>
      </div>
      {variable === 'windSpeed' && entry?.windDirection != null && (
        <div className="flex items-center justify-end gap-1 text-[11px] text-sentinel-300">
          <Navigation2 size={10} style={{ transform: `rotate(${entry.windDirection + 180}deg)` }} aria-hidden />
          from {compassPoint(entry.windDirection)} ({entry.windDirection}°)
        </div>
      )}
      {runId && (
        <div className="text-[10px] text-sentinel-400">
          run {zulu(runId)}{entry ? ` · +${entry.forecastHour} h` : ''}
          {fieldRunId && !runId.startsWith(fieldRunId) && ' · newer than the map’s run'}
        </div>
      )}
    </div>
  );
}

export default function ModelInspectPopup() {
  const wm = useWeatherModelsContext();
  const { openSidebar } = useApp();
  if (!wm?.location) return null;
  const { location, point, mode, variable, validTime, manifest, clearLocation } = wm;
  const label = manifest?.variables?.[variable]?.label ?? variable;
  const models = mode === 'compare' ? ['hrrr', 'gfs'] : [point.mode];
  const fieldRun = (m) => manifest?.models?.[m]?.current?.runTime?.slice(0, 13);

  const h = pointValue(point.hrrr.data, variable, validTime);
  const g = pointValue(point.gfs.data, variable, validTime);
  const diff = mode === 'compare' && h.value != null && g.value != null ? h.value - g.value : null;

  return (
    <Popup
      longitude={location.lon}
      latitude={location.lat}
      anchor="bottom"
      offset={12}
      closeOnClick={false}
      onClose={clearLocation}
      maxWidth="260px"
      className="wm-inspect"
    >
      <div className="dark min-w-[200px] space-y-2 rounded-md bg-sentinel-900 p-2.5 text-xs text-sentinel-200">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold text-white">{label}</span>
          <span className="text-[10px] text-sentinel-400 tabular-nums">{location.lat.toFixed(2)}, {location.lon.toFixed(2)}</span>
        </div>
        <div className="text-[10px] text-sentinel-400">Model forecast valid {zulu(validTime)} · nearest grid cell</div>
        {models.map((m) => (
          <Row key={m} model={m} state={point[m]} variable={variable} validTime={validTime} fieldRunId={fieldRun(m)} />
        ))}
        {diff != null && (
          <div className="flex items-baseline justify-between border-t border-sentinel-700 pt-1.5">
            <span className="text-sentinel-300">HRRR − GFS</span>
            <span className="font-semibold tabular-nums text-white">{diff > 0 ? '+' : diff < 0 ? '−' : ''}{fmt(Math.abs(diff), h.unit, variable)}</span>
          </div>
        )}
        <button
          type="button"
          onClick={openSidebar}
          className="w-full rounded border border-sentinel-600 py-1 text-[11px] font-semibold text-sky-300 hover:bg-sentinel-800"
        >
          Point forecast
        </button>
      </div>
    </Popup>
  );
}
