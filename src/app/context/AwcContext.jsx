/**
 * AwcContext.jsx
 * Data for the Aviation Weather Center layer (Weather and All Hazards tabs).
 *
 * The on/off switches live in AppContext like every other layer: `awc` is the
 * layer panel's row, and the drawer (LayerControl/AwcControls) holds one
 * switch per product and per hazard (api/awc/awc.js AWC_GROUPS). This
 * provider loads only what is switched on, while its tab is shown, and polls
 * no faster than the product changes; the CDN in front (awc-proxy) then
 * serves everyone from one upstream request per TTL. Navigation layers load
 * for the map view once zoomed in far enough. A failed refresh keeps the last
 * good data and reports the error.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useApp } from './AppContext';
import { useViewport } from './ViewportContext';
import {
  AWC_LAYER_BY_KEY, AWC_HAZARD_TOGGLES, AWC_MAX_RESULTS, AWC_NAV_ROUTES, AWC_SUBLAYER_KEYS,
  bboxStepForZoom, decorateAdvisories, decorateNav, decoratePireps, decorateTcf, enabledHazards,
  fetchAwc, fetchAwcGeoJSON, fetchMetarCache, snappedBbox, splitGairmets, splitSigmets,
} from '../api/awc/awc';
import { nearestOffice } from '../api/awc/textProducts';
import { viewportBounds } from '../api/fireDanger/stations';

const AwcContext = createContext(null);

const MIN = 60 * 1000;
// METARs: AWC's file updates each minute, stations report hourly (plus specials).
const OBS_REFRESH_MS = 5 * MIN;
const ADVISORY_REFRESH_MS = 5 * MIN;
const OUTLOOK_REFRESH_MS = 15 * MIN;
// Pilot reports within North America, last 90 min: ~300 in 2 h on a busy day, and AWC caps a query at 400.
const PIREP_BBOX = '15,-170,72,-50';

// Loaders: module-level so their identity never changes; `args` is plain data.
const loadMetars = (signal) => fetchMetarCache(signal);
const loadPireps = (signal) => fetchAwcGeoJSON('pirep', { bbox: PIREP_BBOX, age: 1.5 }, { signal }).then(decoratePireps);
const loadSigmets = (signal) => fetchAwcGeoJSON('sigmet', {}, { signal }).then(splitSigmets);
const loadGairmets = (signal) => fetchAwcGeoJSON('gairmet', {}, { signal }).then(splitGairmets);
const loadAirmets = (signal) => fetchAwcGeoJSON('airmet', {}, { signal }).then((fc) => decorateAdvisories(fc.features));
const loadCwas = (signal) => fetchAwcGeoJSON('cwa', {}, { signal }).then((fc) => decorateAdvisories(fc.features));
const loadTcf = (signal) => fetchAwcGeoJSON('tcf', {}, { signal }).then(decorateTcf);
const loadNav = (signal, { route, bbox }) => fetchAwcGeoJSON(route, { bbox }, { signal }).then(decorateNav);
const loadText = (signal, { route, params }) => fetchAwc(route, params, { signal, as: 'text', empty: '' });

// A failed load is retried this soon (then twice as long), rather than at the next poll.
const RETRY_MS = 20 * 1000;
const MAX_RETRIES = 2;

/**
 * One polled AWC resource. Re-fetches when `enabled` turns on or `args`
 * change, then every `refreshMs`; a failure is retried shortly. Keeps the
 * last good data through errors and while switched off, so switching back
 * on shows it at once.
 */
function useAwcResource(enabled, loader, args = null, refreshMs = 0) {
  const argsKey = JSON.stringify(args);
  const [st, setSt] = useState({ argsKey: null, data: null, error: null, loading: false, fetchedAt: null });

  useEffect(() => {
    if (!enabled) return undefined;
    const ctrl = new AbortController();
    const parsed = JSON.parse(argsKey);
    let retryTimer = null;
    const run = (attempt = 0) => {
      setSt((s) => ({ ...s, loading: true }));
      loader(ctrl.signal, parsed)
        .then((data) => {
          if (!ctrl.signal.aborted) setSt({ argsKey, data, error: null, loading: false, fetchedAt: Date.now() });
        })
        .catch((error) => {
          if (ctrl.signal.aborted || error?.name === 'AbortError') return;
          console.warn('[AWC]', error.message);
          setSt((s) => ({ ...s, error, loading: false }));
          if (attempt < MAX_RETRIES) {
            clearTimeout(retryTimer);
            retryTimer = setTimeout(() => run(attempt + 1), RETRY_MS * 2 ** attempt);
          }
        });
    };
    run();
    const id = refreshMs ? setInterval(() => run(), refreshMs) : null;
    return () => {
      ctrl.abort();
      clearTimeout(retryTimer);
      if (id) clearInterval(id);
    };
  }, [enabled, loader, argsKey, refreshMs]);

  // Stable between state changes, so panning the map doesn't re-render consumers.
  return useMemo(() => ({ ...st, current: st.argsKey === argsKey }), [st, argsKey]);
}

const DEFAULT_SETTINGS = {
  windtemp: { region: 'us', level: 'low', fcst: '06' },
  fcstdisc: { office: 'auto', type: 'afd' },
  areafcst: { region: 'aksouth' },
};

/** @param {{ active: boolean, children: any }} props  active: the AWC row is on and its tab is shown */
export function AwcProvider({ active, children }) {
  const { layers } = useApp();
  const { viewport } = useViewport();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const on = useMemo(
    () => Object.fromEntries(AWC_SUBLAYER_KEYS.map((k) => [k, Boolean(active && layers[k])])),
    [active, layers],
  );

  const metars = useAwcResource(on.awcMetarTaf, loadMetars, null, OBS_REFRESH_MS);
  const pireps = useAwcResource(on.awcPirep, loadPireps, null, OBS_REFRESH_MS);
  const sigmets = useAwcResource(on.awcSigmetUs || on.awcSigmetIntl, loadSigmets, null, ADVISORY_REFRESH_MS);
  const gairmets = useAwcResource(on.awcGairmetSierra || on.awcGairmetTango || on.awcGairmetZulu, loadGairmets, null, ADVISORY_REFRESH_MS);
  const airmets = useAwcResource(on.awcAirmetAk, loadAirmets, null, ADVISORY_REFRESH_MS);
  const cwas = useAwcResource(on.awcCwa, loadCwas, null, ADVISORY_REFRESH_MS);
  const tcf = useAwcResource(on.awcTcf, loadTcf, null, OUTLOOK_REFRESH_MS);

  // ── Navigation: for the map view, snapped to a grid so neighbours share a CDN entry.
  // Whole zoom levels: every gate and grid step is an integer zoom, and the
  // fractional value changes on every frame of a pinch.
  const zoom = Math.floor(Number(viewport?.zoom) || 0);
  const navBbox = useMemo(() => {
    if (!Number.isFinite(viewport?.longitude) || !Number.isFinite(viewport?.latitude)) return null;
    const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const h = typeof window !== 'undefined' ? window.innerHeight : 800;
    return snappedBbox(viewportBounds(viewport, w, h), bboxStepForZoom(zoom));
  }, [viewport, zoom]);
  const navReady = useMemo(() => Object.fromEntries(Object.keys(AWC_NAV_ROUTES).map((k) => [
    k, Boolean(on[k] && navBbox && zoom >= (AWC_LAYER_BY_KEY[k].minZoom ?? 0)),
  ])), [on, navBbox, zoom]);
  const navArgs = (key) => ({ route: AWC_NAV_ROUTES[key], bbox: navBbox });
  const airports = useAwcResource(navReady.awcAirports, loadNav, navArgs('awcAirports'));
  const stations = useAwcResource(navReady.awcStations, loadNav, navArgs('awcStations'));
  const navaids = useAwcResource(navReady.awcNavaids, loadNav, navArgs('awcNavaids'));
  const fixes = useAwcResource(navReady.awcFixes, loadNav, navArgs('awcFixes'));
  const obstacles = useAwcResource(navReady.awcObstacles, loadNav, navArgs('awcObstacles'));
  const features = useAwcResource(navReady.awcFeatures, loadNav, navArgs('awcFeatures'));

  // ── Text products
  const autoOffice = useMemo(
    () => (on.awcFcstDisc ? nearestOffice(viewport?.latitude, viewport?.longitude) : null),
    [on.awcFcstDisc, viewport?.latitude, viewport?.longitude],
  );
  const officeId = settings.fcstdisc.office === 'auto' ? autoOffice?.id ?? null : settings.fcstdisc.office;
  const windtemp = useAwcResource(on.awcWindTemp, loadText, { route: 'windtemp', params: settings.windtemp }, OUTLOOK_REFRESH_MS);
  const fcstdisc = useAwcResource(Boolean(on.awcFcstDisc && officeId), loadText,
    { route: 'fcstdisc', params: { cwa: officeId?.toLowerCase(), type: settings.fcstdisc.type } }, OUTLOOK_REFRESH_MS);
  const mis = useAwcResource(on.awcMis, loadText, { route: 'mis', params: {} }, ADVISORY_REFRESH_MS);
  const areafcst = useAwcResource(on.awcAreaFcst, loadText, { route: 'areafcst', params: settings.areafcst }, OUTLOOK_REFRESH_MS);

  const setSetting = useCallback((product, patch) => {
    setSettings((s) => ({ ...s, [product]: { ...s[product], ...patch } }));
  }, []);

  const hazardFilter = useMemo(() => enabledHazards(layers), [layers]);

  const value = useMemo(() => {
    // Map data per drawer switch (null while off or not loaded).
    const sources = {
      awcMetarTaf: metars.data?.geojson ?? null,
      awcPirep: pireps.data ?? null,
      awcSigmetUs: sigmets.data?.us ?? null,
      awcSigmetIntl: sigmets.data?.intl ?? null,
      awcCwa: cwas.data ?? null,
      awcGairmetSierra: gairmets.data?.SIERRA ?? null,
      awcGairmetTango: gairmets.data?.TANGO ?? null,
      awcGairmetZulu: gairmets.data?.ZULU ?? null,
      awcAirmetAk: airmets.data ?? null,
      awcTcf: tcf.data ?? null,
      awcAirports: airports.data ?? null,
      awcStations: stations.data ?? null,
      awcNavaids: navaids.data ?? null,
      awcFixes: fixes.data ?? null,
      awcObstacles: obstacles.data ?? null,
      awcFeatures: features.data ?? null,
    };
    const resource = {
      awcMetarTaf: metars, awcPirep: pireps, awcSigmetUs: sigmets, awcSigmetIntl: sigmets, awcCwa: cwas,
      awcGairmetSierra: gairmets, awcGairmetTango: gairmets, awcGairmetZulu: gairmets, awcAirmetAk: airmets,
      awcTcf: tcf, awcAirports: airports, awcStations: stations, awcNavaids: navaids, awcFixes: fixes,
      awcObstacles: obstacles, awcFeatures: features,
      awcWindTemp: windtemp, awcFcstDisc: fcstdisc, awcMis: mis, awcAreaFcst: areafcst,
    };
    const visible = Object.fromEntries(Object.keys(sources).map((k) => [
      k, Boolean(on[k] && sources[k] && (!AWC_NAV_ROUTES[k] || navReady[k])),
    ]));

    // Drawer status line per switch.
    const status = {};
    for (const [k, r] of Object.entries(resource)) {
      const minZoom = AWC_LAYER_BY_KEY[k]?.minZoom;
      const count = sources[k]?.features?.length ?? null;
      status[k] = {
        loading: Boolean(on[k] && r.loading && !r.data),
        error: on[k] ? r.error : null,
        fetchedAt: r.fetchedAt,
        count,
        needsZoom: Boolean(on[k] && minZoom && zoom < minZoom),
        // Navigation and PIREP queries return at most 400; say so rather than imply that's all.
        truncated: Boolean((AWC_NAV_ROUTES[k] || k === 'awcPirep') && count != null && count >= AWC_MAX_RESULTS),
      };
    }

    // Shapes on the map per hazard switch, across the advisory sources that are on.
    const advisoryKeys = ['awcSigmetUs', 'awcSigmetIntl', 'awcCwa', 'awcGairmetSierra', 'awcGairmetTango', 'awcGairmetZulu', 'awcAirmetAk', 'awcTcf'];
    const hazardCounts = Object.fromEntries(AWC_HAZARD_TOGGLES.map((t) => [t.key, 0]));
    for (const k of advisoryKeys) {
      if (!visible[k]) continue;
      for (const f of sources[k].features) {
        const t = AWC_HAZARD_TOGGLES.find((h) => h.hz.includes(f.properties.hz));
        if (t) hazardCounts[t.key] += 1;
      }
    }

    return {
      active,
      on,
      visible,
      sources,
      status,
      hazardFilter,
      hazardCounts,
      metarById: metars.data?.byId ?? null,
      text: {
        awcWindTemp: windtemp.current ? windtemp.data : null,
        awcFcstDisc: fcstdisc.current ? fcstdisc.data : null,
        awcMis: mis.data,
        awcAreaFcst: areafcst.current ? areafcst.data : null,
      },
      settings,
      setSetting,
      autoOffice,
      officeId,
      zoom,
    };
  }, [active, on, navReady, zoom, metars, pireps, sigmets, gairmets, airmets, cwas, tcf, airports, stations, navaids,
    fixes, obstacles, features, windtemp, fcstdisc, mis, areafcst, settings, setSetting, autoOffice, officeId, hazardFilter]);

  return <AwcContext.Provider value={value}>{children}</AwcContext.Provider>;
}

/** null outside the provider (e.g. in isolated component tests). */
export function useAwcContext() {
  return useContext(AwcContext);
}
