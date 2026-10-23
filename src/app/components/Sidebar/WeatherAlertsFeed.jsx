/**
 * WeatherAlertsFeed.jsx
 * Live active NOAA/NWS alerts feed — grouped by category and event type.
 * Cards sit on a neutral surface and carry the official NWS event color as
 * an accent stripe, so a long list of warnings reads as a list rather than
 * a wall of red.
 */

import { useMemo, useState, useCallback } from 'react';
import {
  Loader2,
  AlertCircle,
  CloudSun,
  ChevronDown,
  ChevronRight,
  MapPinOff,
  Clock,
  Users,
  Building2,
  X,
} from 'lucide-react';
import { nwsAlertColor, nwsAlertCategory } from '../../utils/nwsColors';
import { useApp } from '../../context/AppContext';
import { useAppStatus } from '../../context/AppStatusContext';
import { useViewport } from '../../context/ViewportContext';
import { formatRelativeTime, formatClockTime } from '../../utils/formatUtils';
import AlertErrorBanner from './AlertErrorBanner';

/**
 * Per-category accent — used for the filter chips and section headers. The
 * cards themselves use the per-event NWS color instead.
 */
const CATEGORY_ACCENT = {
  warning:   { dot: 'bg-red-500',      text: 'text-red-300' },
  watch:     { dot: 'bg-orange-400',   text: 'text-orange-300' },
  advisory:  { dot: 'bg-yellow-400',   text: 'text-yellow-200' },
  statement: { dot: 'bg-sky-400',      text: 'text-sky-300' },
  eas:       { dot: 'bg-purple-400',   text: 'text-purple-300' },
  other:     { dot: 'bg-sentinel-400', text: 'text-sentinel-300' },
};

const SEVERITY_BADGE = {
  Extreme: 'bg-red-500/15 text-red-300 ring-red-500/30',
  Severe:  'bg-orange-500/15 text-orange-300 ring-orange-500/30',
};

const EXPIRING_SOON_MS = 30 * 60 * 1000;

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

/** "NWS Sacramento CA" → kept as-is; falls back to the 4-letter office code. */
function issuerLabel(alert) {
  if (alert.senderName) return alert.senderName;
  const office = issuingOfficeCode(alert);
  if (office) return office;
  return alert.source === 'fema' ? 'FEMA IPAWS' : null;
}

/** Areas are "A; B; C" — collapse to the first few plus a "+N more" tail. */
function summarizeArea(area, max = 3) {
  if (!area) return null;
  const parts = String(area).split(/;\s*/).filter(Boolean);
  if (parts.length <= max) return parts.join(' · ');
  return `${parts.slice(0, max).join(' · ')} +${parts.length - max} more`;
}

/** { label, tone } for the expiration line — tone drives color. */
function expiryInfo(expires) {
  if (!expires) return null;
  const t = new Date(expires).getTime();
  if (Number.isNaN(t)) return null;
  const diff = t - Date.now();
  if (diff <= 0) return { label: `Expired ${formatRelativeTime(expires)}`, tone: 'text-sentinel-400' };
  if (diff < EXPIRING_SOON_MS) return { label: `Ends ${formatRelativeTime(expires)}`, tone: 'text-orange-300' };
  return { label: `Ends ${formatRelativeTime(expires)}`, tone: 'text-sentinel-300' };
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

function CountBadge({ children }) {
  return (
    <span className="shrink-0 px-1.5 py-px rounded-md text-[11px] font-semibold tabular-nums text-sentinel-200 bg-sentinel-700/80 min-w-[1.5rem] text-center">
      {children}
    </span>
  );
}

function SeverityBadge({ severity }) {
  const cls = SEVERITY_BADGE[severity];
  if (!cls) return null;
  return (
    <span className={`px-1.5 py-px rounded text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${cls}`}>
      {severity}
    </span>
  );
}

function DetailRow({ label, children }) {
  if (!children) return null;
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-sentinel-400">{label}</dt>
      <dd className="text-xs text-sentinel-100 mt-0.5 truncate">{children}</dd>
    </div>
  );
}

function SelectedAlertBanner({ alert, onClear }) {
  const color = nwsAlertColor(alert.type);
  const pop = firstPopulation(alert.parameters);
  const state = firstStateCode(alert.geocodes || alert.geocode?.UGC);
  const issuer = issuerLabel(alert);
  const expiry = expiryInfo(alert.expires);
  const area = summarizeArea(alert.affectedArea, 6);

  return (
    <div className="mx-2 mb-3 rounded-xl overflow-hidden border border-sentinel-600 bg-sentinel-800 shadow-lg shadow-black/30">
      <div className="h-1" style={{ backgroundColor: color }} />
      <div className="px-3.5 pt-3 pb-3.5">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-sm font-semibold text-sentinel-100">{alert.type}</span>
              <SeverityBadge severity={alert.severity} />
            </div>
            {area && <p className="text-xs text-sentinel-300 mt-1.5 leading-relaxed line-clamp-3">{area}</p>}
          </div>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              aria-label="Back to list"
              title="Back to list"
              className="shrink-0 -mr-1 -mt-0.5 p-1.5 rounded-md text-sentinel-400 hover:text-sentinel-100 hover:bg-white/10 transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {alert.headline && (
          <p className="text-xs text-sentinel-200 mt-2.5 leading-relaxed line-clamp-4">{alert.headline}</p>
        )}

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 mt-3 pt-3 border-t border-sentinel-700">
          <DetailRow label="Ends">
            {alert.expires && (
              <span className={expiry?.tone}>
                {formatClockTime(alert.expires)}
              </span>
            )}
          </DetailRow>
          <DetailRow label="Urgency">{alert.urgency && alert.urgency !== 'Unknown' ? alert.urgency : null}</DetailRow>
          <DetailRow label="Issued by">{issuer}</DetailRow>
          <DetailRow label="Action">{alert.response && alert.response !== 'None' ? alert.response : null}</DetailRow>
          <DetailRow label="Population">{pop != null ? pop.toLocaleString() : null}</DetailRow>
          <DetailRow label="State">{state}</DetailRow>
        </dl>
      </div>
    </div>
  );
}

function AlertTypeRow({
  eventType,
  count,
  alertsInType,
  expanded,
  onToggle,
  accentColor,
  selectedId,
  onSelectAlert,
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="group w-full flex items-center gap-2.5 py-2 pl-2 pr-1.5 rounded-lg hover:bg-white/[0.05] transition-colors text-left min-h-[40px]"
      >
        <span
          className="w-1 self-stretch min-h-[20px] rounded-full shrink-0"
          style={{ backgroundColor: accentColor }}
        />
        <span className="flex-1 min-w-0 text-[13px] font-medium leading-snug text-sentinel-100 line-clamp-2">
          {eventType}
        </span>
        <CountBadge>{count}</CountBadge>
        <ChevronRight
          size={15}
          className={`shrink-0 text-sentinel-400 group-hover:text-sentinel-200 transition-transform duration-150 ${
            expanded ? 'rotate-90' : ''
          }`}
        />
      </button>

      {expanded && (
        <div className="pl-3.5 pr-0.5 pt-1 pb-2 space-y-1.5">
          {alertsInType.map((alert) => (
            <CompactAlertCard
              key={alert.id}
              alert={alert}
              accentColor={accentColor}
              selected={selectedId === alert.id}
              onSelect={() => onSelectAlert(alert)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CompactAlertCard({ alert, accentColor, selected, onSelect }) {
  const pop = firstPopulation(alert.parameters);
  const state = firstStateCode(alert.geocodes || alert.geocode?.UGC);
  const issuer = issuerLabel(alert);
  const expiry = expiryInfo(alert.expires);
  const area = summarizeArea(alert.affectedArea);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{ borderLeftColor: accentColor }}
      className={`w-full text-left rounded-lg border border-l-[3px] px-3 py-2.5 transition-colors ${
        selected
          ? 'bg-sentinel-700/70 border-sky-400/60 ring-1 ring-sky-400/40'
          : 'bg-sentinel-800/60 border-sentinel-700 hover:bg-sentinel-700/50 hover:border-sentinel-600'
      }`}
    >
      <div className="flex items-start gap-2">
        <p className="flex-1 min-w-0 text-[13px] font-medium leading-snug text-sentinel-100 line-clamp-2">
          {area || alert.headline || alert.type}
        </p>
        <SeverityBadge severity={alert.severity} />
      </div>

      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11px] text-sentinel-400">
        {expiry && (
          <span className={`inline-flex items-center gap-1 ${expiry.tone}`}>
            <Clock size={11} />
            {expiry.label}
          </span>
        )}
        {(issuer || state) && (
          <span className="inline-flex items-center gap-1 min-w-0">
            <Building2 size={11} className="shrink-0" />
            <span className="truncate">{issuer || state}</span>
          </span>
        )}
        {pop != null && (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Users size={11} />
            {pop.toLocaleString()}
          </span>
        )}
      </div>

      {(alert.response && alert.response !== 'None') || !alert.geometry || alert.source === 'fema' ? (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {alert.response && alert.response !== 'None' && (
            <span className="px-1.5 py-px rounded text-[10px] font-semibold bg-sentinel-700 text-sentinel-100">
              {alert.response}
            </span>
          )}
          {!alert.geometry && (
            <span className="inline-flex items-center gap-1 px-1.5 py-px rounded text-[10px] font-medium bg-sentinel-700/70 text-sentinel-300">
              <MapPinOff size={10} />
              Not on map
            </span>
          )}
          {alert.source === 'fema' && (
            <span className="px-1.5 py-px rounded text-[10px] font-semibold bg-purple-500/15 text-purple-300 ring-1 ring-inset ring-purple-500/30">
              FEMA
            </span>
          )}
        </div>
      ) : null}
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
  const accent = CATEGORY_ACCENT[categoryKey] || CATEGORY_ACCENT.other;

  return (
    <section className="mb-1">
      <button
        type="button"
        onClick={() => onToggleCategory(categoryKey)}
        aria-expanded={open}
        className="sticky top-0 z-10 w-full flex items-center gap-2 py-2 px-2 bg-sentinel-900/95 backdrop-blur-sm hover:bg-sentinel-800/95 transition-colors"
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${accent.dot}`} />
        <span className={`flex-1 text-left text-[11px] font-bold uppercase tracking-[0.08em] ${accent.text}`}>
          {categoryLabel(categoryKey)}
        </span>
        <CountBadge>{total}</CountBadge>
        {open ? (
          <ChevronDown size={15} className="shrink-0 text-sentinel-400" />
        ) : (
          <ChevronRight size={15} className="shrink-0 text-sentinel-400" />
        )}
      </button>

      {open && (
        <div className="px-1 pb-1">
          {byType.map(([eventType, list]) => (
            <AlertTypeRow
              key={eventType}
              eventType={eventType}
              count={list.length}
              alertsInType={list}
              expanded={expandedTypes.has(eventType)}
              onToggle={() => toggleType(eventType)}
              accentColor={nwsAlertColor(eventType)}
              selectedId={selectedId}
              onSelectAlert={onSelectAlert}
            />
          ))}
        </div>
      )}
    </section>
  );
}

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'warning', label: 'Warnings' },
  { key: 'watch', label: 'Watches' },
  { key: 'advisory', label: 'Advisories' },
  { key: 'statement', label: 'Statements' },
];

export default function WeatherAlertsFeed({
  alerts = [],
  loading,
  error,
  activeFilter = 'all',
  onFilterChange,
  onRefresh,
}) {
  const { selectFire, selectedFire, clearSelected } = useApp();
  const { alertsStatus } = useAppStatus();
  const { setViewport } = useViewport();

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
    <div className="flex flex-col h-full antialiased">
      <div className="px-2 pt-2 pb-2 shrink-0 border-b border-sentinel-700/60">
        <div className="flex gap-1 overflow-x-auto scrollbar-none" role="tablist" aria-label="Alert category">
          {FILTER_OPTIONS.map(({ key, label }) => {
            const isActive = activeFilter === key;
            const count = counts[key] ?? 0;
            const accent = CATEGORY_ACCENT[key];
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onFilterChange?.(key)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-sentinel-700 text-sentinel-100 shadow-sm ring-1 ring-inset ring-sentinel-500/60'
                    : 'text-sentinel-400 hover:text-sentinel-200 hover:bg-sentinel-800'
                } ${count === 0 && !isActive ? 'opacity-50' : ''}`}
              >
                {accent && <span className={`w-1.5 h-1.5 rounded-full ${accent.dot}`} />}
                {label}
                <span className={`tabular-nums ${isActive ? 'text-sentinel-300' : 'text-sentinel-500'}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden pb-3 scrollbar-visible">
        <div className="pt-2">
          <AlertErrorBanner
            error={alertsStatus?.error || error}
            detail={alertsStatus?.errorDetail}
            staleCount={alerts.length}
            onRetry={onRefresh}
          />
        </div>

        {loading && filtered.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-10 text-sentinel-300">
            <Loader2 size={16} className="animate-spin" />
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
          <div className="text-center py-10 text-sentinel-400 text-sm flex flex-col items-center gap-2">
            <CloudSun size={22} className="text-sentinel-500" />
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
