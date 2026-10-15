import { useApp } from '../../../context/AppContext';
import { WIND_PROB_THRESHOLDS_KT, nhcProductUrl } from '../../../api/nhcTropicalWeather';
import { ktToMph, windProbBand } from '../hurricaneModel';
import {
  LOADING_TEXT, ProductEmpty, SegmentedControl, Swatch, productLink,
} from './productParts';

const COLUMNS = [[24, '24 hr'], [48, '48 hr'], [120, '5 days']];
const percent = (v) => (v == null ? '—' : v === 0 ? '<1%' : `${v}%`);

export default function WindProbabilities({ storm, model }) {
  // Same threshold as the map layer (and its NhcWindProbControls).
  const { nhcWindProbKt, setNhcWindProbKt } = useApp();
  const { loaded, pws } = model.text;
  const rows = (pws ?? []).filter((r) => r.kt === nhcWindProbKt);

  return (
    <div>
      <SegmentedControl
        label="Wind threshold"
        value={nhcWindProbKt}
        onChange={setNhcWindProbKt}
        options={WIND_PROB_THRESHOLDS_KT.map((kt) => ({ value: kt, label: `${kt} kt` }))}
      />
      <p className="mt-2 text-[13px] text-sentinel-200 tabular-nums">
        Chance of {nhcWindProbKt}-kt ({ktToMph(nhcWindProbKt)} mph) or stronger sustained winds, by the end of each period.
      </p>

      <div className="mt-4">
        {!loaded ? (
          <ProductEmpty>{LOADING_TEXT}</ProductEmpty>
        ) : rows.length === 0 ? (
          <ProductEmpty>No locations with a meaningful chance at this threshold.</ProductEmpty>
        ) : (
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-sentinel-200">
                <th className="py-1.5 font-semibold">Location</th>
                {COLUMNS.map(([h, label]) => <th key={h} className="py-1.5 text-right font-semibold">{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const band = windProbBand(r.cumulative[120]);
                return (
                  <tr key={r.location} className="border-t border-sentinel-700">
                    <td className="py-2">
                      <span className="flex items-center gap-2 text-slate-100">
                        {band ? <Swatch color={band.color} size={10} /> : <span className="w-[10px]" aria-hidden />}
                        {r.location}
                      </span>
                    </td>
                    {COLUMNS.map(([h]) => <td key={h} className="py-2 text-right text-slate-100">{percent(r.cumulative[h])}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <a href={nhcProductUrl(storm.slot, 'PWS')} target="_blank" rel="noopener noreferrer" className={productLink}>
        Full table on nhc.noaa.gov
      </a>
    </div>
  );
}
