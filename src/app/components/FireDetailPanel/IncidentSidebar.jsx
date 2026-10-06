/**
 * IncidentSidebar.jsx
 * Incident detail for wildfire incidents (official feeds and NWTT reporter
 * reports): status, location, size, current situation, evacuations, then
 * Updates / Shelters / Info tabs, with Share and Follow pinned at the bottom.
 * Docked right over the map on desktop; a draggable bottom sheet on mobile.
 */

import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useIncidentUpdates } from '../../hooks/useIncidentUpdates';
import { useIncidentEvacuations, useIncidentFollow, useIncidentShelters } from '../../hooks/useIncidentDetails';
import {
  formatAcres, formatDateTime, formatPersonnel, formatRelativeTime,
} from '../../utils/formatUtils';
import IncidentTimeline from '../IncidentTimeline/IncidentTimeline';
import ModelForecastSummary from '../WeatherModels/ModelForecastSummary';
import { buildEvacuations, deriveSituation, incidentSummary } from './incidentDetailModel';
import {
  EvacuationCard, EvacuationNotes, InfoGroup, ShareFollowFooter, SheetHandle, ShelterList, TabButton,
  infoLink,
} from './sidebarParts';
import { useBottomSheet, useEscapeToClose, useIsDesktop, useNow } from './useSidebar';

// ─── Pieces ──────────────────────────────────────────────────────────────────

const SITUATION_TONE_CLASS = {
  red: 'text-red-400',
  amber: 'text-amber-400',
  orange: 'text-orange-400',
};

function InfoTab({ fire, summary, updatedAt }) {
  const hasCoords = Number.isFinite(fire.lat) && Number.isFinite(fire.lng);
  return (
    <>
      <InfoGroup
        title="Incident"
        rows={[
          ['Name', summary.name],
          ['Status', summary.statusLabel],
          [summary.isReport ? 'Submitted' : 'Started', summary.createdAt && formatDateTime(summary.createdAt)],
          ['Last updated', updatedAt && formatDateTime(updatedAt)],
          ['Discovered', fire.discovered && formatDateTime(fire.discovered)],
          ['Cause', fire.cause],
          ['Initial report', summary.notes],
        ]}
      />
      <InfoGroup
        title="Location"
        rows={[
          ['Address', summary.rawAddress],
          ['County', summary.county],
          ['State', summary.state],
          ['Jurisdiction', summary.jurisdiction],
          ['Coordinates', hasCoords && `${fire.lat.toFixed(4)}°, ${fire.lng.toFixed(4)}°`],
        ]}
      />
      <InfoGroup
        title="Fire"
        rows={[
          ['Size', summary.acres != null && formatAcres(summary.acres)],
          ['Containment', summary.containment != null && `${summary.containment}%`],
          ['Structures destroyed', fire.destroyed > 0 && String(fire.destroyed)],
          ['Structures damaged', fire.damaged > 0 && String(fire.damaged)],
        ]}
      />
      <InfoGroup
        title="Resources"
        rows={[
          ['Personnel', fire.personnel && formatPersonnel(fire.personnel)],
          ['Management', fire.orgType && `${fire.orgType} Incident Management`],
        ]}
      />
      <InfoGroup
        title="Source"
        rows={[
          ['Data source', summary.isReport ? 'NWTT reporter' : summary.sourceLabel],
          ['Note', summary.isReport && 'Submitted by an NWTT reporter. Verify with official sources before taking action.'],
          ['Incident page', !summary.isReport && fire.id && (
            <Link to={`/fire/${fire.id}`} className={infoLink}>Open full incident page</Link>
          )],
          ['Official page', fire.url && (
            <a href={fire.url} target="_blank" rel="noopener noreferrer" className={infoLink}>
              {fire.source === 'CAL_FIRE' ? 'fire.ca.gov' : 'InciWeb'}
            </a>
          )],
        ]}
      />
      {hasCoords && (
        <section className="px-5 pt-4">
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-sentinel-200">Weather</h3>
          <ModelForecastSummary lat={fire.lat} lon={fire.lng} place={summary.name} />
        </section>
      )}
    </>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

/**
 * @param {object}   fire        selectedFire ({ type: 'incident' | 'user-report' | 'perimeter', ... })
 * @param {Function} onClose
 * @param {Function} onShare
 * @param {string}   shareStatus Transient share feedback ("Link copied")
 */
export default function IncidentSidebar({ fire, onClose, onShare, shareStatus }) {
  useNow(30_000);

  const summary = incidentSummary(fire);
  // Data stored under any id this fire is known by (utils/incidentAliases.js).
  const feed = useIncidentUpdates(fire.id, fire.aliasIds);
  const evacuationRows = useIncidentEvacuations(fire.id, fire.aliasIds);
  const shelters = useIncidentShelters(fire.id, fire.aliasIds);
  const follow = useIncidentFollow(fire.id, summary.name, fire.aliasIds);

  const evacuations = buildEvacuations(evacuationRows, fire);
  const situation = deriveSituation(feed.updates, evacuations);
  const hasFresh = feed.freshIds.size > 0;
  const latestUpdateAt = feed.updates[0]?.created_at;
  const updatedAt = [summary.updatedAt, latestUpdateAt]
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0];

  // ── Tabs ──
  const [tab, setTab] = useState('updates');
  const [seenInsertAt, setSeenInsertAt] = useState(0);
  const activeTab = tab === 'shelters' && shelters.length === 0 ? 'updates' : tab;
  const hasUnseenUpdates = activeTab !== 'updates' && feed.lastInsertAt > seenInsertAt;
  const scrollRef = useRef(null);
  const tabsAnchorRef = useRef(null);
  const isDesktop = useIsDesktop();
  const sheetRef = useRef(null);
  const handleRef = useRef(null);
  const peekRef = useRef(null);
  const footerRef = useRef(null);
  const sheet = useBottomSheet({
    enabled: !isDesktop, onClose, scrollRef, sheetRef, handleRef, peekRef, footerRef,
  });
  const peeking = !isDesktop && !sheet.expanded;

  const selectTab = useCallback((next) => {
    if (activeTab === 'updates' || next === 'updates') setSeenInsertAt(feed.lastInsertAt);
    setTab(next);
    // Once the tabs have stuck to the top, show the new tab from its start.
    const scroller = scrollRef.current;
    const anchor = tabsAnchorRef.current;
    if (scroller && anchor && scroller.scrollTop > anchor.offsetTop) scroller.scrollTop = anchor.offsetTop;
  }, [activeTab, feed.lastInsertAt]);

  useEscapeToClose(onClose);

  // Briefly tint the values a live update may have changed.
  const tint = (base) => `transition-colors duration-1000 ${hasFresh ? 'text-fire-400' : base}`;
  const createdLabel = summary.createdAt ? formatDateTime(summary.createdAt) : null;
  const hasEvacCards = evacuations && (evacuations.order || evacuations.warning || evacuations.notes || evacuations.links.length > 0);
  const relative = updatedAt ? formatRelativeTime(updatedAt) : null;

  return (
    <aside
      ref={sheetRef}
      aria-label={`${summary.name} incident details`}
      style={isDesktop ? undefined : { height: sheet.height }}
      className={`z-30 flex flex-col overflow-hidden border-sentinel-500 bg-sentinel-800 text-slate-100 shadow-2xl
        ${isDesktop
          ? 'absolute right-4 top-[68px] bottom-4 w-[440px] max-w-[calc(100%-2rem)] rounded-2xl border animate-slide-in-right'
          : `fixed inset-x-0 bottom-0 rounded-t-2xl border-t animate-slide-up-panel
             ${sheet.dragging ? '' : 'transition-[height] duration-300 ease-out'}`}`}
    >
      {!isDesktop && <SheetHandle ref={handleRef} sheet={sheet} label="incident details" />}

      <div
        ref={scrollRef}
        className={`relative flex-1 overscroll-contain ${peeking ? 'overflow-hidden' : 'overflow-y-auto'}`}
      >
        {/* Peek region: header through evacuations (the mobile sheet's collapsed view). */}
        <div
          ref={peekRef}
          {...(peeking ? sheet.dragProps : {})}
          className={peeking ? 'touch-none' : ''}
        >
        {/* ── Header ── */}
        <header className={`relative px-5 ${isDesktop ? 'pt-5' : 'pt-1'}`}>
          <h2 className={`text-[26px] font-bold leading-tight text-white ${isDesktop ? 'pr-12' : ''}`}>{summary.name}</h2>
          {isDesktop && (
            <button
              type="button"
              onClick={onClose}
              className="absolute right-2 top-3 w-11 h-11 inline-flex items-center justify-center rounded-lg
                         text-sentinel-200 hover:text-white hover:bg-sentinel-700 transition-colors"
              aria-label="Close incident details"
            >
              <X size={18} />
            </button>
          )}
          <p className="mt-1.5 flex items-center gap-2 text-sm">
            <span
              className={`h-2 w-2 rounded-full ${summary.isActive ? 'bg-red-400 ring-4 ring-red-400/20' : 'bg-emerald-400'}`}
              aria-hidden
            />
            <span className={`font-semibold ${summary.isActive ? 'text-red-400' : 'text-emerald-400'}`}>
              {summary.statusLabel}
            </span>
            {relative && (
              <>
                <span className="text-sentinel-200" aria-hidden>·</span>
                <span className={tint('text-sentinel-200')}>
                  Updated {relative === 'Just now' ? 'just now' : relative}
                </span>
              </>
            )}
          </p>

          {(summary.street || summary.locality) && (
            <address className="mt-4 not-italic text-sm leading-relaxed text-sentinel-100">
              {summary.street && <span className="block">{summary.street}</span>}
              {summary.locality && <span className="block">{summary.locality}</span>}
            </address>
          )}

          <dl className="mt-5 flex gap-10">
            <div>
              <dt className="text-[13px] text-sentinel-200">Acres</dt>
              <dd className={`text-[28px] font-semibold leading-tight tabular-nums ${tint('text-white')}`}>
                {summary.acres != null ? summary.acres.toLocaleString('en-US', { maximumFractionDigits: 1 }) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[13px] text-sentinel-200">Containment</dt>
              <dd className="text-[28px] font-semibold leading-tight tabular-nums text-white">
                {summary.containment != null ? `${summary.containment}%` : '—'}
              </dd>
            </div>
          </dl>

          <p className="mt-4 pb-5 text-[13px] text-sentinel-200">
            {summary.sourceVerb} <span className="font-semibold text-sentinel-100">{summary.sourceLabel}</span>
            {createdLabel && <> · {createdLabel}</>}
          </p>
        </header>

        {/* ── Situation + evacuations ── */}
        {(situation || hasEvacCards) && (
          <section className="mx-5 border-t border-sentinel-700 pt-5 pb-6" aria-label="Current situation">
            {situation && (
              <p className={`text-[17px] font-semibold leading-snug ${SITUATION_TONE_CLASS[situation.tone]}`}>
                {situation.text}
              </p>
            )}
            {hasEvacCards && (
              <div className={`space-y-2.5 ${situation ? 'mt-3.5' : ''}`}>
                {evacuations.order && <EvacuationCard level="order" data={evacuations.order} />}
                {evacuations.warning && <EvacuationCard level="warning" data={evacuations.warning} />}
                <EvacuationNotes notes={evacuations.notes} links={evacuations.links} />
              </div>
            )}
          </section>
        )}
        </div>

        {/* ── Tabs ── */}
        <div ref={tabsAnchorRef} aria-hidden />
        <div
          role="tablist"
          aria-label="Incident sections"
          className="sticky top-0 z-10 flex gap-7 px-5 border-b border-sentinel-700 bg-sentinel-800"
        >
          <TabButton id="incident-tab-updates" panelId="incident-panel" active={activeTab === 'updates'} onClick={() => selectTab('updates')}>
            Updates
            {hasUnseenUpdates && (
              <span className="h-1.5 w-1.5 rounded-full bg-fire-600" aria-label="New updates" />
            )}
          </TabButton>
          {shelters.length > 0 && (
            <TabButton id="incident-tab-shelters" panelId="incident-panel" active={activeTab === 'shelters'} onClick={() => selectTab('shelters')}>
              Shelters
              <span className="rounded bg-sentinel-600 px-1.5 text-[11px] leading-[18px] tracking-normal text-sentinel-100 tabular-nums">
                {shelters.length}
              </span>
            </TabButton>
          )}
          <TabButton id="incident-tab-info" panelId="incident-panel" active={activeTab === 'info'} onClick={() => selectTab('info')}>
            Info
          </TabButton>
        </div>

        <div id="incident-panel" role="tabpanel" aria-labelledby={`incident-tab-${activeTab}`} className="pb-4">
          {activeTab === 'updates' && (
            <IncidentTimeline
              incidentId={fire.id}
              feed={feed}
              bleed
              showHeading={false}
              dataSource={summary.sourceLabel}
              sourceVariant={summary.isReport ? 'community' : 'fed'}
              legacyInitialSubmission={summary.isReport ? summary.notes : ''}
              legacySubmittedAt={summary.isReport ? fire.created_at : null}
            />
          )}
          {activeTab === 'shelters' && <ShelterList shelters={shelters} />}
          {activeTab === 'info' && <InfoTab fire={fire} summary={summary} updatedAt={updatedAt} />}
        </div>
      </div>

      {/* ── Footer ── */}
      <ShareFollowFooter ref={footerRef} follow={follow} onShare={onShare} shareStatus={shareStatus} />
    </aside>
  );
}
