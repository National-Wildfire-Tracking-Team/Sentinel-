/**
 * RadarSiteContext.jsx
 * State for the Weather and All Hazards tabs' Radar Site layer: the NEXRAD/TDWR station list,
 * which single station is selected, and that station's latest Level 3 scan
 * (see api/nexradLevel3.js; data source as used by supercell-wx).
 *
 * The on/off switch stays in AppContext (layers.radarSites) like every other
 * layer. Nothing is downloaded for a station until it is clicked, and only the
 * selected station is ever polled, so radar is shown for one site at a time.
 * Switching stations drops the previous sweep immediately, and so does
 * switching what's shown (kind: radar, velocity, correlation coefficient or
 * differential reflectivity). TDWRs have no CC or ZDR: they show reflectivity
 * while one of those is chosen.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchDownStations, fetchScan, latestScanKey, siteProduct } from '../api/nexradLevel3';
import { decodeSweepAsync, warmRadarScanWorker } from '../utils/radarSiteRender';
import { DBZ_MAX } from '../utils/radarSweep';

const RadarSiteContext = createContext(null);
const REFRESH_MS = 60 * 1000; // N0B publishes every ~1.5–6 min depending on VCP
const STALE_MS = 20 * 60 * 1000;
const STATUS_REFRESH_MS = 5 * 60 * 1000; // which stations are down (NWS)
const NONE_DOWN = new Set();

const IDLE = { status: 'idle', siteId: null, kind: null, key: null, scan: null, sweep: null, error: null };

/** @param {{ active: boolean, children: any }} props  active: layer on and Weather tab shown */
export function RadarSiteProvider({ active, children }) {
  const [sites, setSites] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [chosenKind, setKind] = useState('reflectivity');
  const [state, setState] = useState(IDLE);
  const [reloadKey, setReloadKey] = useState(0);
  // Radar Site drawer: "Reflectivity Gates" L/H (dBZ; H at DBZ_MAX = no upper limit) and opacity (0…1).
  const [dbzLow, setDbzLow] = useState(0);
  const [dbzHigh, setDbzHigh] = useState(DBZ_MAX);
  const [opacity, setOpacity] = useState(1);

  // Station list is bundled but split out; load it the first time the layer turns on.
  useEffect(() => {
    if (!active || sites) return;
    warmRadarScanWorker();
    let cancelled = false;
    import('../data/radarSites.json').then((m) => { if (!cancelled) setSites(m.default); });
    return () => { cancelled = true; };
  }, [active, sites]);

  // Which stations are down, refreshed while the layer is on; a failed check keeps the last answer.
  const [downIds, setDownIds] = useState(NONE_DOWN);
  useEffect(() => {
    if (!active) return undefined;
    const controller = new AbortController();
    const load = () => fetchDownStations({ signal: controller.signal })
      .then(setDownIds)
      .catch(() => {});
    load();
    const id = setInterval(load, STATUS_REFRESH_MS);
    return () => { controller.abort(); clearInterval(id); };
  }, [active]);

  const site = useMemo(() => sites?.find((s) => s.id === selectedId) ?? null, [sites, selectedId]);
  const kind = !site || siteProduct(site, chosenKind) ? chosenKind : 'reflectivity';

  // A different station (or none) or product never shows the previous one's sweep.
  useEffect(() => { setState(IDLE); }, [selectedId, kind]);

  // Load the selected station's newest scan, then poll for newer ones.
  useEffect(() => {
    if (!active || !site) return undefined;
    const controller = new AbortController();
    const { signal } = controller;
    let currentKey = null;

    const load = async () => {
      try {
        if (!currentKey) setState((s) => ({ ...s, siteId: site.id, kind, status: 'loading', error: null }));
        const key = await latestScanKey(site, { kind, signal });
        if (signal.aborted) return;
        if (!key) {
          setState({ ...IDLE, siteId: site.id, kind, status: 'empty' });
          return;
        }
        if (key === currentKey) return;
        const buffer = await fetchScan(key, { signal });
        const { scan, sweep } = await decodeSweepAsync(buffer);
        if (signal.aborted) return;
        currentKey = key;
        setState({ status: 'ready', siteId: site.id, kind, key, scan, sweep, error: null });
      } catch (error) {
        if (signal.aborted || error?.name === 'AbortError') return;
        // Keep the last good sweep on a failed refresh; its time shows its age.
        setState((s) => ({ ...s, siteId: site.id, kind, status: s.sweep ? 'ready' : 'error', error }));
      }
    };

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { controller.abort(); clearInterval(id); };
  }, [active, site, kind, reloadKey]);

  const selectSite = useCallback((id) => setSelectedId(id || null), []);
  // A pill click: the selected station again turns its radar off.
  const toggleSite = useCallback((id) => setSelectedId((current) => (current === id ? null : id || null)), []);
  const clearSite = useCallback(() => setSelectedId(null), []);
  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const value = useMemo(() => {
    // Until the reset above runs, state can still hold the previous station's or product's scan: never show it.
    const own = state.siteId === selectedId && state.kind === kind ? state : IDLE;
    const scanTime = own.scan?.time ?? null;
    return {
      active,
      sites,
      site,
      selectedId,
      product: site ? siteProduct(site, kind) : null,
      downIds,
      siteDown: Boolean(site && downIds.has(site.id)),
      ...own,
      kind,
      chosenKind,
      setKind,
      stale: scanTime != null && Date.now() - scanTime > STALE_MS,
      dbzLow,
      setDbzLow,
      dbzHigh,
      setDbzHigh,
      opacity,
      setOpacity,
      selectSite,
      toggleSite,
      clearSite,
      retry,
    };
  }, [active, sites, site, selectedId, downIds, kind, chosenKind, state, dbzLow, dbzHigh, opacity, selectSite, toggleSite, clearSite, retry]);

  return <RadarSiteContext.Provider value={value}>{children}</RadarSiteContext.Provider>;
}

export function useRadarSiteContext() {
  return useContext(RadarSiteContext);
}
