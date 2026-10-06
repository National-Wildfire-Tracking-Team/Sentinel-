/**
 * IncidentSidebar.jsx
 * Incident detail for wildfire incidents (official feeds and NWTT reporter
 * reports): status, location, size, current situation, evacuations, then
 * Updates / Shelters / Info tabs, with Share and Follow pinned at the bottom.
 * Docked right over the map on desktop; a draggable bottom sheet on mobile.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { useIncidentUpdates } from '../../hooks/useIncidentUpdates';
import { useIncidentEvacuations, useIncidentFollow, useIncidentShelters } from '../../hooks/useIncidentDetails';
import {
  formatAcres, formatDateTime, formatPersonnel, formatRelativeTime,
} from '../../utils/formatUtils';
import IncidentTimeline from '../IncidentTimeline/IncidentTimeline';
import ModelForecastSummary from '../WeatherModels/ModelForecastSummary';
import {
  SHELTER_KIND_LABELS, buildEvacuations, deriveSituation, directionsUrl, incidentSummary,
} from './incidentDetailModel';

// ─── Small hooks ─────────────────────────────────────────────────────────────

/** Re-render on an interval so relative times ("Updated 3m ago") stay current. */
function useNow(intervalMs) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const DESKTOP_QUERY = '(min-width: 768px)';

function subscribeDesktop(onChange) {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/** Tailwind `md` and up: docked panel; below: bottom sheet. */
function useIsDesktop() {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}

// Space left above the expanded sheet so the map (and the selected marker
// edge) stays visible and the sheet reads as dismissible.
const SHEET_TOP_GAP = 56;
const SHEET_MAX_PEEK_RATIO = 0.7;
const DRAG_SLOP = 6;

/**
 * Bottom-sheet state for mobile. Peek shows everything above the tabs
 * (header through evacuations) plus the footer; dragging the handle (or the
 * peek content) up expands to full height, dragging below peek closes.
 */
function useBottomSheet({ enabled, onClose, scrollRef, sheetRef, handleRef, peekRef, footerRef }) {
  const [expanded, setExpanded] = useState(false);
  const [dragHeight, setDragHeight] = useState(null);
  const [parts, setParts] = useState({ handle: 0, peek: 0, footer: 0 });
  const drag = useRef(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    if (!enabled) return undefined;
    const measure = () => setParts({
      handle: handleRef.current?.offsetHeight ?? 0,
      peek: peekRef.current?.offsetHeight ?? 0,
      footer: footerRef.current?.offsetHeight ?? 0,
    });
    const observer = new ResizeObserver(measure);
    [handleRef, peekRef, footerRef].forEach((r) => r.current && observer.observe(r.current));
    return () => observer.disconnect();
  }, [enabled, handleRef, peekRef, footerRef]);

  const fullPx = () => window.innerHeight - SHEET_TOP_GAP;
  const peekPx = parts.peek
    ? Math.min(parts.handle + parts.peek + parts.footer, window.innerHeight * SHEET_MAX_PEEK_RATIO)
    : window.innerHeight * 0.45;

  const setSheetExpanded = useCallback((next) => {
    setExpanded(next);
    // Collapsing always returns to the top so the peek shows the header.
    if (!next && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [scrollRef]);

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    suppressClick.current = false;
    drag.current = {
      startY: e.clientY,
      startH: sheetRef.current?.getBoundingClientRect().height ?? peekPx,
      moved: false,
      target: e.currentTarget,
      pointerId: e.pointerId,
    };
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dy) < DRAG_SLOP) return;
    if (!d.moved) {
      d.moved = true;
      d.target.setPointerCapture?.(d.pointerId);
    }
    setDragHeight(Math.max(80, Math.min(fullPx(), d.startH - dy)));
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    suppressClick.current = true;
    const h = d.startH - (e.clientY - d.startY);
    setDragHeight(null);
    if (h < peekPx * 0.6) onClose();
    else setSheetExpanded(h > (peekPx + fullPx()) / 2);
  };

  const dragProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: () => { drag.current = null; setDragHeight(null); },
    // A drag that ends over a link must not also follow it.
    onClickCapture: (e) => {
      if (suppressClick.current) {
        suppressClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };

  const height = dragHeight != null ? `${dragHeight}px`
    : expanded ? `calc(100dvh - ${SHEET_TOP_GAP}px)`
    : `${peekPx}px`;

  return {
    expanded,
    dragging: dragHeight != null,
    height,
    toggle: () => setSheetExpanded(!expanded),
    dragProps,
  };
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

const SITUATION_TONE_CLASS = {
  red: 'text-red-400',
  amber: 'text-amber-400',
  orange: 'text-orange-400',
};

const EVAC_LEVELS = {
  order: {
    title: 'Evacuation Order · Level 3 · Go',
    card: 'bg-[rgba(248,113,113,0.14)]',
    dot: 'bg-red-400',
  },
  warning: {
    title: 'Evacuation Warning · Level 2 · Set',
    card: 'bg-[rgba(251,191,36,0.11)]',
    dot: 'bg-amber-400',
  },
};

function EvacuationCard({ level, data }) {
  const meta = EVAC_LEVELS[level];
  return (
    <div className={`rounded-[10px] px-4 py-3 ${meta.card}`}>
      <p className="flex items-center gap-2.5 text-[15px] font-semibold text-white">
        <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden />
        {meta.title}
      </p>
      {data.zones.length > 0 && (
        <p className="mt-1 text-sm leading-relaxed text-sentinel-100">{data.zones.join(', ')}</p>
      )}
      {data.lines.length > 0 && (
        <ul className="mt-1 space-y-1 text-sm leading-relaxed text-sentinel-100">
          {data.lines.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      )}
    </div>
  );
}

function EvacuationNotes({ notes, links }) {
  if (!notes && links.length === 0) return null;
  return (
    <div className="rounded-[10px] bg-[#161a20] px-4 py-3">
      <p className="text-[15px] font-semibold text-white">Evacuation notes</p>
      {notes && (
        <p className="mt-1 text-sm leading-relaxed text-sentinel-100 whitespace-pre-wrap">{notes}</p>
      )}
      {links.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-x-5">
          {links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center min-h-[44px] -my-2 text-sm font-semibold text-fire-400 hover:text-fire-300"
            >
              {link.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children, id, panelId }) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      aria-controls={panelId}
      onClick={onClick}
      className={`relative inline-flex items-center gap-2 min-h-[44px] text-[12px] font-semibold uppercase tracking-[0.1em]
        border-b-2 transition-colors
        ${active ? 'text-white border-fire-600' : 'text-sentinel-200 border-transparent hover:text-sentinel-100'}`}
    >
      {children}
    </button>
  );
}

function ShelterList({ shelters }) {
  return (
    <ul>
      {shelters.map((s) => {
        const url = directionsUrl(s);
        const isCenter = s.kind === 'evacuation_center';
        return (
          <li key={s.id} className="px-5 py-4 border-b border-sentinel-700">
            <p className={`text-[12px] font-semibold uppercase tracking-[0.1em] ${isCenter ? 'text-fire-400' : 'text-sentinel-200'}`}>
              {SHELTER_KIND_LABELS[s.kind] || SHELTER_KIND_LABELS.other}
            </p>
            <p className="mt-1 text-[15px] font-semibold text-white">{s.name}</p>
            {s.address && <p className="mt-0.5 text-sm text-sentinel-100">{s.address}</p>}
            {(url || s.status_note) && (
              <div className="mt-1 flex items-center gap-3 text-[13px]">
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center min-h-[44px] -my-2.5 font-semibold text-fire-400 hover:text-fire-300"
                  >
                    Directions
                  </a>
                )}
                {s.status_note && <span className="text-sentinel-200">{s.status_note}</span>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function InfoGroup({ title, rows }) {
  const visible = rows.filter(([, value]) => value != null && value !== '' && value !== false);
  if (visible.length === 0) return null;
  return (
    <section className="px-5 py-4 border-b border-sentinel-700">
      <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-sentinel-200">{title}</h3>
      <dl>
        {visible.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[128px_1fr] gap-3 py-1.5 text-sm leading-relaxed">
            <dt className="text-sentinel-200">{label}</dt>
            <dd className="text-slate-100 break-words whitespace-pre-wrap">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const infoLink = 'inline-flex items-center min-h-[44px] -my-3 font-semibold text-fire-400 hover:text-fire-300';

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
  const navigate = useNavigate();
  const location = useLocation();

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

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleFollow = () => {
    if (!follow.canFollow) {
      navigate('/login', { state: { from: `${location.pathname}${location.search}` } });
      return;
    }
    follow.toggle();
  };

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
      {!isDesktop && (
        <div
          ref={handleRef}
          role="button"
          tabIndex={0}
          aria-expanded={sheet.expanded}
          aria-label={sheet.expanded ? 'Collapse incident details' : 'Expand incident details'}
          onClick={sheet.toggle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sheet.toggle(); }
          }}
          {...sheet.dragProps}
          className="shrink-0 flex h-6 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
        >
          <span className="h-1 w-9 rounded-full bg-sentinel-500" aria-hidden />
        </div>
      )}

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
      <footer ref={footerRef} className="shrink-0 grid grid-cols-2 gap-3 border-t border-sentinel-700 bg-sentinel-800 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onShare}
          className="min-h-[48px] rounded-xl border border-sentinel-500 text-[15px] font-semibold text-slate-100
                     hover:bg-sentinel-700 transition-colors"
          aria-live="polite"
        >
          {shareStatus || 'Share Incident'}
        </button>
        <button
          type="button"
          onClick={handleFollow}
          disabled={follow.pending}
          aria-pressed={follow.following}
          className={`min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl text-[15px] font-semibold
            transition-colors disabled:opacity-60
            ${follow.following
              ? 'border border-fire-600 text-fire-400 hover:bg-fire-600/10'
              : 'bg-fire-600 text-sentinel-900 hover:bg-fire-500'}`}
        >
          {follow.following && <Check size={16} aria-hidden />}
          {follow.following ? 'Following' : 'Follow Incident'}
        </button>
      </footer>
    </aside>
  );
}
