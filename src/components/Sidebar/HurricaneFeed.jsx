/**
 * HurricaneFeed.jsx
 * Sidebar feed showing active hurricanes / tropical cyclones from NOAA NHC.
 */

import { Loader2, AlertCircle, Navigation, ExternalLink } from 'lucide-react';
import { categoryColor } from '../../api/nhcHurricane';

const CLASS_STYLES = {
  'Category 5':          'text-fuchsia-300 border-fuchsia-700/60 bg-fuchsia-950/40',
  'Category 4':          'text-red-300 border-red-700/60 bg-red-950/40',
  'Category 3':          'text-orange-300 border-orange-700/60 bg-orange-950/40',
  'Category 2':          'text-amber-300 border-amber-700/60 bg-amber-950/40',
  'Category 1':          'text-yellow-300 border-yellow-700/60 bg-yellow-950/40',
  'Tropical Storm':      'text-cyan-300 border-cyan-700/60 bg-cyan-950/40',
  'Tropical Depression': 'text-blue-300 border-blue-700/60 bg-blue-950/40',
};

function degToCompass(deg) {
  if (deg == null) return '';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(Number(deg) / 22.5) % 16] || '';
}

function StormCard({ storm }) {
  const badgeStyle = CLASS_STYLES[storm.category] || 'text-sentinel-100 border-sentinel-600 bg-sentinel-800/60';
  const dotColor = categoryColor(storm.windKt);

  return (
    <div className="rounded-lg border border-sentinel-700 bg-sentinel-800/70 p-3 space-y-2">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}80` }}
          />
          <span className="text-sm font-bold text-white">{storm.name}</span>
        </div>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap ${badgeStyle}`}>
          {storm.category}
        </span>
      </div>

      {/* Classification */}
      <div className="text-[11px] text-sentinel-200">{storm.classLabel}</div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div>
          <span className="text-sentinel-300">Wind: </span>
          <span className="text-white font-medium">{storm.windKt} kt ({storm.windMph} mph)</span>
        </div>
        {storm.pressure && (
          <div>
            <span className="text-sentinel-300">Pressure: </span>
            <span className="text-white font-medium">{storm.pressure} mb</span>
          </div>
        )}
        {storm.movementDir != null && (
          <div className="flex items-center gap-1">
            <Navigation size={10} className="text-sentinel-300" style={{ transform: `rotate(${storm.movementDir}deg)` }} />
            <span className="text-sentinel-300">Moving: </span>
            <span className="text-white font-medium">
              {degToCompass(storm.movementDir)}{storm.movementSpeed ? ` at ${storm.movementSpeed} mph` : ''}
            </span>
          </div>
        )}
        <div>
          <span className="text-sentinel-300">Position: </span>
          <span className="text-white font-medium">
            {Math.abs(storm.lat).toFixed(1)}&deg;{storm.lat >= 0 ? 'N' : 'S'},{' '}
            {Math.abs(storm.lng).toFixed(1)}&deg;{storm.lng >= 0 ? 'E' : 'W'}
          </span>
        </div>
      </div>

      {/* Advisory links */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {storm.publicAdvisoryUrl && (
          <a
            href={storm.publicAdvisoryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded
                       bg-sentinel-700 border border-sentinel-600 text-sentinel-100
                       hover:bg-sentinel-600 hover:text-white transition-colors"
          >
            Advisory <ExternalLink size={8} />
          </a>
        )}
        {storm.forecastGraphicUrl && (
          <a
            href={storm.forecastGraphicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded
                       bg-sentinel-700 border border-sentinel-600 text-sentinel-100
                       hover:bg-sentinel-600 hover:text-white transition-colors"
          >
            Forecast <ExternalLink size={8} />
          </a>
        )}
        {storm.forecastDiscussionUrl && (
          <a
            href={storm.forecastDiscussionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded
                       bg-sentinel-700 border border-sentinel-600 text-sentinel-100
                       hover:bg-sentinel-600 hover:text-white transition-colors"
          >
            Discussion <ExternalLink size={8} />
          </a>
        )}
      </div>

      {/* Last update */}
      {storm.lastUpdate && (
        <div className="text-[10px] text-sentinel-400 pt-0.5">
          Updated {new Date(storm.lastUpdate).toLocaleString()}
        </div>
      )}
    </div>
  );
}

export default function HurricaneFeed({ storms = [], loading = false, error = null }) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-sentinel-700 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-sentinel-100 uppercase tracking-wider">
            Active Tropical Cyclones
          </span>
          <span className="text-[10px] text-sentinel-300">{storms.length} storms</span>
        </div>
        <div className="text-[10px] text-sentinel-400 mt-0.5">Source: NOAA National Hurricane Center</div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sentinel-200">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading hurricane data…</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex items-start gap-2 p-3 bg-red-950/40 border border-red-800/50 rounded-lg text-red-300 text-sm">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>Could not load hurricane data.</span>
          </div>
        )}

        {!loading && !error && storms.length === 0 && (
          <div className="text-center py-8 text-sentinel-300 text-sm flex flex-col items-center gap-2">
            <span className="text-lg">No active tropical cyclones</span>
            <span className="text-[11px] text-sentinel-400">
              Data refreshes automatically every 5 minutes
            </span>
          </div>
        )}

        {!loading && !error && storms.map((storm) => (
          <StormCard key={storm.id} storm={storm} />
        ))}
      </div>
    </div>
  );
}
