/**
 * RadarSiteContext.jsx
 * State for the Weather tab's Radar Site layer: the NEXRAD/TDWR station list,
 * which single station is selected, and that station's latest Level 3 scan
 * (see api/nexradLevel3.js; data source as used by supercell-wx).
 *
 * The on/off switch stays in AppContext (layers.radarSites) like every other
 * layer. Nothing is downloaded for a station until it is clicked, and only the
 * selected station is ever polled, so radar is shown for one site at a time.
 * Switching stations drops the previous sweep immediately.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SITE_PRODUCT, fetchScan, latestScanKey } from '../api/nexradLevel3';
import { decodeSweepAsync, warmRadarScanWorker } from '../utils/radarSiteRender';

const RadarSiteContext = createContext(null);
const REFRESH_MS = 60 * 1000; // N0B publishes every ~1.5–6 min depending on VCP
const STALE_MS = 20 * 60 * 1000;

const IDLE = { status: 'idle', siteId: null, key: null, scan: null, sweep: null, error: null };

/** @param {{ active: boolean, children: any }} props  active: layer on and Weather tab shown */
export function RadarSiteProvider({ active, children }) {
  const [sites, setSites] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [state, setState] = useState(IDLE);
  const [reloadKey, setReloadKey] = useState(0);

  // Station list is bundled but split out; load it the first time the layer turns on.
  useEffect(() => {
    if (!active || sites) return;
    warmRadarScanWorker();
    let cancelled = false;
    import('../data/radarSites.json').then((m) => { if (!cancelled) setSites(m.default); });
    return () => { cancelled = true; };
  }, [active, sites]);

  const site = useMemo(() => sites?.find((s) => s.id === selectedId) ?? null, [sites, selectedId]);

  // A different station (or none) never shows the previous station's sweep.
  useEffect(() => { setState(IDLE); }, [selectedId]);

  // Load the selected station's newest scan, then poll for newer ones.
  useEffect(() => {
    if (!active || !site) return undefined;
    const controller = new AbortController();
    const { signal } = controller;
    let currentKey = null;

    const load = async () => {
      try {
        if (!currentKey) setState((s) => ({ ...s, siteId: site.id, status: 'loading', error: null }));
        const key = await latestScanKey(site, { signal });
        if (signal.aborted) return;
        if (!key) {
          setState({ ...IDLE, siteId: site.id, status: 'empty' });
          return;
        }
        if (key === currentKey) return;
        const buffer = await fetchScan(key, { signal });
        const { scan, sweep } = await decodeSweepAsync(buffer);
        if (signal.aborted) return;
        currentKey = key;
        setState({ status: 'ready', siteId: site.id, key, scan, sweep, error: null });
      } catch (error) {
        if (signal.aborted || error?.name === 'AbortError') return;
        // Keep the last good sweep on a failed refresh; its time shows its age.
        setState((s) => ({ ...s, siteId: site.id, status: s.sweep ? 'ready' : 'error', error }));
      }
    };

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { controller.abort(); clearInterval(id); };
  }, [active, site, reloadKey]);

  const selectSite = useCallback((id) => setSelectedId(id || null), []);
  const clearSite = useCallback(() => setSelectedId(null), []);
  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const value = useMemo(() => {
    // Until the reset above runs, state can still hold the previous station's scan: never show it.
    const own = state.siteId === selectedId ? state : IDLE;
    const scanTime = own.scan?.time ?? null;
    return {
      active,
      sites,
      site,
      selectedId,
      product: site ? SITE_PRODUCT[site.type] : null,
      ...own,
      stale: scanTime != null && Date.now() - scanTime > STALE_MS,
      selectSite,
      clearSite,
      retry,
    };
  }, [active, sites, site, selectedId, state, selectSite, clearSite, retry]);

  return <RadarSiteContext.Provider value={value}>{children}</RadarSiteContext.Provider>;
}

export function useRadarSiteContext() {
  return useContext(RadarSiteContext);
}
