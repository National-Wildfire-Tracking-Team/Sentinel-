/**
 * RouteToSafetyPanel.jsx
 * All Hazards → Navigation (Pro; internally "Route to Safety"). A translucent sheet over the map:
 * From and To address lines (type-ahead suggestions; From also takes current
 * location or Home), nearest open shelters ranked by drive time, and the chosen
 * route with steps, an Open in Maps handoff and the safety disclaimer. From inside
 * an evacuation zone, Nearest Safety Area routes out of the zone (see useRouteToSafety).
 *
 * Drag it anywhere over the map by its header (useDraggablePanel); double-click
 * the header to put it back in its corner.
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronLeft, Home, Loader2, LocateFixed, MapPin, Navigation, RotateCw, X } from 'lucide-react';
import { SHELTER_KIND_LABELS, directionsUrl } from '../FireDetailPanel/incidentDetailModel';
import { reverseGeocode } from '../../utils/geocode';
import AddressAutocomplete from './AddressAutocomplete';

export const DISCLAIMER = 'Routes avoid hazards shown on the map on a best-effort basis. Always follow official evacuation orders.';

const fmtMin = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)} h ${Math.round((sec % 3600) / 60)} min` : `${Math.round(sec / 60)} min`);
const fmtMi = (m) => `${(m / 1609.344).toFixed(1)} mi`;

/** The daily window resets at midnight UTC; say when that is in the user's own clock. */
function resetCopy(retryAfterSec) {
  const sec = Number(retryAfterSec);
  if (!Number.isFinite(sec) || sec <= 0) return 'It resets at midnight UTC.';
  const at = new Date(Date.now() + sec * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `It resets at ${at}.`;
}

const kindLabel = (kind) => SHELTER_KIND_LABELS[kind] || SHELTER_KIND_LABELS.evacuation_center;

function errorMessage(error, hasMapsUrl) {
  switch (error?.kind) {
    case 'quota':
      if (error.scope === 'user' && error.window === 'minute') return 'Too many route requests — try again in a minute.';
      if (error.scope === 'user') return `You've reached today's routing limit. ${resetCopy(error.retryAfterSec)}`;
      return hasMapsUrl
        ? 'Routing is at capacity right now. Use Open in Maps for directions.'
        : 'Routing is at capacity right now. Try again later.';
    case 'unauthenticated': return 'Sign in again to use Navigation.';
    case 'not_entitled': return 'Navigation is part of Sentinel Pro.';
    case 'location': return "We couldn't get your location. Use Home or search an address.";
    case 'geocode': return "We couldn't find that address.";
    case 'no_route': return 'No drivable route was found to that destination.';
    case 'not_configured': return 'Routing is not configured for this environment.';
    default: return 'Routing is unavailable right now.';
  }
}

export const EXIT_SAFETY_COPY = 'Always avoid active fires, thick smoke significantly reducing visibility, and flooded roadways.';

/** Why this route goes to the zone edge rather than a shelter. */
function exitZoneCopy({ name, level, isFire }) {
  const where = name ? `${level} (${name})` : level;
  return isFire
    ? `You're inside a fire ${where}. This is the quickest way out, heading away from nearby fires. ${EXIT_SAFETY_COPY}`
    : `You're inside an ${where}. This is the quickest way out of the zone. ${EXIT_SAFETY_COPY}`;
}

// The two buttons beside From and To share one size so they line up as a pair.
const sideButtonClass = 'inline-flex items-center justify-center gap-1 shrink-0 w-[6.5rem] min-h-[40px] px-2 py-1 rounded-lg text-[11px] font-semibold leading-tight text-center active:scale-[0.97] transition-transform duration-100';

const chipClass = 'inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-white/15 active:scale-[0.97] transition-transform duration-100';

const fmtCoords = ([lng, lat]) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

const MARGIN = 8; // px kept between the panel and the map's edges
const HEADER_VISIBLE = 56; // a panel taller than the map keeps at least its header on screen

/**
 * Drag a floating panel by a handle: it follows the pointer 1:1 from where it
 * was grabbed (pointer capture, so it keeps tracking off the handle), only
 * while the button is held, and stays inside its positioned parent. The
 * offset is applied straight to the DOM as a transform, so dragging never
 * re-renders the panel.
 */
function useDraggablePanel() {
  const panelRef = useRef(null);
  const offset = useRef({ x: 0, y: 0 });
  const drag = useRef(null);

  const place = useCallback((x, y) => {
    const el = panelRef.current;
    if (!el) return;
    const parent = el.offsetParent?.getBoundingClientRect();
    if (parent && parent.width) {
      const r = el.getBoundingClientRect();
      const baseLeft = r.left - offset.current.x;
      const baseTop = r.top - offset.current.y;
      const minX = parent.left + MARGIN - baseLeft;
      const maxX = parent.right - MARGIN - r.width - baseLeft;
      const minY = parent.top + MARGIN - baseTop;
      const maxY = Math.max(minY, (r.height + 2 * MARGIN <= parent.height
        ? parent.bottom - MARGIN - r.height
        : parent.bottom - HEADER_VISIBLE) - baseTop);
      x = Math.min(Math.max(x, minX), Math.max(minX, maxX));
      y = Math.min(Math.max(y, minY), maxY);
    }
    offset.current = { x, y };
    el.style.transform = x || y ? `translate(${x}px, ${y}px)` : '';
  }, []);

  // Keep it on screen when the window shrinks.
  useEffect(() => {
    const onResize = () => place(offset.current.x, offset.current.y);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [place]);

  const end = (e) => {
    if (drag.current && (!e || e.pointerId === drag.current.pointerId)) drag.current = null;
  };

  const handleProps = {
    onPointerDown: (e) => {
      // Controls in the header keep working as controls.
      if (e.button !== 0 || e.target.closest('button, input, a, select, textarea')) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      drag.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, ox: offset.current.x, oy: offset.current.y };
    },
    onPointerMove: (e) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (e.buttons === 0) { end(e); return; } // missed the release: stop following
      place(d.ox + e.clientX - d.x, d.oy + e.clientY - d.y);
    },
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
    onDoubleClick: (e) => {
      if (!e.target.closest('button, input, a, select, textarea')) place(0, 0);
    },
  };

  return { panelRef, handleProps };
}

/** When the start is the device location, show its street address (or coordinates until/unless one resolves). */
function useDeviceLabel(origin, active) {
  const lng = origin?.[0];
  const lat = origin?.[1];
  const valid = active && Number.isFinite(lng) && Number.isFinite(lat);
  const key = valid ? `${lng},${lat}` : null;
  const [resolved, setResolved] = useState({ key: null, name: null });
  useEffect(() => {
    if (!key) return undefined;
    const ctrl = new AbortController();
    Promise.resolve()
      .then(() => reverseGeocode([lng, lat], { signal: ctrl.signal }))
      .then((name) => { if (!ctrl.signal.aborted && name) setResolved({ key, name }); })
      .catch(() => {});
    return () => ctrl.abort();
  }, [key, lng, lat]);
  if (!valid) return null;
  return resolved.key === key ? resolved.name : fmtCoords([lng, lat]);
}

const RouteToSafetyPanel = memo(function RouteToSafetyPanel({ state, actions, onClose, hasHome }) {
  const [stepsOpen, setStepsOpen] = useState(false);
  const { panelRef, handleProps } = useDraggablePanel();
  const busy = state.status === 'locating' || state.status === 'searching' || state.status === 'routing';
  const feature = state.route?.features?.[0];
  const summary = feature?.properties?.summary;
  const steps = feature?.properties?.segments?.flatMap((s) => s.steps || []) ?? [];
  const mapsUrl = state.destination ? directionsUrl({ lat: state.destination.lat, lng: state.destination.lng }) : null;
  const hasShelters = (state.shelters?.length ?? 0) > 0;
  const { originLabel } = state;
  // My location as the start: no button, the From box shows the address/coordinates instead.
  const isDevice = originLabel === 'My location';
  const deviceLabel = useDeviceLabel(state.origin, isDevice);
  const shownOrigin = isDevice ? deviceLabel : originLabel;
  const fromPlaceholder = shownOrigin || 'Choose a start point';
  const toPlaceholder = state.destination?.name || 'Where to?';
  // Device location status lives in the header, next to the close button.
  const findingLocation = state.status === 'locating' && !originLabel;
  const noLocation = state.status === 'error' && state.error?.kind === 'location';
  let statusText = '';
  if (state.status === 'routing') statusText = state.exitZone ? 'Finding the way out of the evacuation zone…' : 'Finding a route…';
  else if (state.status === 'locating') statusText = originLabel ? 'Finding that address…' : 'Finding your location…';
  else if (state.status === 'searching') statusText = 'Finding open shelters…';
  // The header already shows "Finding your location…"; keep it out of the body.
  const showStatusInBody = busy && !findingLocation;
  const backButton = (
    <button type="button" onClick={actions.backToShelters} aria-label="Back to shelters"
      className="inline-flex items-center gap-0.5 px-2 py-1.5 rounded-lg text-xs font-semibold text-green-300 hover:bg-white/10 active:scale-[0.97] transition-transform duration-100">
      <ChevronLeft size={13} /> Shelters
    </button>
  );

  return (
    <section
      ref={panelRef}
      aria-label="Navigation"
      className="route-safety-panel absolute top-20 right-4 z-30 w-[min(calc(100vw-2rem),360px)] max-h-[calc(100dvh-var(--map-bottom-stack,6rem)-6rem)]
                 sm:w-[min(360px,var(--right-panel-max-width,360px))] sm:max-h-[calc(100%-5rem-var(--right-panel-bottom,1rem))]
                 overflow-y-auto rounded-2xl border border-white/10 bg-sentinel-900/80 backdrop-blur-xl backdrop-saturate-150
                 shadow-2xl shadow-black/60 text-white animate-dock-rise"
    >
      {/* The header is the drag handle (a short grabber bar hints at it). */}
      <header
        {...handleProps}
        title="Drag to move · double-click to reset"
        className="relative flex items-center gap-2 px-4 pt-3.5 pb-2 cursor-grab active:cursor-grabbing touch-none select-none"
      >
        <span aria-hidden="true" className="absolute top-1.5 left-1/2 -translate-x-1/2 h-[3px] w-9 rounded-full bg-white/25" />
        <Navigation size={16} className="text-green-400" />
        <h2 className="flex-1 min-w-0 text-[15px] font-semibold tracking-[-0.01em]">Navigation</h2>
        {findingLocation && (
          <span data-testid="header-location" className="inline-flex items-center gap-1 text-[11px] font-medium text-sentinel-200 whitespace-nowrap">
            <Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Finding your location…
          </span>
        )}
        {noLocation && (
          <>
            <span data-testid="header-location" className="text-[11px] font-semibold text-amber-300 whitespace-nowrap">No Location Found</span>
            <button type="button" onClick={actions.retry} aria-label="Retry location"
              className="inline-flex items-center gap-1 min-h-[28px] px-2 rounded-md bg-white/10 text-[11px] font-semibold text-white hover:bg-white/15 active:scale-95 transition-transform duration-100">
              <RotateCw size={12} aria-hidden="true" /> Retry
            </button>
          </>
        )}
        <button type="button" onClick={onClose} aria-label="Close Navigation"
          className="w-7 h-7 rounded-md flex items-center justify-center text-sentinel-200 hover:bg-white/10 active:scale-95 transition-transform duration-100">
          <X size={14} />
        </button>
      </header>

      {/* From / To: two stacked address lines in one glass group, like a maps app.
          A chosen address shows as the field's (bright) placeholder; typing searches. */}
      <div className="px-4 pb-3 space-y-2">
        <div className="flex gap-2 rounded-xl bg-white/[0.06] border border-white/10 p-2">
          {/* Route marker: start dot, dotted connector, destination pin. */}
          <div className="flex flex-col items-center pt-3.5 pb-3 w-4 shrink-0" aria-hidden="true">
            <span className="w-2.5 h-2.5 rounded-full bg-green-400 ring-2 ring-green-400/30" />
            <span className="flex-1 my-1 border-l-2 border-dotted border-white/30" />
            <MapPin size={13} className="text-red-400" />
          </div>
          <div className="flex-1 min-w-0 divide-y divide-white/10">
            <div className="pb-2" data-testid="route-from-row">
              <span aria-hidden="true" className="block px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sentinel-300">From</span>
              <div className="flex items-start gap-1.5">
                <div className="flex-1 min-w-0">
                  <AddressAutocomplete
                    ariaLabel={shownOrigin ? `From address, ${shownOrigin}` : 'From address'}
                    placeholder={fromPlaceholder}
                    inputClassName={shownOrigin ? 'placeholder:text-white placeholder:font-medium' : ''}
                    proximity={state.origin}
                    onSelect={actions.useCoordinates}
                    onSubmitText={actions.useAddress}
                  />
                </div>
                {!isDevice && (
                  <button type="button" onClick={actions.useMyLocation} aria-label="My location"
                    className={`${sideButtonClass} bg-white/10 hover:bg-white/15`}>
                    <LocateFixed size={13} className="shrink-0" aria-hidden="true" /><span>My Location</span>
                  </button>
                )}
              </div>
            </div>
            <div className="pt-2" data-testid="route-to-row">
              <span aria-hidden="true" className="block px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sentinel-300">To</span>
              <div className="flex items-start gap-1.5">
                <div className="flex-1 min-w-0">
                  <AddressAutocomplete
                    ariaLabel={state.destination?.name ? `To address, ${state.destination.name}` : 'To address'}
                    placeholder={toPlaceholder}
                    inputClassName={state.destination ? 'placeholder:text-white placeholder:font-medium' : ''}
                    proximity={state.origin}
                    onSelect={actions.routeToCoordinates}
                    onSubmitText={actions.routeToAddress}
                  />
                </div>
                {/* One tap: your start → out of the evacuation zone you're in (away from fire),
                    else the closest open shelter, routed around active hazards. */}
                <button type="button" onClick={actions.nearestSafety} aria-label="Nearest Safety Area (Beta)"
                  className={`${sideButtonClass} relative bg-green-600/80 text-white hover:bg-green-600`}>
                  Nearest Safety Area
                  {/* Corner badge: marks the feature as beta without changing the button's size. */}
                  <span aria-hidden="true" data-testid="nearest-beta"
                    className="absolute -top-1.5 -right-1.5 px-1 py-px rounded bg-amber-400 text-[8px] font-bold uppercase tracking-wide leading-none text-black shadow">
                    Beta
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
        {hasHome && (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={actions.useHome} aria-label="Home" aria-pressed={originLabel === 'Home'}
              className={`${chipClass} ${originLabel === 'Home' ? 'bg-green-500/20 text-green-200' : 'bg-white/10'}`}>
              <Home size={12} /> Home
            </button>
          </div>
        )}
      </div>

      {/* One persistent live region: mounted always, so screen readers announce changes. */}
      <div role="status" aria-live="polite" data-testid="route-status" className={showStatusInBody ? 'px-4 py-4 text-sm text-sentinel-200' : 'sr-only'}>
        {statusText}
      </div>

      {/* A missing device location is reported in the header (No Location Found + Retry).
          If the browser has location blocked it can't ask again, so say how to turn it on. */}
      {noLocation && state.error?.denied && (
        <p data-testid="location-denied-hint" className="px-4 pb-2 text-xs text-amber-200">
          Location is blocked for this site. Allow it in your browser&apos;s site settings, then tap Retry.
        </p>
      )}
      {state.status === 'error' && !noLocation && (
        <div className="px-4 py-3 space-y-2" role="alert">
          <p className="text-sm text-amber-200">{errorMessage(state.error, Boolean(mapsUrl))}</p>
          <div className="flex flex-wrap gap-2">
            {hasShelters && backButton}
            {state.error?.kind !== 'not_entitled' && (
              <button type="button" onClick={actions.retry}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 text-xs font-medium hover:bg-white/15 active:scale-[0.97] transition-transform duration-100">
                <RotateCw size={12} /> Retry
              </button>
            )}
            {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-green-400 underline underline-offset-2 self-center">Open in Maps</a>}
          </div>
        </div>
      )}

      {state.status === 'ready' && (
        <div className="px-2 py-2">
          <h3 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sentinel-300">Nearby shelters</h3>
          {state.partial && <p className="px-2 pb-2 text-[11px] text-sentinel-300">The FEMA shelter list is unavailable — showing Sentinel shelters only.</p>}
          {state.shelters.length === 0 ? (
            <p className="px-2 py-2 text-sm text-sentinel-200">No open shelters nearby</p>
          ) : (
            <ul className="space-y-1">
              {state.shelters.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => actions.selectShelter(s)}
                    className="w-full text-left px-2 py-2 rounded-lg hover:bg-white/10 active:bg-white/15 active:scale-[0.99] transition-transform duration-100">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm font-medium truncate">{s.name}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-sentinel-300">{s.source === 'fema' ? 'FEMA' : 'Sentinel'}</span>
                    </div>
                    <div className="text-xs text-sentinel-300">
                      <span className="font-medium text-sentinel-200">{kindLabel(s.kind)}</span> · {fmtMin(s.durationSec)} · {fmtMi(s.distanceM)}{s.address ? ` · ${s.address}` : ''}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={actions.startPick} aria-pressed={state.picking}
            className="mt-1 w-full inline-flex items-center gap-1.5 px-2 py-2 rounded-lg text-sm text-green-300 hover:bg-white/10 active:scale-[0.99] transition-transform duration-100">
            <MapPin size={14} /> {state.picking ? 'Cancel picking' : 'Pick a point on map'}
          </button>
          {state.picking && <p className="px-2 pt-1 text-[11px] text-sentinel-300">Tap the map to set a safe point.</p>}
        </div>
      )}

      {state.status === 'routed' && (
        <div className="px-4 py-3 space-y-2">
          {/* Routed out of a zone without a shelter search: there's no list to go back to. */}
          {(!state.exitZone || hasShelters) && <div className="-ml-2">{backButton}</div>}
          {Number.isFinite(summary?.duration) && Number.isFinite(summary?.distance) && (
            <div className="text-xl font-semibold tracking-[-0.02em]">{fmtMin(summary.duration)} · {fmtMi(summary.distance)}</div>
          )}
          {state.hazardWarning && (
            <p className="flex gap-1.5 text-xs text-amber-300"><AlertTriangle size={13} className="shrink-0 mt-px" />This route passes through or near an active hazard. Follow official evacuation orders.</p>
          )}
          {state.exitZone && (
            <p data-testid="exit-zone-note" className="flex gap-1.5 text-xs text-amber-300">
              <AlertTriangle size={13} className="shrink-0 mt-px" />
              <span>{exitZoneCopy(state.exitZone)}</span>
            </p>
          )}
          {state.startsInsideHazard && (
            <p className="flex gap-1.5 text-xs text-amber-300"><AlertTriangle size={13} className="shrink-0 mt-px" />You're starting inside an active hazard area. Leave by the safest route officials direct.</p>
          )}
          <div className="flex gap-3">
            {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-green-400 underline underline-offset-2">Open in Maps</a>}
            <button type="button" onClick={() => setStepsOpen((o) => !o)} aria-expanded={stepsOpen}
              className="inline-flex items-center gap-1 text-xs font-semibold text-sentinel-200 active:scale-[0.97] transition-transform duration-100">
              Steps <ChevronDown size={12} className={`transition-transform duration-200 ${stepsOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {stepsOpen && (
            <ol className="space-y-1 text-xs text-sentinel-200 list-decimal pl-4">
              {steps.map((st, i) => <li key={i}>{st.instruction}</li>)}
            </ol>
          )}
        </div>
      )}

      <p className="px-4 pb-3 pt-1 text-[11px] leading-snug tracking-[0.01em] text-sentinel-300">{DISCLAIMER}</p>
    </section>
  );
});

export default RouteToSafetyPanel;
