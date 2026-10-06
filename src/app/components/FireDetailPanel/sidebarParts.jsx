/**
 * sidebarParts.jsx
 * Pieces shared by the incident-style detail sidebars (IncidentSidebar for
 * wildfires, HurricaneSidebar for NHC storms): the mobile bottom sheet,
 * sticky tabs, evacuation cards, shelter list, info groups and the
 * Share / Follow footer.
 */

import { forwardRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { SHELTER_KIND_LABELS, directionsUrl } from './incidentDetailModel';


// ─── Pieces ──────────────────────────────────────────────────────────────────

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

export function EvacuationCard({ level, data }) {
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

export function EvacuationNotes({ notes, links }) {
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

export function TabButton({ active, onClick, children, id, panelId }) {
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

export function ShelterList({ shelters }) {
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

export function InfoGroup({ title, rows }) {
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

export const infoLink = 'inline-flex items-center min-h-[44px] -my-3 font-semibold text-fire-400 hover:text-fire-300';

/** Drag handle at the top of the mobile bottom sheet. */
export const SheetHandle = forwardRef(function SheetHandle({ sheet, label }, ref) {
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-expanded={sheet.expanded}
      aria-label={sheet.expanded ? `Collapse ${label}` : `Expand ${label}`}
      onClick={sheet.toggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sheet.toggle(); }
      }}
      {...sheet.dragProps}
      className="shrink-0 flex h-6 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
    >
      <span className="h-1 w-9 rounded-full bg-sentinel-500" aria-hidden />
    </div>
  );
});

/**
 * Share and Follow, pinned to the bottom of the sidebar. Following while
 * signed out sends the user to sign in and back.
 * @param {{ following: boolean, pending: boolean, canFollow: boolean, toggle: Function }} follow from useIncidentFollow
 */
export const ShareFollowFooter = forwardRef(function ShareFollowFooter({ follow, onShare, shareStatus, noun = 'Incident' }, ref) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleFollow = () => {
    if (!follow.canFollow) {
      navigate('/login', { state: { from: `${location.pathname}${location.search}` } });
      return;
    }
    follow.toggle();
  };

  return (
    <footer ref={ref} className="shrink-0 grid grid-cols-2 gap-3 border-t border-sentinel-700 bg-sentinel-800 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={onShare}
        className="min-h-[48px] rounded-xl border border-sentinel-500 text-[15px] font-semibold text-slate-100
                   hover:bg-sentinel-700 transition-colors"
        aria-live="polite"
      >
        {shareStatus || `Share ${noun}`}
      </button>
      <button
        type="button"
        onClick={handleFollow}
        disabled={follow.pending}
        aria-pressed={follow.following}
        className={`min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl text-[15px] font-semibold
          transition-colors disabled:opacity-60
          ${follow.following
            ? 'border border-sentinel-600 text-sentinel-200 hover:bg-sentinel-700'
            : 'bg-fire-600/25 border border-fire-600/50 text-white hover:bg-fire-600/35'}`}
      >
        {follow.following && <Check size={16} aria-hidden />}
        {follow.following ? 'Following' : `Follow ${noun}`}
      </button>
    </footer>
  );
});
