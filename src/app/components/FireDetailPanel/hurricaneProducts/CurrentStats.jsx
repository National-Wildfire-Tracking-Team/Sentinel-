import { categoryColor } from '../../../api/nhcTropicalWeather';
import { categoryShort, ktToMph } from '../hurricaneModel';
import { ProductEmpty, ProductHeading } from './productParts';

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[136px_1fr] gap-3 py-1.5 text-sm leading-relaxed">
      <dt className="text-sentinel-200">{label}</dt>
      <dd className="text-slate-100 tabular-nums">{children}</dd>
    </div>
  );
}

/** "Hurricane-force 30 mi, tropical-storm-force 140 mi from center" */
function windFieldText(extent) {
  const parts = [[64, 'hurricane-force'], [34, 'tropical-storm-force']]
    .filter(([kt]) => extent[kt])
    .map(([kt, label]) => `${label} ${extent[kt]} mi`);
  if (parts.length === 0) return null;
  const text = `${parts.join(', ')} from center`;
  return text[0].toUpperCase() + text.slice(1);
}

const tauLabel = (tau) => (tau === 0 ? 'Now' : `${tau} hr`);

export default function CurrentStats({ storm, model }) {
  const { pressureTrend: trend, forecast } = model;
  const windField = windFieldText(model.windExtent);

  return (
    <div>
      <dl>
        {storm.maxWindKt > 0 && <Row label="Max sustained">{storm.maxWindMph} mph ({storm.maxWindKt} kt)</Row>}
        {storm.gustKt > 0 && <Row label="Gusts">{ktToMph(storm.gustKt)} mph ({storm.gustKt} kt)</Row>}
        {storm.mslp != null && <Row label="Pressure">{storm.mslp} mb{trend && `, ${trend.label.toLowerCase()}`}</Row>}
        {storm.movement && <Row label="Movement">{storm.movement}</Row>}
        {model.eyeDiameterNm != null && <Row label="Eye diameter">{model.eyeDiameterNm} nm</Row>}
        {windField && <Row label="Wind field">{windField}</Row>}
      </dl>

      <ProductHeading className="mt-6 mb-1">Forecast intensity</ProductHeading>
      {forecast.length === 0 ? (
        <ProductEmpty>No forecast points in this advisory.</ProductEmpty>
      ) : (
        <ul>
          {forecast.map((f) => {
            const color = categoryColor(f.category);
            return (
              <li key={f.tau} className="grid grid-cols-[56px_52px_1fr_auto] items-center gap-2 border-b border-sentinel-700 py-2 text-sm">
                <span className="text-sentinel-200 tabular-nums">{tauLabel(f.tau)}</span>
                <span>
                  <span
                    className="inline-flex rounded-md border px-1.5 text-[11px] font-bold leading-[18px] tracking-wide"
                    style={{ color, borderColor: color }}
                    title={f.category}
                  >
                    {categoryShort(f.category)}
                  </span>
                </span>
                <span className="text-sentinel-100 tabular-nums">
                  {f.timeLabel}
                  {f.note && <span className="text-sentinel-200"> · {f.note}</span>}
                </span>
                <span className="text-right font-semibold text-white tabular-nums">{f.windMph} mph</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
