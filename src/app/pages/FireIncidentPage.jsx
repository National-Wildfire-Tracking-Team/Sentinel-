/**
 * FireIncidentPage.jsx
 * Standalone, shareable overview for a single wildfire incident — a real,
 * crawlable URL (/fire/:id) built entirely from data the live tracker
 * already fetches (IRWIN/WFIGS + CAL FIRE incident feeds). No new backend
 * or data source; this just gives each active fire its own indexable page
 * instead of only existing as in-memory state on the full map.
 *
 * The `id` matches the id used by the live tracker's existing
 * "?incident=<id>" deep-link mechanism (see LiveTrackerPage's shared-link
 * effect), so "View live on the map" round-trips into the same fire there.
 */

import { Link, useParams } from 'react-router-dom';
import {
  Flame, MapPin, Users, Home, Calendar, Clock, ArrowLeft, ExternalLink,
  ShieldAlert, Info, Map as MapIcon,
} from 'lucide-react';

import Seo from '../../shared/components/Seo';
import { getMainOrigin } from '../../shared/utils/getAppOrigin';
import { useIncidents } from '../hooks/useIncidents';
import { useCalFireIncidents } from '../hooks/useCalFireIncidents';
import { mergeIrwinAndCalFireIncidents } from '../utils/mergeIncidents';
import { incidentIdsFor } from '../utils/incidentAliases';
import {
  formatAcres, formatContainment, formatPersonnel, formatDate,
  formatDateTime, formatRelativeTime,
} from '../utils/formatUtils';
import { containmentToColor } from '../utils/colorUtils';

function StatTile({ label, value, icon: Icon, color }) {
  return (
    <div className="flex flex-col gap-1 p-4 bg-sentinel-800/60 rounded-xl border border-sentinel-700">
      <div className="flex items-center gap-1.5 text-sentinel-400 text-[11px] font-bold uppercase tracking-wider">
        {Icon && <Icon size={12} />}
        {label}
      </div>
      <div className={`text-xl font-bold ${color || 'text-white'}`}>{value}</div>
    </div>
  );
}

function PageChrome({ children }) {
  return (
    <div className="min-h-screen bg-sentinel-900 text-white">
      <div className="border-b border-sentinel-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-2">
          <Flame size={20} className="text-fire-600" />
          <span className="font-bold tracking-tight">Sentinel</span>
          <span className="text-sentinel-500 text-xs">by the National Wildfire Tracking Team</span>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">{children}</div>
    </div>
  );
}

export default function FireIncidentPage() {
  const { id } = useParams();

  const { incidents, loading: incidentsLoading } = useIncidents(0.1, true);
  const { incidents: calFireIncidents, loading: calFireLoading } = useCalFireIncidents(true, true);
  const loading = incidentsLoading || calFireLoading;

  const merged = mergeIrwinAndCalFireIncidents(incidents, calFireIncidents);
  const fire = merged.find((inc) => incidentIdsFor(inc).includes(id));

  if (!loading && !fire) {
    return (
      <PageChrome>
        <Seo
          title="Fire Not Found | Sentinel"
          description="This wildfire is not currently listed among actively tracked incidents on Sentinel."
          path={`/fire/${id}`}
          noindex
        />
        <div className="text-center py-16">
          <Info size={32} className="text-sentinel-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Fire Not Currently Tracked</h1>
          <p className="text-sentinel-400 max-w-md mx-auto mb-8">
            This incident isn't in Sentinel's active feed right now — it may have been fully
            contained and removed from the current-incidents list, or the link may be out of date.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-fire-600 text-white font-semibold hover:bg-fire-500 transition-colors"
          >
            <MapIcon size={16} />
            View All Active Fires
          </Link>
        </div>
      </PageChrome>
    );
  }

  if (loading) {
    return (
      <PageChrome>
        <div className="min-h-[40vh] flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" aria-label="Loading" />
        </div>
      </PageChrome>
    );
  }

  const containment = Number(fire.contained) || 0;
  const containColor = containmentToColor(containment);
  const isActive = containment < 100 && (fire.status ?? '').toLowerCase() !== 'controlled';
  const isCalFire = fire.source === 'CAL_FIRE';
  const dataSourceLabel = isCalFire ? 'CAL FIRE (fire.ca.gov)' : 'NIFC / IRWIN (WFIGS)';
  const locationLine = fire.location_description
    || [fire.county && `${fire.county} County`, fire.state].filter(Boolean).join(', ');

  const title = `${fire.name} | ${fire.state} | Sentinel`;
  const description = `${fire.name} in ${locationLine || fire.state}: ${formatAcres(fire.acres)} acres, ` +
    `${formatContainment(containment)} contained as of ${formatRelativeTime(fire.updated)}. ` +
    `Live wildfire tracking data from the National Wildfire Tracking Team.`;

  return (
    <PageChrome>
      <Seo title={title} description={description} path={`/fire/${id}`} />

      <Link to="/" className="inline-flex items-center gap-1.5 text-sentinel-400 hover:text-fire-400 text-sm mb-6 transition-colors">
        <ArrowLeft size={14} />
        Back to live map
      </Link>

      {/* ── Title block ── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${isActive ? 'bg-red-950/50 text-red-400 border border-red-800/60' : 'bg-emerald-950/50 text-emerald-400 border border-emerald-800/60'}`}>
            {isActive ? 'Active' : 'Controlled'}
          </span>
          {fire.updated && (
            <span className="text-xs text-sentinel-400">
              Updated {formatRelativeTime(fire.updated)}
            </span>
          )}
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight">{fire.name}</h1>
        {locationLine && (
          <p className="text-sentinel-300 mt-2 flex items-center gap-1.5">
            <MapPin size={14} className="text-sentinel-500" />
            {locationLine}
          </p>
        )}
      </div>

      {/* ── Stat grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatTile label="Acres" value={formatAcres(fire.acres)} icon={Flame} color="text-orange-400" />
        <StatTile label="Containment" value={formatContainment(containment)} />
        {fire.personnel > 0 && (
          <StatTile label="Personnel" value={formatPersonnel(fire.personnel)} icon={Users} />
        )}
        {fire.structures_destroyed > 0 && (
          <StatTile label="Structures Destroyed" value={fire.structures_destroyed} icon={Home} color="text-red-400" />
        )}
        {fire.structures_damaged > 0 && (
          <StatTile label="Structures Damaged" value={fire.structures_damaged} icon={Home} color="text-orange-400" />
        )}
      </div>

      {/* Containment bar */}
      <div className="mb-8 h-2 w-full bg-sentinel-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${containment}%`, backgroundColor: containColor }}
        />
      </div>

      {(fire.evacuation_orders > 0 || fire.evacuation_warnings > 0) && (
        <div className="mb-8 p-4 bg-red-950/40 border border-red-800/60 rounded-xl flex items-start gap-3">
          <ShieldAlert size={18} className="text-red-400 shrink-0 mt-0.5" />
          <div className="text-sm text-red-200">
            <p className="font-semibold">
              {fire.evacuation_orders > 0 ? 'Evacuation orders are in effect for this fire.' : 'Evacuation warnings are in effect for this fire.'}
            </p>
            <p className="text-red-200/80 mt-1">
              Verify current evacuation zones and instructions with your local emergency management agency —
              Sentinel is not an official emergency notification source.
            </p>
          </div>
        </div>
      )}

      {/* ── Details ── */}
      <div className="space-y-3 text-sm text-sentinel-300 mb-8">
        {fire.started && (
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-sentinel-500 shrink-0" />
            <span>Discovered {formatDate(fire.started)}</span>
          </div>
        )}
        {fire.updated && (
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-sentinel-500 shrink-0" />
            <span>Last data update: {formatDateTime(fire.updated)}</span>
          </div>
        )}
        {fire.cause && (
          <div className="flex items-center gap-2">
            <Info size={14} className="text-sentinel-500 shrink-0" />
            <span>Cause: {fire.cause}</span>
          </div>
        )}
      </div>

      {/* ── Source + CTAs ── */}
      <div className="p-5 rounded-2xl bg-sentinel-800/60 border border-sentinel-700 mb-8">
        <p className="text-sentinel-400 text-xs mb-4">
          Data source: <span className="text-sentinel-200 font-medium">{dataSourceLabel}</span>. Perimeter and
          containment figures update as source agencies publish them and may lag real conditions —
          see Sentinel's{' '}
          <a href={`${getMainOrigin()}/about#data-methodology`} className="text-fire-400 hover:text-fire-300 underline">
            data sources &amp; methodology
          </a>.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to={`/?incident=${encodeURIComponent(fire.id)}`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-fire-600 text-white text-sm font-semibold hover:bg-fire-500 transition-colors"
          >
            <MapIcon size={15} />
            View Live on the Map
          </Link>
          {fire.url && (
            <a
              href={fire.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sentinel-700 text-white text-sm font-semibold border border-sentinel-600 hover:bg-sentinel-600 transition-colors"
            >
              <ExternalLink size={15} />
              {isCalFire ? 'View on fire.ca.gov' : 'View Official Source'}
            </a>
          )}
        </div>
      </div>
    </PageChrome>
  );
}
