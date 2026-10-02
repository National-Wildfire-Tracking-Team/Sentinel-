/**
 * ModelLegend.jsx
 * The Models tab's bottom-left legend, in the same spot and box as the other
 * tabs' legend. It follows what the map draws: the selected variable's colour
 * stops in display units (or the HRRR − GFS difference scale), what the
 * variable is, the swipe view's model sides, and the wind particles.
 * With no field to describe (manifest loading, or the variable has no scale in
 * this view) the Legend header stays but doesn't open.
 */

import { useWeatherModelsContext } from '../../context/WeatherModelsContext';
import { DISPLAY_UNITS, formatDisplay, toDisplay } from '../../api/modelFields';
import { MODEL_STYLE } from './modelTheme';
import { ColorRow, LegendFrame, Section } from '../Legend/Legend';

function Note({ children }) {
  return <div className="text-sentinel-400 text-[10px] leading-snug">{children}</div>;
}

function legendContent(wm) {
  if (!wm?.manifest || !wm.validTime) return null;
  const { manifest, mode, compareView, variable, units, particles } = wm;
  const spec = manifest.variables[variable];
  if (!spec) return null;
  const isDiff = mode === 'compare' && compareView === 'difference';
  const scale = isDiff ? spec.difference : spec;
  if (!scale?.palette?.length) return null;

  const unit = DISPLAY_UNITS[units][spec.quantity];
  const show = (v) => formatDisplay(toDisplay(v, spec.quantity, units, { delta: isDiff }), spec.quantity);
  const rows = scale.palette
    .filter(([, , a]) => a > 0)
    .map(([v, hex]) => ({ color: hex, label: `${isDiff && v > 0 ? '+' : ''}${show(v)} ${unit}` }));

  // Leading see-through stops: the field draws nothing at or below the last one.
  let lastClear = -1;
  while (lastClear + 1 < scale.palette.length && scale.palette[lastClear + 1][2] <= 0) lastClear += 1;

  return (
    <>
      <Section title={isDiff ? `${spec.label} · HRRR − GFS` : spec.label}>
        {rows.map((row) => <ColorRow key={row.label} {...row} />)}
        {isDiff ? (
          <Note>
            Blue: HRRR lower · red: HRRR higher · no colour within ±{show(scale.encoding.hi / 10)} {unit}.
          </Note>
        ) : lastClear >= 1 && (
          <Note>No colour at {show(scale.palette[lastClear][0])} {unit} or less.</Note>
        )}
        {spec.description && <Note>{spec.description}</Note>}
      </Section>

      {mode === 'compare' && compareView === 'swipe' && (
        <Section title="Swipe compare">
          <ColorRow color={MODEL_STYLE.hrrr.hexDark} label="HRRR · left of the divider" />
          <ColorRow color={MODEL_STYLE.gfs.hexDark} label="GFS · right of the divider" />
        </Section>
      )}

      {/* Same condition as the map layer: no particles in compare views. */}
      {particles && mode !== 'compare' && (
        <Section title="Wind particles">
          <ColorRow color="rgba(255, 255, 255, 0.75)" label="Moving with the 10 m wind" />
          <Note>Faster-moving particles mean stronger wind.</Note>
        </Section>
      )}
    </>
  );
}

export default function ModelLegend({ map = null }) {
  const wm = useWeatherModelsContext();
  return <LegendFrame map={map}>{legendContent(wm)}</LegendFrame>;
}
