/**
 * TropicalWeatherFeed.jsx
 * NHC Tropical Weather sidebar feed — active Invests (pre-genesis systems)
 * and designated tropical cyclones, each as a clickable card that flies the
 * map to the system and opens its detail panel.
 */

import { memo } from 'react';
import { Loader2, Waves, Wind, Navigation, ExternalLink } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatRelativeTime } from '../../utils/formatUtils';

const CHANCE_COLOR = { HIGH: '#FF4444', MEDIUM: '#FFA040', LOW: '#FFE566' };

const CATEGORY_COLOR = {
  'Category 5 Hurricane': '#c026d3',
  'Category 4 Hurricane': '#ef4444',
  'Category 3 Hurricane': '#f97316',
  'Category 2 Hurricane': '#eab308',
  'Category 1 Hurricane': '#facc15',
};

function categoryColor(category) {
  if (CATEGORY_COLOR[category]) return CATEGORY_COLOR[category];
  if (String(category).toLowerCase().includes('storm')) return '#38bdf8';
  return '#94a3b8';
}

function InvestCard({ invest, onSelect }) {
  const chanceColor = CHANCE_COLOR[invest.formationChance] || '#94a3b8';
  return (
    <button
      type="button"
      onClick={() => onSelect(invest)}
      className="w-full text-left rounded-xl border border-sentinel-700 bg-sentinel-800/60
                 hover:bg-sentinel-800 hover:border-sentinel-600 transition-colors p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-white text-sm">Invest {invest.investId || invest.name}</span>
        {invest.formationChance && (
          <span
            className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: `${chanceColor}22`, color: chanceColor, border: `1px solid ${chanceColor}66` }}
          >
            {invest.formationChance}
          </span>
        )}
      </div>
      {(invest.day2Percent != null || invest.day7Percent != null) && (
        <div className="flex gap-3 mt-1.5 text-xs text-sentinel-300">
          {invest.day2Percent != null && <span>2-day: <span className="font-semibold text-white">{invest.day2Percent}%</span></span>}
          {invest.day7Percent != null && <span>7-day: <span className="font-semibold text-white">{invest.day7Percent}%</span></span>}
        </div>
      )}
      {invest.movement && (
        <div className="flex items-center gap-1 mt-1.5 text-[11px] text-sentinel-400">
          <Navigation size={10} />
          {invest.movement}
        </div>
      )}
      {invest.lastUpdate && (
        <div className="text-[10px] text-sentinel-500 mt-1">{formatRelativeTime(invest.lastUpdate)}</div>
      )}
    </button>
  );
}

function CycloneCard({ storm, onSelect }) {
  const color = categoryColor(storm.category);
  return (
    <button
      type="button"
      onClick={() => onSelect(storm)}
      className="w-full text-left rounded-xl border border-sentinel-700 bg-sentinel-800/60
                 hover:bg-sentinel-800 hover:border-sentinel-600 transition-colors p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-white text-sm">{storm.name}</span>
        <span
          className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}66` }}
        >
          {storm.category}
        </span>
      </div>
      <div className="flex gap-3 mt-1.5 text-xs text-sentinel-300">
        {storm.intensityMph > 0 && (
          <span className="flex items-center gap-1"><Wind size={11} /> {storm.intensityMph} mph</span>
        )}
        {storm.pressure && <span>{storm.pressure} mb</span>}
      </div>
      {storm.movement && (
        <div className="flex items-center gap-1 mt-1.5 text-[11px] text-sentinel-400">
          <Navigation size={10} />
          {storm.movement}
        </div>
      )}
      {storm.advNum && (
        <div className="flex items-center gap-1 mt-1 text-[10px] text-sky-400">
          <ExternalLink size={9} />
          Advisory #{storm.advNum}
        </div>
      )}
    </button>
  );
}

const TropicalWeatherFeed = memo(function TropicalWeatherFeed({
  invests = [],
  cyclones = [],
  loading = false,
}) {
  const { selectFire, setViewport } = useApp();

  const handleSelectInvest = (invest) => {
    selectFire({ ...invest, type: 'nhc-invest' });
    if (Number.isFinite(invest.lat) && Number.isFinite(invest.lng)) {
      setViewport({ longitude: invest.lng, latitude: invest.lat, zoom: 6 });
    }
  };

  const handleSelectCyclone = (storm) => {
    selectFire({ ...storm, type: 'nhc-storm' });
    if (Number.isFinite(storm.lat) && Number.isFinite(storm.lng)) {
      setViewport({ longitude: storm.lng, latitude: storm.lat, zoom: 6 });
    }
  };

  if (loading && !invests.length && !cyclones.length) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 text-sentinel-400 text-sm">
        <Loader2 size={16} className="animate-spin" />
        Loading NHC tropical data…
      </div>
    );
  }

  if (!invests.length && !cyclones.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6 text-sentinel-400">
        <Waves size={24} className="text-sentinel-600" />
        <p className="text-sm">No active tropical systems</p>
        <p className="text-[11px] text-sentinel-500">NHC Tropical Weather Outlook — updated every few minutes</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
      {cyclones.length > 0 && (
        <div>
          <div className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sentinel-500">
            Active Cyclones ({cyclones.length})
          </div>
          <div className="space-y-2">
            {cyclones.map((storm) => (
              <CycloneCard key={storm.id} storm={storm} onSelect={handleSelectCyclone} />
            ))}
          </div>
        </div>
      )}
      {invests.length > 0 && (
        <div>
          <div className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sentinel-500">
            Active Invests ({invests.length})
          </div>
          <div className="space-y-2">
            {invests.map((invest) => (
              <InvestCard key={invest.id} invest={invest} onSelect={handleSelectInvest} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default TropicalWeatherFeed;
