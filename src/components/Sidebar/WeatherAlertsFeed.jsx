/**
 * WeatherAlertsFeed.jsx
 * Live active NOAA/NWS alerts feed — grouped by category and event type,
 * with compact cards matching the weather sidebar design.
 */

import { useMemo, useState, useCallback } from 'react';
import {
  Loader2,
  AlertCircle,
  ShieldAlert,
  AlertTriangle,
  Info,
  CloudSun,
  Eye,
  HelpCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { nwsAlertColor, nwsAlertCategory } from '../../utils/nwsColors';
import { useApp } from '../../context/AppContext';
import { formatRelativeTime } from '../../utils/formatUtils';

const NAVY = '#1D2951';
const MAROON = '#8B0000';

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

function firstPopulation(params) {
  if (!params || typeof params !== 'object') return null;
  const keys = Object.keys(params);
  const popKey = keys.find((k) => /^population$/i.test(k) || /^POP/i.test(k));
  if (!popKey) return null;
  const raw = params[popKey];
  const n = Array.isArray(raw) ? raw[0] : raw;
  const v = parseInt(String(n).replace(/\D/g, ''), 10);
  return Number.isFinite(v) ? v : null;
}

function firstStateCode(geocodes) {
  if (!geocodes?.length) return null;
  const ugc = geocodes.find((c) => typeof c === 'string' && c.length >= 2);
  if (!ugc) return null;
  return ugc.slice(0, 2).toUpperCase();
}

function issuingOfficeCode(alert) {
  const wmo = alert.parameters?.WMOidentifier;
  if (Array.isArray(wmo) && wmo[0]) {
    const parts = String(wmo[0]).trim().split(/\s+/);
    if (parts.length >= 2) return parts[1].toUpperCase();
  }
  const ugc = alert.geocodes || alert.geocode?.UGC;
  const fromUgc = Array.isArray(ugc) ? ugc.find((c) => typeof c === 'string' && /^[A-Z]{3}\d/.test(c)) : null;
  if (fromUgc && fromUgc.length >= 3) return fromUgc.slice(0, 3).toUpperCase();
  return null;
}

function categoryLabel(key) {
  if (key === 'warning') return 'Warnings';
  if (key === 'watch') return 'Watches';
  if (key === 'advisory') return 'Advisories';
  if (key === 'statement') return 'Statements';
  if (key === 'eas') return 'EAS';
  return 'Other';
}

const CATEGORY_ORDER = ['warning', 'watch', 'advisory', 'statement', 'eas', 'other'];

const CATEGORY_CARD_BG = {
  warning: '#FDE2E2',
  watch: '#FFF4E5',
  advisory: '#F0F9FF',
  statement: '#F1F5F9',
  eas: '#FEF3C7',
  other: '#F1F5F9',
};

const SEVERITY_ICONS = {
  Extreme: ShieldAlert,
  Severe: AlertTriangle,
  Moderate: AlertTriangle,
  Minor: Info,
  Unknown: Info,
};

function SelectedAlertBanner({ alert, onClear }) {
  const bg = CATEGORY_CARD_BG[nwsAlertCategory(alert.type)] || CATEGORY_CARD_BG.other;
  const pop = firstPopulation(alert.parameters);
  const state = firstStateCode(alert.geocodes || alert.geocode?.UGC);
  const office = issuingOfficeCode(alert);

  return (
    <div
      className="mx-2 mb-2 rounded-xl px-3 py-2.5 border border-black/5 shadow-sm"
      style={{ backgroundColor: bg }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold leading-snug pr-1" style={{ color: MAROON }}>
          {alert.headline || alert.type}
        </p>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 text-[10px] font-semibold uppercase tracking-wide opacity-70 hover:opacity-100"
            style={{ color: NAVY }}
          >
            List
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {pop != null && (
          <span
            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: NAVY }}
          >
            <span aria-hidden="true">👤</span>
            {pop.toLocaleString()}
          </span>
        )}
        {state && (
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: NAVY }}
          >
            {state}
          </span>
        )}
        {office && (
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: NAVY }}
          >
            {office}
          </span>
        )}
      </div>
      {alert.response && (
        <p className="text-[11px] mt-2 leading-snug" style={{ color: NAVY }}>
          {alert.type}: <span className="font-bold">{alert.response}</span>
        </p>
      )}
      {alert.expires && (
        <p className="text-[11px] mt-1 font-medium" style={{ color: MAROON }}>
          Expires {formatRelativeTime(alert.expires)}
        </p>
      )}
    </div>
  );
}

function AlertTypeRow({
  eventType,
  count,
  alertsInType,
  categoryKey,
  expanded,
  onToggle,
  accentColor,
  selectedId,
  onSelectAlert,
}) {
  const Icon = SEVERITY_ICONS[alertsInType[0]?.severity] || Info;

  return (
    <div className="ml-1">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 py-1.5 px-1 rounded-lg hover:bg-white/5 transition-colors text-left"
      >
        <span className="flex items-center justify-center w-7 h-7 rounded-full shrink-0" style={{ backgroundColor: accentColor }}>
          <Icon size={14} className="text-white drop-shadow-sm" strokeWidth={2.5} />
        </span>
        <span className="flex-1 min-w-0 font-bold text-sm truncate" style={{ color: NAVY }}>
          {eventType}
        </span>
        <span
          className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
          style={{ backgroundColor: NAVY }}
        >
          {count}
        </span>
        <span className="shrink-0 p-0.5 rounded-full hover:bg-white/10" style={{ color: NAVY }} title="NWS event type">
          <HelpCircle size={16} strokeWidth={2} />
        </span>
        {expanded ? (
          <ChevronDown size={16} className="shrink-0 opacity-60" style={{ color: NAVY }} />
        ) : (
          <ChevronRight size={16} className="shrink-0 opacity-60" style={{ color: NAVY }} />
        )}
      </button>

      {expanded && (
        <div className="pl-1 pb-2 space-y-2">
          {alertsInType.map((alert) => (
            <CompactAlertCard
              key={alert.id}
              alert={alert}
              categoryKey={categoryKey}
              selected={selectedId === alert.id}
              onSelect={() => onSelectAlert(alert)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CompactAlertCard({ alert, categoryKey, selected, onSelect }) {
  const bg = CATEGORY_CARD_BG[categoryKey] || CATEGORY_CARD_BG.other;
  const pop = firstPopulation(alert.parameters);
  const state = firstStateCode(alert.geocodes || alert.geocode?.UGC);
  const office = issuingOfficeCode(alert);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-xl px-3 py-2.5 border transition-shadow ${
        selected ? 'ring-2 ring-sky-400 ring-offset-2 ring-offset-sentinel-900' : 'border-black/5'
      } shadow-sm hover:shadow`}
      style={{ backgroundColor: bg }}
    >
      <p className="text-xs font-bold leading-snug" style={{ color: MAROON }}>
        {alert.headline || alert.type}
      </p>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {pop != null && (
          <span
            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: NAVY }}
          >
            <span aria-hidden="true">👤</span>
            {pop.toLocaleString()}
          </span>
        )}
        {state && (
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: NAVY }}
          >
            {state}
          </span>
        )}
        {office && (
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: NAVY }}
          >
            {office}
          </span>
        )}
      </div>
      {alert.response && (
        <p className="text-[11px] mt-2 leading-snug" style={{ color: NAVY }}>
          {alert.type}: <span className="font-bold">{alert.response}</span>
        </p>
      )}
      {alert.expires && (
        <p className="text-[11px] mt-1 font-medium" style={{ color: MAROON }}>
          Expires {formatRelativeTime(alert.expires)}
        </p>
      )}
    </button>
  );
}

function CategorySection({
  categoryKey,
  alerts: sectionAlerts,
  expandedCategory,
  onToggleCategory,
  expandedTypes,
  toggleType,
  selectedId,
  onSelectAlert,
}) {
  const total = sectionAlerts.length;
  const m = new Map();
  for (const a of sectionAlerts) {
    const t = a.type || 'Unknown';
    if (!m.has(t)) m.set(t, []);
    m.get(t).push(a);
  }
  const byType = [...m.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
  );

  const open = expandedCategory;

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => onToggleCategory(categoryKey)}
        className="w-full flex items-center gap-2 py-2 px-1 rounded-lg hover:bg-white/5 transition-colors"
      >
        <span className="flex-1 text-left font-bold text-sm" style={{ color: NAVY }}>
          {categoryLabel(categoryKey)}
        </span>
        <span
          className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
          style={{ backgroundColor: NAVY }}
        >
          {total}
        </span>
        <span className="shrink-0 p-1 rounded-md hover:bg-white/10" style={{ color: NAVY }} title="Alert count in this category">
          <Eye size={18} strokeWidth={2} />
        </span>
        {open ? (
          <ChevronDown size={18} className="shrink-0 opacity-50" style={{ color: NAVY }} />
        ) : (
          <ChevronRight size={18} className="shrink-0 opacity-50" style={{ color: NAVY }} />
        )}
      </button>

      {open && (
        <div className="border-l-2 border-white/10 ml-2 pl-1 space-y-0.5">
          {byType.map(([eventType, list]) => (
            <AlertTypeRow
              key={eventType}
              eventType={eventType}
              count={list.length}
              alertsInType={list}
              categoryKey={categoryKey}
              expanded={expandedTypes.has(eventType)}
              onToggle={() => toggleType(eventType)}
              accentColor={nwsAlertColor(eventType)}
              selectedId={selectedId}
              onSelectAlert={onSelectAlert}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'warning', label: 'Warnings' },
  { key: 'watch', label: 'Watches' },
  { key: 'advisory', label: 'Advisories' },
  { key: 'statement', label: 'Statements' },
];

const FILTER_COLORS = {
  all: 'bg-sentinel-700 text-white border-sentinel-500',
  warning: 'bg-red-700/70 text-red-100 border-red-500/60',
  watch: 'bg-orange-700/70 text-orange-100 border-orange-500/60',
  advisory: 'bg-yellow-700/70 text-yellow-100 border-yellow-500/60',
  statement: 'bg-sky-700/70 text-sky-100 border-sky-500/60',
};

const FILTER_COLORS_INACTIVE = {
  all: 'text-sentinel-300 border-sentinel-600 hover:bg-sentinel-700/50',
  warning: 'text-red-300 border-red-800/50 hover:bg-red-900/30',
  watch: 'text-orange-300 border-orange-800/50 hover:bg-orange-900/30',
  advisory: 'text-yellow-300 border-yellow-800/50 hover:bg-yellow-900/30',
  statement: 'text-sky-300 border-sky-800/50 hover:bg-sky-900/30',
};

export default function WeatherAlertsFeed({
  alerts = [],
  loading,
  error,
  activeFilter = 'all',
  onFilterChange,
}) {
  const { selectFire, setViewport, selectedFire, clearSelected } = useApp();

  const [expandedCategories, setExpandedCategories] = useState(() => new Set(['warning']));
  const [expandedTypes, setExpandedTypes] = useState(() => new Set());

  const sorted = useMemo(() => {
    const rank = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };
    return [...alerts].sort((a, b) => {
      const ra = rank[a.severity] ?? rank.Unknown;
      const rb = rank[b.severity] ?? rank.Unknown;
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

  const byCategory = useMemo(() => {
    const m = new Map();
    for (const key of CATEGORY_ORDER) m.set(key, []);
    for (const a of filtered) {
      const cat = nwsAlertCategory(a.type);
      const bucket = m.has(cat) ? cat : 'other';
      m.get(bucket).push(a);
    }
    return m;
  }, [filtered]);

  const selectedWeather =
    selectedFire?.type === 'weather-alert' ? alerts.find((a) => a.id === selectedFire.id) || selectedFire : null;

  const onSelectAlert = useCallback(
    (alert) => {
      selectFire({ ...alert, type: 'weather-alert', eventType: alert.type });
      const center = getAlertCenter(alert);
      if (center) {
        setViewport({ longitude: center.lng, latitude: center.lat, zoom: 7 });
      }
    },
    [selectFire, setViewport]
  );

  const toggleCategory = useCallback((key) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleType = useCallback((eventType) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(eventType)) next.delete(eventType);
      else next.add(eventType);
      return next;
    });
  }, []);

  const categoriesToShow = useMemo(() => {
    if (activeFilter === 'all') return CATEGORY_ORDER.filter((k) => (byCategory.get(k) || []).length > 0);
    return [activeFilter].filter((k) => (byCategory.get(k) || []).length > 0);
  }, [activeFilter, byCategory]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 pt-2 pb-1 shrink-0">
        <div className="flex gap-1 flex-wrap">
          {FILTER_OPTIONS.map(({ key, label }) => {
            const isActive = activeFilter === key;
            const count = counts[key] ?? 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onFilterChange?.(key)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-semibold transition-colors ${
                  isActive ? FILTER_COLORS[key] : `bg-transparent ${FILTER_COLORS_INACTIVE[key]}`
                }`}
              >
                {label}
                <span className={`text-[10px] font-bold ${isActive ? 'opacity-90' : 'opacity-60'}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-2">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sentinel-200">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading active alerts…</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex items-start gap-2 p-3 mx-2 bg-red-950/40 border border-red-800/50 rounded-lg text-red-300 text-sm">
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

        {!loading && !error && selectedWeather && (
          <SelectedAlertBanner alert={selectedWeather} onClear={clearSelected} />
        )}

        {!loading &&
          !error &&
          categoriesToShow.map((catKey) => (
            <CategorySection
              key={catKey}
              categoryKey={catKey}
              alerts={byCategory.get(catKey) || []}
              expandedCategory={expandedCategories.has(catKey)}
              onToggleCategory={toggleCategory}
              expandedTypes={expandedTypes}
              toggleType={toggleType}
              selectedId={selectedFire?.type === 'weather-alert' ? selectedFire.id : null}
              onSelectAlert={onSelectAlert}
            />
          ))}
      </div>
    </div>
  );
}
