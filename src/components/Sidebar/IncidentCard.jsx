/**
 * IncidentCard.jsx
 * Single fire incident card shown in the sidebar feed.
 */

import { Flame, MapPin, Users, Home, ChevronRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatAcres, formatContainment, formatRelativeTime, formatPersonnel } from '../../utils/formatUtils';
import { containmentToColor } from '../../utils/colorUtils';

export default function IncidentCard({ incident, isSelected }) {
  const { selectFire, flyToFire } = useApp();

  const handleClick = () => {
    selectFire({ type: 'incident', ...incident });
    flyToFire(incident);
  };

  const containColor = containmentToColor(incident.contained);

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left p-3 rounded-lg border transition-all duration-200 group
        ${isSelected
          ? 'bg-fire-600/15 border-fire-600/50 shadow-lg shadow-fire-900/20'
          : 'bg-sentinel-800/60 border-sentinel-700 hover:bg-sentinel-700/60 hover:border-sentinel-600'
        }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Flame icon – pulses for active fires */}
          <div className={`shrink-0 p-1.5 rounded-md ${incident.status === 'active' ? 'bg-fire-600/20' : 'bg-sentinel-700'}`}>
            <Flame
              size={14}
              className={incident.status === 'active' ? 'text-fire-400 animate-pulse-fire' : 'text-sentinel-400'}
            />
          </div>
          <span className="font-semibold text-white text-sm truncate">{incident.displayLabel || incident.name}</span>
        </div>

        {/* Status badge */}
        <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded
          ${incident.status === 'active'      ? 'bg-red-900/60 text-red-400'
          : incident.status === 'containment' ? 'bg-yellow-900/60 text-yellow-400'
          : 'bg-green-900/60 text-green-400'}`}
        >
          {incident.status === 'active' ? 'Active' : incident.status === 'containment' ? 'Contained' : 'Controlled'}
        </span>
      </div>

      {/* Location */}
      <div className="flex items-center gap-1.5 text-sentinel-400 text-xs mb-2">
        <MapPin size={11} />
        <span>{incident.county} Co., {incident.state}</span>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-xs mb-2">
        <span className="text-white font-semibold">{formatAcres(incident.acres)}</span>
        <span className="text-sentinel-500">·</span>
        <span style={{ color: containColor }} className="font-semibold">
          {formatContainment(incident.contained)} contained
        </span>
      </div>

      {/* Containment bar */}
      <div className="h-1.5 w-full bg-sentinel-700 rounded-full overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${incident.contained}%`, backgroundColor: containColor }}
        />
      </div>

      {/* Footer stats */}
      <div className="flex items-center justify-between text-xs text-sentinel-400">
        <div className="flex items-center gap-3">
          {incident.personnel > 0 && (
            <span className="flex items-center gap-1">
              <Users size={10} />
              {formatPersonnel(incident.personnel)}
            </span>
          )}
          {incident.structures_destroyed > 0 && (
            <span className="flex items-center gap-1 text-orange-400">
              <Home size={10} />
              {incident.structures_destroyed} destroyed
            </span>
          )}
        </div>
        <span className="text-sentinel-500">{formatRelativeTime(incident.updated)}</span>
      </div>
    </button>
  );
}
