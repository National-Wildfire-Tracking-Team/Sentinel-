/**
 * RadarControlBar.jsx
 * Floating strip that appears directly above the bottom bar when the Radar
 * layer is on. The up arrow expands it to reveal the composite/site mode
 * switch. Site radar's own history scrub lives on its popup (RadarSitePanel)
 * instead — the composite mosaic is live only.
 */

import { memo } from 'react';
import { ChevronUp, ChevronDown, Radar, RadioTower } from 'lucide-react';
import { useApp } from '../../context/AppContext';

const RadarControlBar = memo(function RadarControlBar({
  radarMode = 'composite',
  onRadarModeChange,
  radarExpanded = false,
  onToggleExpanded,
}) {
  const { layers } = useApp();
  if (!layers.radar) return null;

  const isSite = radarMode === 'site';

  return (
    <div
      className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-20
                    flex flex-col gap-1 bg-white/90 dark:bg-black/90 backdrop-blur-sm
                    border border-sentinel-200 dark:border-zinc-700 rounded-2xl
                    shadow-2xl shadow-black/10 dark:shadow-black/60 p-1.5
                    origin-bottom animate-slide-up-panel"
    >
      {radarExpanded && (
        <div className="flex items-center gap-1 px-0.5 pb-1 border-b border-sentinel-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => onRadarModeChange?.('composite')}
            aria-pressed={!isSite}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
              !isSite ? 'bg-emerald-600 text-white shadow' : 'text-sentinel-600 dark:text-zinc-300 hover:text-sentinel-900 dark:hover:text-white hover:bg-sentinel-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Radar size={13} />
            <span>Composite</span>
          </button>
          <button
            type="button"
            onClick={() => onRadarModeChange?.('site')}
            aria-pressed={isSite}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
              isSite ? 'bg-cyan-600 text-white shadow' : 'text-sentinel-600 dark:text-zinc-300 hover:text-sentinel-900 dark:hover:text-white hover:bg-sentinel-100 dark:hover:bg-zinc-800'
            }`}
          >
            <RadioTower size={13} />
            <span>Site</span>
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onToggleExpanded}
        className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg text-sentinel-600 dark:text-zinc-300 hover:text-sentinel-900 dark:hover:text-white hover:bg-sentinel-100 dark:hover:bg-zinc-800 transition-colors"
        aria-label={radarExpanded ? 'Collapse radar controls' : 'Expand radar controls'}
        aria-expanded={radarExpanded}
      >
        {radarExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        {isSite ? <RadioTower size={12} /> : <Radar size={12} />}
        <span className="text-[10px] font-semibold uppercase tracking-wide">Radar</span>
      </button>
    </div>
  );
});

export default RadarControlBar;
