/**
 * NhcWindProbControls.jsx
 * Under the Wind probabilities switch (in NhcTropicalControls) while it's on: which sustained-wind
 * threshold the 5-day probabilities are for (NHC publishes 34, 50 and 64 kt).
 */

import { memo } from 'react';
import { useApp } from '../../context/AppContext';
import { WIND_PROB_THRESHOLDS_KT } from '../../api/nhcTropicalWeather';

const LABELS = { 34: 'Tropical storm', 50: 'Strong TS', 64: 'Hurricane' };

const NhcWindProbControls = memo(function NhcWindProbControls() {
  const { layers, nhcWindProbKt, setNhcWindProbKt } = useApp();
  if (!layers.nhcWindProb) return null;

  return (
    <div className="flex items-center gap-1.5 pl-6 pr-1.5 pb-1.5" role="group" aria-label="Wind threshold">
      {WIND_PROB_THRESHOLDS_KT.map((kt) => {
        const active = kt === nhcWindProbKt;
        return (
          <button
            key={kt}
            type="button"
            aria-pressed={active}
            title={`Chance of ${kt}-kt (${Math.round(kt * 1.15078)} mph) or stronger winds in the next 5 days`}
            onClick={() => setNhcWindProbKt(kt)}
            className={`flex-1 rounded-md px-1.5 py-1 text-[10px] font-semibold border transition-all ${
              active
                ? 'bg-sky-600 text-white border-transparent'
                : 'bg-sentinel-900 text-sentinel-300 border-sentinel-600 hover:bg-sentinel-700 hover:text-white'}`}
          >
            {kt} kt
            <span className="block text-[9px] font-normal opacity-80">{LABELS[kt]}</span>
          </button>
        );
      })}
    </div>
  );
});

export default NhcWindProbControls;
