/**
 * HurricaneSidebar.jsx
 * Incident detail for an NHC tropical cyclone: status, position, intensity,
 * the watch/warning headline, then Storm / Evacuations / Shelters / Info
 * tabs, with Share and Follow pinned at the bottom. The Storm tab pairs a
 * rail of NHC products with the selected product's view; picking a product
 * also turns its map layer on. Docked right over the map on desktop (wider
 * than IncidentSidebar, for the rail); a draggable bottom sheet on mobile.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAppStatus } from '../../context/AppStatusContext';
import { useIncidentEvacuations, useIncidentFollow, useIncidentShelters } from '../../hooks/useIncidentDetails';
import { useNhcStormText } from '../../hooks/useNhcStormText';
import { formatRelativeTime } from '../../utils/formatUtils';
import { categoryColor, categoryLabel, nhcAdvisoryUrl } from '../../api/nhcTropicalWeather';
import { formatAdvisoryLocal } from '../../api/nhcTextProducts';
import { buildEvacuations } from './incidentDetailModel';
import {
  advisoryHeadline, arrivalTimes, currentForecastPoint, forecastIntensity, parseAdvisoryDate, parseForecastLabel,
  pressureTrend, stormAlerts, stormWatchWarnings, tropicalAlertColor, watchWarningHeadline, windFieldExtent,
  windProbBandsPresent,
} from './hurricaneModel';
import { HURRICANE_PRODUCTS } from './hurricaneProducts';
import {
  EvacuationCard, EvacuationNotes, InfoGroup, ShareFollowFooter, SheetHandle, ShelterList, TabButton, infoLink,
} from './sidebarParts';
import { useBottomSheet, useEscapeToClose, useIsDesktop, useNow } from './useSidebar';

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

function formatLatLng(lat, lng) {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(1)}°${lng < 0 ? 'W' : 'E'}`;
}

/**
 * Watches and warnings: from the public advisory when it's loaded (it names
 * the areas and is authoritative about "none"), else the map layer's
 * coastline segments.
 */
function stormWatchWarningList(storm, nhc, tcp) {
  if (tcp?.watchWarnings) {
    return tcp.watchWarnings.map((w) => ({
      type: w.type,
      color: tropicalAlertColor(w.type),
      areas: w.areas,
      advisoryNum: storm.advisoryNum || '',
      advisoryDate: storm.advisoryDate || '',
    }));
  }
  return stormWatchWarnings(nhc?.watchWarningGeoJSON, storm.slot, storm.advisoryDate);
}

/** One storm's slice of the NHC layers and text products, ready for the product views. */
function buildStormModel(storm, nhc, nwsAlerts, nwsAlertsLoaded, text) {
  const { slot } = storm;
  const hazards = nhc?.windHazards;
  const fetched = hazards?.fetched ?? {};
  const forecastPoints = nhc?.forecastPointsGeoJSON ?? EMPTY_FC;
  const anchor = parseForecastLabel(currentForecastPoint(forecastPoints, slot)?.fullDateLabel);
  const radiiExtent = windFieldExtent(hazards?.windRadiiGeoJSON, slot);
  const watchWarnings = stormWatchWarningList(storm, nhc, text.tcp);
  return {
    text,
    watchWarnings,
    headline: text.tcp?.watchWarnings ? advisoryHeadline(text.tcp.watchWarnings) : watchWarningHeadline(watchWarnings),
    forecast: forecastIntensity(forecastPoints, slot, text.tcd?.tauNotes),
    pressureTrend: pressureTrend(nhc?.pastPointsGeoJSON, slot),
    eyeDiameterNm: text.tcm?.eyeDiameterNm ?? null,
    // The radii layer when it's loaded (it has 50 kt too); else the advisory's own words.
    windExtent: Object.keys(radiiExtent).length ? radiiExtent : (text.tcp?.windExtentMi ?? {}),
    windProb: {
      fetchedKt: fetched.probKt ?? null,
      bands: windProbBandsPresent(hazards?.windProbGeoJSON),
    },
    arrival: {
      fetched: Boolean(fetched.arrival),
      likely: arrivalTimes(hazards?.arrivalGeoJSON, slot, anchor),
      earliest: arrivalTimes(hazards?.earliestArrivalGeoJSON, slot, anchor),
    },
    surge: {
      fetched: Boolean(fetched.surge),
      threat: (hazards?.surgeSlots ?? []).includes(slot),
    },
    affected: {
      alerts: stormAlerts(nwsAlerts, storm, nhc?.cyclones),
      alertsLoaded: nwsAlertsLoaded,
    },
  };
}

function Stat({ label, value, unit }) {
  return (
    <div>
      <dt className="text-[13px] text-sentinel-200">{label}</dt>
      <dd className="text-[28px] font-semibold leading-tight tabular-nums text-white">
        {value ?? '—'}
        {value != null && unit && <span className="ml-1 text-[15px] font-semibold text-sentinel-200">{unit}</span>}
      </dd>
    </div>
  );
}

function ProductSquare({ color }) {
  return <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} aria-hidden />;
}

/** Storm tab: product rail (chips on mobile) + the selected product. */
function StormTab({ storm, model, product, onSelect, isDesktop, now }) {
  const active = HURRICANE_PRODUCTS.find((p) => p.key === product) ?? HURRICANE_PRODUCTS[0];
  const squareColor = (p) => p.color ?? categoryColor(storm.category);
  const View = active.View;
  const view = (
    <div id="hurricane-product" role="region" aria-label={active.label} className="min-w-0 flex-1 px-5 py-4">
      <View storm={storm} model={model} now={now} />
    </div>
  );

  if (!isDesktop) {
    return (
      <>
        <div role="group" aria-label="NHC products" className="flex gap-2 overflow-x-auto px-5 pt-2">
          {HURRICANE_PRODUCTS.map((p) => {
            const selected = p.key === active.key;
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(p)}
                className="inline-flex min-h-[44px] shrink-0 items-center"
              >
                <span
                  className={`inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-[13px] font-semibold
                    ${selected ? 'border-fire-600 bg-fire-600/10 text-white' : 'border-sentinel-500 text-sentinel-100'}`}
                >
                  <ProductSquare color={squareColor(p)} />
                  {p.label}
                </span>
              </button>
            );
          })}
        </div>
        {view}
      </>
    );
  }

  return (
    <div className="flex min-h-full">
      <nav aria-label="NHC products" className="w-[208px] shrink-0 border-r border-sentinel-700 px-2 py-4">
        <h3 className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-sentinel-200">NHC products</h3>
        <ul className="space-y-0.5">
          {HURRICANE_PRODUCTS.map((p) => {
            const selected = p.key === active.key;
            return (
              <li key={p.key}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(p)}
                  className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm leading-snug transition-colors
                    ${selected ? 'bg-sentinel-600 font-semibold text-white' : 'text-sentinel-100 hover:bg-sentinel-700'}`}
                >
                  <ProductSquare color={squareColor(p)} />
                  {p.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      {view}
    </div>
  );
}

function EvacuationsTab({ evacuations }) {
  const hasCards = evacuations && (evacuations.order || evacuations.warning || evacuations.notes || evacuations.links.length > 0);
  if (!hasCards) {
    return <p className="px-5 py-4 text-sm text-sentinel-200">No evacuation orders or warnings posted for this storm.</p>;
  }
  return (
    <div className="space-y-2.5 px-5 py-4">
      {evacuations.order && <EvacuationCard level="order" data={evacuations.order} />}
      {evacuations.warning && <EvacuationCard level="warning" data={evacuations.warning} />}
      <EvacuationNotes notes={evacuations.notes} links={evacuations.links} />
    </div>
  );
}

function InfoTab({ storm, hasCoords, text }) {
  return (
    <>
      <InfoGroup
        title="Storm"
        rows={[
          ['Name', storm.name],
          ['Classification', storm.stormType || categoryLabel(storm.category)],
          ['Basin', [storm.basin, storm.slot].filter(Boolean).join(' · ')],
          ['Advisory', storm.advisoryNum && `#${storm.advisoryNum}`],
          ['Issued', formatAdvisoryLocal(storm.advisoryDate) ?? storm.advisoryDate],
          ['Next advisory', text.tcp?.nextAdvisory?.replace(/^Next /, '').replace(/^./, (c) => c.toUpperCase())],
          ['Eye diameter', text.tcm?.eyeDiameterNm != null && `${text.tcm.eyeDiameterNm} nm`],
        ]}
      />
      <InfoGroup
        title="Location"
        rows={[
          ['Coordinates', hasCoords && formatLatLng(storm.lat, storm.lng)],
          ['Nearest place', text.tcp?.place],
        ]}
      />
      <InfoGroup
        title="Source"
        rows={[
          ['Data source', 'National Hurricane Center'],
          ['Official page', (
            <a href={nhcAdvisoryUrl(storm.slot)} target="_blank" rel="noopener noreferrer" className={infoLink}>
              NHC public advisory
            </a>
          )],
        ]}
      />
    </>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

/**
 * @param {object}   fire        selectedFire ({ type: 'nhc-storm', ...cyclone from buildCyclones })
 * @param {object}   [nhc]       Live NHC data: { cyclones, forecastPointsGeoJSON, pastPointsGeoJSON, watchWarningGeoJSON, windHazards }
 * @param {string}   [product]   Selected NHC product key (kept per storm by the caller)
 * @param {Function} [onProductChange]
 * @param {Function} onClose
 * @param {Function} onShare
 * @param {string}   shareStatus Transient share feedback ("Link copied")
 */
export default function HurricaneSidebar({ fire, nhc, product, onProductChange, onClose, onShare, shareStatus }) {
  const now = useNow(30_000);
  const { layers, toggleLayer } = useApp();
  const { alerts: nwsAlerts, alertsStatus } = useAppStatus();
  const nwsAlertsLoaded = Boolean(alertsStatus?.lastRefresh);

  // The selection is a snapshot; follow the live cyclone as advisories update.
  const storm = nhc?.cyclones?.find((c) => c.id === fire.id) ?? fire;
  const text = useNhcStormText(storm);
  const model = useMemo(
    () => buildStormModel(storm, nhc, nwsAlerts, nwsAlertsLoaded, text),
    [storm, nhc, nwsAlerts, nwsAlertsLoaded, text],
  );

  const evacuationRows = useIncidentEvacuations(fire.id);
  const shelters = useIncidentShelters(fire.id);
  const follow = useIncidentFollow(fire.id, storm.name);
  const evacuations = buildEvacuations(evacuationRows, null);

  // ── Products ──
  const [ownProduct, setOwnProduct] = useState(null);
  const defaultProduct = model.watchWarnings.length > 0 ? 'watches' : 'current';
  const selectedProduct = product ?? ownProduct ?? defaultProduct;
  const selectProduct = (p) => {
    if (p.layer && !layers?.[p.layer]) toggleLayer(p.layer);
    if (onProductChange) onProductChange(p.key);
    else setOwnProduct(p.key);
  };

  // ── Tabs ──
  const [tab, setTab] = useState('storm');
  const activeTab = tab === 'shelters' && shelters.length === 0 ? 'storm' : tab;
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
    setTab(next);
    const scroller = scrollRef.current;
    const anchor = tabsAnchorRef.current;
    if (scroller && anchor && scroller.scrollTop > anchor.offsetTop) scroller.scrollTop = anchor.offsetTop;
  }, []);

  useEscapeToClose(onClose);

  const color = categoryColor(storm.category);
  const issuedAt = parseAdvisoryDate(storm.advisoryDate);
  const relative = issuedAt ? formatRelativeTime(issuedAt) : null;
  const hasCoords = Number.isFinite(storm.lat) && Number.isFinite(storm.lng);
  const situation = model.headline;
  const issuedLocal = formatAdvisoryLocal(storm.advisoryDate);
  const movement = storm.motionDir
    ? `${storm.motionDir} ${storm.motionMph}`
    : storm.motionMph === 0 || storm.movement === 'Stationary' ? 'Stationary' : null;

  return (
    <aside
      ref={sheetRef}
      aria-label={`${storm.name} storm details`}
      style={isDesktop ? undefined : { height: sheet.height }}
      className={`z-30 flex flex-col overflow-hidden border-sentinel-500 bg-sentinel-800 text-slate-100 shadow-2xl
        ${isDesktop
          ? 'absolute right-4 top-[68px] bottom-4 w-[720px] max-w-[calc(100%-2rem)] rounded-2xl border animate-slide-in-right'
          : `fixed inset-x-0 bottom-0 rounded-t-2xl border-t animate-slide-up-panel
             ${sheet.dragging ? '' : 'transition-[height] duration-300 ease-out'}`}`}
    >
      {!isDesktop && <SheetHandle ref={handleRef} sheet={sheet} label="storm details" />}

      <div
        ref={scrollRef}
        className={`relative flex-1 overscroll-contain ${peeking ? 'overflow-hidden' : 'overflow-y-auto'}`}
      >
        {/* Peek region: header and situation (the mobile sheet's collapsed view). */}
        <div
          ref={peekRef}
          {...(peeking ? sheet.dragProps : {})}
          className={peeking ? 'touch-none' : ''}
        >
          {/* ── Header ── */}
          <header className={`relative px-5 ${isDesktop ? 'pt-5' : 'pt-1'}`}>
            <h2 className={`text-[26px] font-bold leading-tight text-white ${isDesktop ? 'pr-12' : ''}`}>{storm.name}</h2>
            {isDesktop && (
              <button
                type="button"
                onClick={onClose}
                className="absolute right-2 top-3 w-11 h-11 inline-flex items-center justify-center rounded-lg
                           text-sentinel-200 hover:text-white hover:bg-sentinel-700 transition-colors"
                aria-label="Close storm details"
              >
                <X size={18} />
              </button>
            )}
            <p className="mt-1.5 flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 0 4px ${color}33` }} aria-hidden />
              <span className="font-semibold" style={{ color }}>{categoryLabel(storm.category)}</span>
              {relative && (
                <>
                  <span className="text-sentinel-200" aria-hidden>·</span>
                  <span className="text-sentinel-200">Updated {relative === 'Just now' ? 'just now' : relative}</span>
                </>
              )}
            </p>

            {(storm.basin || hasCoords || model.text.tcp?.place) && (
              <p className="mt-4 text-sm leading-relaxed text-sentinel-100 tabular-nums">
                {model.text.tcp?.place && <span className="block">{model.text.tcp.place}</span>}
                <span className="block">
                  {[storm.basin, hasCoords && formatLatLng(storm.lat, storm.lng)].filter(Boolean).join(' · ')}
                </span>
              </p>
            )}

            <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
              <Stat label="Max wind" value={storm.maxWindMph > 0 ? storm.maxWindMph : null} unit="mph" />
              <Stat label="Pressure" value={storm.mslp} unit="mb" />
              <Stat label="Movement" value={movement} unit={storm.motionDir ? 'mph' : null} />
            </dl>

            <p className="mt-4 pb-5 text-[13px] text-sentinel-200 tabular-nums">
              From <span className="font-semibold text-sentinel-100">National Hurricane Center</span>
              {storm.advisoryNum && <> · Advisory {storm.advisoryNum}</>}
              {(issuedLocal || storm.advisoryDate) && <> · {issuedLocal ?? storm.advisoryDate}</>}
            </p>
          </header>

          {/* ── Situation ── */}
          {situation && (
            <section className="mx-5 border-t border-sentinel-700 pt-5 pb-6" aria-label="Current situation">
              <p className="text-[17px] font-semibold leading-snug text-fire-400">{situation}</p>
            </section>
          )}
        </div>

        {/* ── Tabs ── */}
        <div ref={tabsAnchorRef} aria-hidden />
        <div
          role="tablist"
          aria-label="Storm sections"
          className="sticky top-0 z-10 flex gap-7 overflow-x-auto px-5 border-b border-sentinel-700 bg-sentinel-800"
        >
          <TabButton id="storm-tab-storm" panelId="storm-panel" active={activeTab === 'storm'} onClick={() => selectTab('storm')}>
            Storm
          </TabButton>
          <TabButton id="storm-tab-evacuations" panelId="storm-panel" active={activeTab === 'evacuations'} onClick={() => selectTab('evacuations')}>
            Evacuations
          </TabButton>
          {shelters.length > 0 && (
            <TabButton id="storm-tab-shelters" panelId="storm-panel" active={activeTab === 'shelters'} onClick={() => selectTab('shelters')}>
              Shelters
              <span className="rounded bg-sentinel-600 px-1.5 text-[11px] leading-[18px] tracking-normal text-sentinel-100 tabular-nums">
                {shelters.length}
              </span>
            </TabButton>
          )}
          <TabButton id="storm-tab-info" panelId="storm-panel" active={activeTab === 'info'} onClick={() => selectTab('info')}>
            Info
          </TabButton>
        </div>

        <div id="storm-panel" role="tabpanel" aria-labelledby={`storm-tab-${activeTab}`} className="pb-4">
          {activeTab === 'storm' && (
            <StormTab
              storm={storm}
              model={model}
              product={selectedProduct}
              onSelect={selectProduct}
              isDesktop={isDesktop}
              now={now}
            />
          )}
          {activeTab === 'evacuations' && <EvacuationsTab evacuations={evacuations} />}
          {activeTab === 'shelters' && <ShelterList shelters={shelters} />}
          {activeTab === 'info' && <InfoTab storm={storm} hasCoords={hasCoords} text={model.text} />}
        </div>
      </div>

      {/* ── Footer ── */}
      <ShareFollowFooter ref={footerRef} follow={follow} onShare={onShare} shareStatus={shareStatus} />
    </aside>
  );
}
