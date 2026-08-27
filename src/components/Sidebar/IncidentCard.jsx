/**
 * IncidentCard.jsx
 * Single fire incident card shown in the sidebar feed.
 */

import { useState } from 'react';
import { Flame, MapPin, Users, Home, Bell, BellRing } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatAcres, formatContainment, formatRelativeTime, formatPersonnel } from '../../utils/formatUtils';
import { containmentToColor, incidentSeverity } from '../../utils/colorUtils';
import { haversineMiles } from '../../utils/geoDistance';

const SAME_FIRE_MILES = 0.5;

export default function IncidentCard({
  incident, isSelected,
  trackedLocations = [], onTrack, onUntrack, atTrackingLimit = false,
}) {
  const { selectFire, flyToFire } = useApp();
  const [trackBusy, setTrackBusy] = useState(false);
  const [trackError, setTrackError] = useState(null);

  const handleClick = () => {
    selectFire({ type: 'incident', ...incident });
    flyToFire(incident);
  };

  const trackedLocation = Number.isFinite(incident.lat) && Number.isFinite(incident.lng)
    ? trackedLocations.find(
        (loc) => haversineMiles([incident.lng, incident.lat], [loc.longitude, loc.latitude]) < SAME_FIRE_MILES
      )
    : null;

  const handleTrackToggle = async (e) => {
    e.stopPropagation();
    if (trackBusy) return;
    setTrackBusy(true);
    setTrackError(null);
    try {
      if (trackedLocation) {
        await onUntrack(trackedLocation.id);
      } else {
        await onTrack({
          name: incident.displayLabel || incident.name,
          address: `${incident.county} Co., ${incident.state}`,
          latitude: incident.lat,
          longitude: incident.lng,
        });
      }
    } catch (err) {
      setTrackError(err.message);
      setTimeout(() => setTrackError(null), 4000);
    } finally {
      setTrackBusy(false);
    }
  };

  const containColor = containmentToColor(incident.contained);
  const severity = incidentSeverity(incident);
  const isCritical = severity === 'critical';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
      className={`w-full text-left p-3 rounded-lg border transition-all duration-200 group cursor-pointer
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

        {/* Notify-me toggle */}
        {onTrack && onUntrack && (
          <button
            type="button"
            onClick={handleTrackToggle}
            disabled={trackBusy || (!trackedLocation && atTrackingLimit)}
            title={trackedLocation ? 'Stop notifying me about this fire' : 'Notify me about this fire'}
            aria-label={trackedLocation ? 'Stop notifying me about this fire' : 'Notify me about this fire'}
            aria-pressed={Boolean(trackedLocation)}
            className={`shrink-0 p-1 rounded transition-colors disabled:opacity-30 ${
              trackedLocation
                ? 'text-amber-400 hover:text-amber-300'
                : 'text-sentinel-500 hover:text-white'
            }`}
          >
            {trackedLocation ? <BellRing size={14} /> : <Bell size={14} />}
          </button>
        )}

        {/* Status badge */}
        <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded
          ${isCritical                        ? 'bg-red-600 text-white animate-pulse-fire'
          : incident.status === 'active'      ? 'bg-red-900/60 text-red-400'
          : incident.status === 'containment' ? 'bg-yellow-900/60 text-yellow-400'
          : 'bg-green-900/60 text-green-400'}`}
        >
          {isCritical ? 'Critical' : incident.status === 'active' ? 'Active' : incident.status === 'containment' ? 'Contained' : 'Controlled'}
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

      {trackError && (
        <p className="mt-2 text-[11px] text-red-300 bg-red-950/40 border border-red-800/50 rounded px-2 py-1">
          {trackError}
        </p>
      )}
    </div>
  );
}
