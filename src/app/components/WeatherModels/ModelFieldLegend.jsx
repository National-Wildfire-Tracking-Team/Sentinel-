/**
 * ModelFieldLegend.jsx
 * The colour scale across the top of the Models map, titled with exactly
 * what is drawn: model (or HRRR − GFS), variable and units, valid time,
 * forecast hour, run and its age. The bar shows the real colours, including
 * transparency (where the field is clear, the bar shows the dark backdrop).
 */

import { useWeatherModelsContext } from '../../context/WeatherModelsContext';
import { DISPLAY_UNITS, byteToValue, formatDisplay, hourAt, toDisplay, valueToByte } from '../../api/modelFields';
import { MODEL_STYLE, ageLabel, localTime, zulu } from './modelTheme';

const TICKS = 5;

function gradient({ encoding, palette }) {
  const stops = palette.map(([v, hex, a]) => {
    const n = Number.parseInt(hex.slice(1), 16);
    const pct = ((valueToByte(v, encoding) - 1) / 254) * 100;
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(a, 0)}) ${pct.toFixed(2)}%`;
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

function ticks(scale, quantity, units, delta) {
  return Array.from({ length: TICKS }, (_, i) => {
    const byte = 1 + (i / (TICKS - 1)) * 254;
    return formatDisplay(toDisplay(byteToValue(byte, scale.encoding), quantity, units, { delta }), quantity);
  });
}

function age(runTime) {
  return ageLabel(Math.max(0, Math.round((Date.now() - Date.parse(runTime)) / 60000)));
}

export default function ModelFieldLegend() {
  const wm = useWeatherModelsContext();
  if (!wm?.manifest || !wm.validTime) return null;
  const { manifest, mode, compareView, variable, validTime, units } = wm;
  const spec = manifest.variables[variable];
  const isDiff = mode === 'compare' && compareView === 'difference';
  const scale = isDiff ? spec.difference : spec;
  if (!scale) return null;
  const unit = DISPLAY_UNITS[units][spec.quantity];
  const models = mode === 'compare' ? ['hrrr', 'gfs'] : [mode];
  const labels = ticks(scale, spec.quantity, units, isDiff);

  return (
    // Phones: between the left and right corner-button columns. Wider: centred.
    <div className="absolute top-2 left-[4.25rem] right-[4.25rem] z-20 pointer-events-none sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[min(46rem,calc(100vw-10rem))]">
      <div className="rounded-lg border border-dashed border-sentinel-500/70 bg-sentinel-900/90 backdrop-blur-sm px-2.5 py-1.5 text-white shadow-xl">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] leading-tight">
          <span className="font-bold">
            {isDiff ? 'HRRR − GFS' : mode === 'compare' ? 'HRRR | GFS' : MODEL_STYLE[mode].label}
          </span>
          <span className="font-semibold">{isDiff ? `${spec.label} difference` : spec.label} ({unit})</span>
          <span className="text-sentinel-300">valid {localTime(validTime, { minute: '2-digit' })} ({zulu(validTime)})</span>
          {models.map((m) => (
            <span key={m} className="text-sentinel-300 tabular-nums">
              {mode === 'compare' && `${MODEL_STYLE[m].label} `}run {zulu(manifest.models[m].current.runTime)} +{hourAt(manifest, m, validTime)} h · {age(manifest.models[m].current.runTime)}
            </span>
          ))}
          <span className="ml-auto rounded border border-dashed border-sentinel-500 px-1 text-[10px] text-sentinel-300">Model forecast</span>
        </div>
        <div className="mt-1 h-2.5 rounded-sm bg-sentinel-700" style={{ backgroundImage: gradient(scale) }} role="img"
          aria-label={`Colour scale from ${labels[0]} to ${labels[TICKS - 1]} ${unit}`} />
        <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-sentinel-300">
          {labels.map((t, i) => <span key={i}>{isDiff && i > TICKS / 2 ? `+${t}` : t}</span>)}
        </div>
        {isDiff && (
          <div className="mt-0.5 text-[10px] text-sentinel-300">
            Blue: HRRR lower than GFS · red: HRRR higher · clear: within ±{formatDisplay(toDisplay(scale.encoding.hi / 10, spec.quantity, units, { delta: true }), spec.quantity)} {unit}.
            A difference is disagreement, not error.
          </div>
        )}
        {spec.notice && <div className="mt-0.5 text-[10px] text-amber-200">{spec.notice}</div>}
        {spec.timeSemantics === 'period-average' && !isDiff && (
          <div className="mt-0.5 text-[10px] text-sentinel-300">Average rate over the preceding forecast step.</div>
        )}
        {spec.timeSemantics === 'since-run-start' && (
          <div className="mt-0.5 text-[10px] text-sentinel-300">Total since the run started ({zulu(manifest.models[mode === 'compare' ? 'hrrr' : mode].current.runTime)}).</div>
        )}
      </div>
    </div>
  );
}
