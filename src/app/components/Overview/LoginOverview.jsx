/**
 * LoginOverview.jsx
 * A calm first look right after login: summary cards (active fires,
 * evacuation zones, NWS warnings), whether the user's Home area is affected,
 * and a few quick filters — docked at the top of the live map so the map
 * stays visible below it instead of greeting the user all at once.
 *
 * Shown once per login (LoginPage passes { overview: true } in router state);
 * the X, Escape, "Open the map" or any quick filter closes it.
 */

import { useEffect, useRef } from 'react';
import {
  AlertTriangle, CloudLightning, Flame, Home, Loader2, ShieldAlert, ShieldCheck, X,
} from 'lucide-react';
import { AREA_STATUS, QUICK_FILTERS } from '../../utils/overviewSummary';
import { usePanelDrag } from '../Map/usePopupDrag';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function StatCard({ icon: Icon, iconClass, label, value, loading }) {
  return (
    <div className="rounded-xl border border-sentinel-200 dark:border-sentinel-700 bg-sentinel-100/60 dark:bg-sentinel-800/70 px-3 py-2.5 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-medium text-sentinel-600 dark:text-sentinel-300">
        <Icon size={13} className={`shrink-0 ${iconClass}`} aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-sentinel-900 dark:text-white">
        {loading ? <Loader2 size={20} className="animate-spin text-sentinel-400" aria-label="Loading" /> : value}
      </div>
    </div>
  );
}

function areaDetails(area) {
  const parts = [];
  if (area.fireCount) parts.push(plural(area.fireCount, 'active fire'));
  if (area.evacZoneCount) parts.push(plural(area.evacZoneCount, 'evacuation zone'));
  if (area.alertCount) parts.push(plural(area.alertCount, 'weather alert'));
  return parts.join(' · ');
}

function AreaCard({ area, home, loading, onSetUpHome }) {
  if (area.status === AREA_STATUS.unknown) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-sentinel-300 dark:border-sentinel-600 px-3 py-2.5">
        <Home size={18} className="shrink-0 text-fire-500" aria-hidden />
        <p className="flex-1 text-sm text-sentinel-700 dark:text-sentinel-200">
          Set up Home to see whether fires or alerts reach your area.
        </p>
        <button
          type="button"
          onClick={onSetUpHome}
          className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/40"
        >
          Set up Home
        </button>
      </div>
    );
  }

  const place = `${home.radiusMiles} mi of ${home.label || 'Home'}`;
  let tone = 'border-emerald-300 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200';
  let Icon = ShieldCheck;
  let title = 'Your area is clear';
  let detail = `No active fires, evacuation zones or weather alerts within ${place}.`;
  if (loading) {
    tone = 'border-sentinel-200 dark:border-sentinel-700 text-sentinel-700 dark:text-sentinel-200';
    Icon = Loader2;
    title = 'Checking your area…';
    detail = `Looking within ${place}.`;
  } else if (area.status === AREA_STATUS.affected) {
    tone = 'border-red-300 dark:border-red-800/70 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200';
    Icon = ShieldAlert;
    title = 'Your area is affected';
    detail = `${areaDetails(area)} within ${place}.`;
  } else if (area.status === AREA_STATUS.alerts) {
    tone = 'border-amber-300 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200';
    Icon = AlertTriangle;
    title = 'Alerts in your area';
    detail = `${areaDetails(area)} within ${place}.`;
  }

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${tone}`} data-area-status={loading ? 'loading' : area.status}>
      <Icon size={18} className={`shrink-0 mt-0.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs sm:text-sm opacity-90">{detail}</p>
      </div>
    </div>
  );
}

export default function LoginOverview({ summary, home, loading, onClose, onQuickFilter, onSetUpHome }) {
  const openMapRef = useRef(null);
  // Popup Draggability: the card can be dragged aside by any part of it.
  const drag = usePanelDrag('login-overview');

  useEffect(() => {
    openMapRef.current?.focus();
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const filters = [
    { key: QUICK_FILTERS.activeFires, label: 'Active fires' },
    { key: QUICK_FILTERS.allFires, label: 'All fires' },
    { key: QUICK_FILTERS.allHazards, label: 'All hazards' },
    ...(home ? [{ key: QUICK_FILTERS.myArea, label: 'My area' }] : []),
  ];

  return (
    <div className="absolute inset-x-0 top-0 z-[250] flex justify-center p-2 sm:p-4 pointer-events-none">
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby="login-overview-title"
        {...drag.dragProps}
        style={{ translate: drag.translate }}
        className={`${drag.dragClass} pointer-events-auto relative w-full max-w-3xl max-h-[calc(100%-5rem)] overflow-y-auto rounded-2xl border border-sentinel-200 dark:border-sentinel-600 bg-white/95 dark:bg-sentinel-900/95 backdrop-blur shadow-2xl p-4 sm:p-5 animate-fade-in motion-reduce:animate-none`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close overview"
          className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center rounded-full text-sentinel-500 dark:text-sentinel-300 hover:text-sentinel-900 dark:hover:text-white hover:bg-sentinel-100 dark:hover:bg-sentinel-700 active:scale-95 transition"
        >
          <X size={20} />
        </button>

        <h2 id="login-overview-title" className="pr-12 text-xl font-bold tracking-tight text-sentinel-900 dark:text-white">
          Overview
        </h2>
        <p className="text-sm text-sentinel-600 dark:text-sentinel-300">What&apos;s happening right now.</p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <StatCard icon={Flame} iconClass="text-fire-500" label="Active fires" value={summary.activeFireCount} loading={loading} />
          <StatCard icon={AlertTriangle} iconClass="text-red-500" label="Evacuation zones" value={summary.evacZoneCount} loading={loading} />
          <StatCard icon={CloudLightning} iconClass="text-amber-500" label="Weather warnings" value={summary.warningCount} loading={loading} />
        </div>

        <div className="mt-2">
          <AreaCard area={summary.area} home={home} loading={loading} onSetUpHome={onSetUpHome} />
        </div>

        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-sentinel-500 dark:text-sentinel-400">Quick filters</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {filters.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => onQuickFilter(key)}
                className="rounded-full border border-sentinel-300 dark:border-sentinel-600 px-3.5 py-1.5 text-sm font-medium text-sentinel-800 dark:text-sentinel-100 hover:bg-sentinel-100 dark:hover:bg-sentinel-800 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button
          ref={openMapRef}
          type="button"
          onClick={onClose}
          className="btn-glass-fire btn-glass-fire-adaptive mt-4 w-full rounded-xl px-4 py-2.5 text-base font-semibold"
        >
          Open the map
        </button>
      </section>
    </div>
  );
}
