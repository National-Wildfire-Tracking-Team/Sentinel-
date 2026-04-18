/**
 * WeatherAlertsFeed.jsx
 * Live active NWS weather alerts feed for weather tracking mode.
 */

import { useMemo, useState } from 'react';
import { Loader2, AlertCircle, ShieldAlert, AlertTriangle, Info, CloudSun } from 'lucide-react';
import { nwsAlertColor, nwsAlertCategory } from '../../utils/nwsColors';
import { useApp } from '../../context/AppContext';

/** Compute a representative center [lng, lat] from a GeoJSON Polygon or MultiPolygon. */
function getAlertCenter(alert) {
  const geom = alert.geometry;
  if (!geom) return null;
  let ring;
  if (geom.type === 'Polygon') {
    ring = geom.coordinates[0];
  } else if (geom.type === 'MultiPolygon') {
    ring = geom.coordinates[0]?.[0];
  }
  if (!ring?.length) return null;
  const sumLng = ring.reduce((s, c) => s + c[0], 0);
  const sumLat = ring.reduce((s, c) => s + c[1], 0);
  return { lng: sumLng / ring.length, lat: sumLat / ring.length };
}

const SEVERITY_STYLES = {
  Extreme:  'border-red-600/60 bg-red-950/50 text-red-200',
  Severe:   'border-orange-600/60 bg-orange-950/50 text-orange-200',
  Moderate: 'border-yellow-600/60 bg-yellow-950/50 text-yellow-200',
  Minor:    'border-blue-600/60 bg-blue-950/50 text-blue-200',
  Unknown:  'border-sentinel-600 bg-sentinel-800/60 text-sentinel-200',
};

const SEVERITY_ICONS = {
  Extreme:  ShieldAlert,
  Severe:   AlertTriangle,
  Moderate: AlertTriangle,
  Minor:    Info,
  Unknown:  Info,
};

const SEVERITY_RANK = {
  Extreme: 0,
  Severe: 1,
  Moderate: 2,
  Minor: 3,
  Unknown: 4,
};

function AlertRow({ alert }) {
  const [expanded, setExpanded] = useState(false);
  const { selectFire, setViewport } = useApp();
  const severity = alert.severity || 'Unknown';
  const styles = SEVERITY_STYLES[severity] || SEVERITY_STYLES.Unknown;
  const Icon = SEVERITY_ICONS[severity] || Info;
  const accentColor = nwsAlertColor(alert.type);
  const category = nwsAlertCategory(alert.type);

  const handleClick = () => {
    selectFire({ ...alert, type: 'weather-alert', eventType: alert.type });
    const center = getAlertCenter(alert);
    if (center) {
      setViewport({ longitude: center.lng, latitude: center.lat, zoom: 7 });
    }
    setExpanded((e) => !e);
  };

  return (
    <div className={`rounded-lg border p-2.5 ${styles}`}>
      <button
        type="button"
        onClick={handleClick}
        className="w-full text-left"
      >
        <div className="flex items-start gap-2">
          <span
            aria-hidden="true"
            className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: accentColor }}
          />
          <Icon size={14} className="shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="text-xs font-semibold leading-tight truncate">{alert.type}</div>
              {alert.source === 'fema' && (
                <span className="text-[9px] font-bold px-1 py-0 rounded bg-orange-800/60 text-orange-200 shrink-0 uppercase tracking-wide">
                  FEMA
                </span>
              )}
            </div>
            {alert.headline && (
              <div className="text-[11px] opacity-80 mt-0.5 line-clamp-2">{alert.headline}</div>
            )}
            {alert.affectedArea && (
              <div className="text-[10px] opacity-70 mt-0.5 truncate">{alert.affectedArea}</div>
            )}
          </div>
          <span className="text-[10px] font-medium opacity-70 shrink-0 capitalize">{category}</span>
        </div>
      </button>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-white/10 space-y-1.5">
          {alert.affectedArea && (
            <div className="text-[11px]">
              <span className="font-semibold">Area:</span> {alert.affectedArea}
            </div>
          )}
          {alert.senderName && (
            <div className="text-[11px]">
              <span className="font-semibold">Source:</span> {alert.senderName}
            </div>
          )}
          {alert.instruction && (
            <div className="text-[11px]">
              <span className="font-semibold">Instructions:</span> {alert.instruction}
            </div>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] opacity-70">
            <span>Severity: {severity}</span>
            {alert.urgency && <span>Urgency: {alert.urgency}</span>}
            {alert.certainty && <span>Certainty: {alert.certainty}</span>}
          </div>
          {alert.expires && (
            <div className="text-[10px] opacity-70">
              Expires: {new Date(alert.expires).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const FILTER_OPTIONS = [
  { key: 'all',       label: 'All' },
  { key: 'warning',   label: 'Warnings' },
  { key: 'watch',     label: 'Watches' },
  { key: 'advisory',  label: 'Advisories' },
  { key: 'statement', label: 'Statements' },
];

const FILTER_COLORS = {
  all:       'bg-sentinel-700 text-white border-sentinel-500',
  warning:   'bg-red-700/70 text-red-100 border-red-500/60',
  watch:     'bg-orange-700/70 text-orange-100 border-orange-500/60',
  advisory:  'bg-yellow-700/70 text-yellow-100 border-yellow-500/60',
  statement: 'bg-sky-700/70 text-sky-100 border-sky-500/60',
};

const FILTER_COLORS_INACTIVE = {
  all:       'text-sentinel-300 border-sentinel-600 hover:bg-sentinel-700/50',
  warning:   'text-red-300 border-red-800/50 hover:bg-red-900/30',
  watch:     'text-orange-300 border-orange-800/50 hover:bg-orange-900/30',
  advisory:  'text-yellow-300 border-yellow-800/50 hover:bg-yellow-900/30',
  statement: 'text-sky-300 border-sky-800/50 hover:bg-sky-900/30',
};

export default function WeatherAlertsFeed({ alerts = [], loading, error }) {
  const [activeFilter, setActiveFilter] = useState('all');

  const sorted = useMemo(() => {
    return [...alerts].sort((a, b) => {
      const ra = SEVERITY_RANK[a.severity] ?? SEVERITY_RANK.Unknown;
      const rb = SEVERITY_RANK[b.severity] ?? SEVERITY_RANK.Unknown;
      if (ra !== rb) return ra - rb;
      const ta = a.onset ? new Date(a.onset).getTime() : 0;
      const tb = b.onset ? new Date(b.onset).getTime() : 0;
      return tb - ta;
    });
  }, [alerts]);

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return sorted;
    return sorted.filter((a) => nwsAlertCategory(a.type) === activeFilter);
  }, [sorted, activeFilter]);

  const counts = useMemo(() => {
    const c = { all: alerts.length };
    for (const { key } of FILTER_OPTIONS) {
      if (key !== 'all') c[key] = alerts.filter((a) => nwsAlertCategory(a.type) === key).length;
    }
    return c;
  }, [alerts]);

  return (
    <div className="flex flex-col h-full">
      {/* Filter buttons */}
      <div className="px-2 pt-2 pb-1 shrink-0">
        <div className="flex gap-1 flex-wrap">
          {FILTER_OPTIONS.map(({ key, label }) => {
            const isActive = activeFilter === key;
            const count = counts[key] ?? 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveFilter(key)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-semibold transition-colors ${
                  isActive ? FILTER_COLORS[key] : `bg-transparent ${FILTER_COLORS_INACTIVE[key]}`
                }`}
              >
                {label}
                <span className={`text-[10px] font-bold ${isActive ? 'opacity-90' : 'opacity-60'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sentinel-200">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading active alerts…</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex items-start gap-2 p-3 bg-red-950/40 border border-red-800/50 rounded-lg text-red-300 text-sm">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>Could not load active NWS/FEMA alerts.</span>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-8 text-sentinel-300 text-sm flex flex-col items-center gap-2">
            <CloudSun size={18} />
            <span>{activeFilter === 'all' ? 'No active NWS or FEMA alerts.' : `No active ${activeFilter}s.`}</span>
          </div>
        )}

        {!loading && !error && filtered.map((alert) => (
          <AlertRow key={alert.id} alert={alert} />
        ))}
      </div>
    </div>
  );
}
