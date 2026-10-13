import { SURGE_LEGEND } from '../../../api/nhcTropicalWeather';
import { LOADING_TEXT, ProductEmpty, ProductHeading, Swatch } from './productParts';

// SURGE_LEGEND's depth bands: >1, >3, >6, >9 ft above ground.
function surgeColor(ft) {
  const i = ft > 9 ? 3 : ft > 6 ? 2 : ft > 3 ? 1 : 0;
  return SURGE_LEGEND[i].color;
}

function Legend() {
  return (
    <>
      <ProductHeading className="mt-5 mb-2">Map legend</ProductHeading>
      <ul className="flex flex-wrap gap-2">
        {SURGE_LEGEND.map((l) => (
          <li key={l.label} className="inline-flex items-center gap-2 rounded-full border border-sentinel-600 px-3 py-1 text-[13px] text-sentinel-100">
            <Swatch color={l.color} size={10} />
            {l.label}
          </li>
        ))}
      </ul>
    </>
  );
}

export default function StormSurge({ model }) {
  const { surge } = model;
  const advisory = model.text.tcp?.surge;
  const rows = advisory?.rows ?? [];

  if (rows.length > 0) {
    const max = Math.max(...rows.map((r) => r.maxFt));
    return (
      <div>
        <ProductHeading className="mb-2">Peak surge above ground</ProductHeading>
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.area} className="text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-slate-100">{r.area}</span>
                <span className="shrink-0 font-semibold text-white tabular-nums">{r.minFt}–{r.maxFt} ft</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-sentinel-700">
                <div className="h-full rounded-full" style={{ width: `${(r.maxFt / max) * 100}%`, backgroundColor: surgeColor(r.maxFt) }} />
              </div>
            </li>
          ))}
        </ul>
        {advisory.text && <p className="mt-4 text-[13px] leading-relaxed text-sentinel-200 whitespace-pre-line">{advisory.text}</p>}
        {surge.threat && <Legend />}
      </div>
    );
  }

  if (!surge.fetched) return <ProductEmpty>{LOADING_TEXT}</ProductEmpty>;
  if (!surge.threat) return <ProductEmpty>No U.S. surge threat.</ProductEmpty>;
  return (
    <div>
      <p className="text-sm leading-relaxed text-sentinel-100">
        NHC's potential storm surge flooding map is on: a reasonable worst case for inundation above ground.
      </p>
      <Legend />
    </div>
  );
}
