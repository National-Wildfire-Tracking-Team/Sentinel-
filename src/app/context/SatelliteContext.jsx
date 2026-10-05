/**
 * SatelliteContext.jsx
 * State for the live map's Satellite layer: which satellite, region and
 * product, the latest scan time, the recent-imagery loop and its playback,
 * opacity, and whether the satellite control panel is open.
 *
 * Like MrmsContext, the on/off switch stays in AppContext (layers.satellite)
 * so tab presets and the layer panel treat it like every other layer, and
 * everything else lives here so stepping frames re-renders only the
 * satellite pieces. Whether the panel is open is owned by the page (it
 * shares the dock above the bottom bar with other layers' controls) and
 * passed in.
 *
 * Nothing is fetched until the layer is on. Then only the current
 * selection's timestamp (IEM JSON or GIBS DescribeDomains) is requested and
 * refreshed; changing the selection aborts the previous request.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_SELECTION, LOOP_HOURS, fetchGibsFrameTimes, fetchIemScanTime, getProduct, getRegion,
  getSatellite, iemScanTimeUrl, loopAvailable, loopFrames, normalizeSelection, parseSatelliteQuery,
  regionsFor, resolveSource, writeSatelliteQuery,
} from '../api/goesSatellite';
import { useFramePlayback } from '../hooks/useFramePlayback';

const SatelliteContext = createContext(null);
const IEM_REFRESH_MS = 2 * 60 * 1000;
const GIBS_REFRESH_MS = 5 * 60 * 1000;
const FRAME_MS = 500;
const LAST_FRAME_HOLD = 3;

function initialState() {
  const fromUrl = typeof window !== 'undefined' ? parseSatelliteQuery(window.location.search) : null;
  return fromUrl ? normalizeSelection(fromUrl) : { selection: DEFAULT_SELECTION, notice: null };
}

/**
 * @param {{ active: boolean, panelOpen?: boolean, onPanelOpenChange?: (open: boolean) => void, children: any }} props
 *   active: the layer is on and its tab is shown
 */
export function SatelliteProvider({ active, panelOpen = false, onPanelOpenChange, children }) {
  const [initial] = useState(initialState);
  const [selection, setSelection] = useState(initial.selection);
  const [notice, setNotice] = useState(initial.notice);
  const [opacity, setOpacity] = useState(0.7);
  const [loopHours, setLoopHours] = useState(LOOP_HOURS[0]);
  const [iem, setIem] = useState({ key: null, time: null, error: null, loading: false });
  const [gibs, setGibs] = useState({ key: null, times: [], error: null, loading: false });
  const [tileError, setTileError] = useState(false);
  const [tilesLoading, setTilesLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [focus, setFocus] = useState(null); // { bounds, seq }: the map zooms to a region the user picked
  const focusSeq = useRef(0);

  const { satellite, region, product } = selection;
  const productDef = getProduct(product);
  const regionDef = getRegion(region);
  const canLoop = loopAvailable(product, region);
  const liveSource = useMemo(() => resolveSource(selection), [selection]);

  // ── Latest IEM scan time (and the tile cache-buster) ──
  const iemUrl = active && liveSource?.kind === 'iem' ? iemScanTimeUrl(satellite, region, product) : null;
  useEffect(() => {
    if (!iemUrl) return undefined;
    const controller = new AbortController();
    const load = () => {
      setIem((s) => ({ key: iemUrl, time: s.key === iemUrl ? s.time : null, error: null, loading: true }));
      fetchIemScanTime(iemUrl, { signal: controller.signal })
        .then((time) => setIem({ key: iemUrl, time, error: null, loading: false }))
        .catch((error) => {
          if (error?.name === 'AbortError') return;
          setIem((s) => ({ ...s, key: iemUrl, error, loading: false }));
        });
    };
    load();
    const id = setInterval(load, IEM_REFRESH_MS);
    return () => { controller.abort(); clearInterval(id); };
  }, [iemUrl, reloadKey]);

  // ── GIBS frame times (loop frames, and the latest frame for GIBS-only products) ──
  // Any frame time resolves to the product's GIBS layer; only layer/level are used here.
  const gibsSource = canLoop ? resolveSource(selection, { frameTime: 'latest' }) : null;
  const gibsKey = active && gibsSource ? `${gibsSource.layer}|${gibsSource.level}` : null;
  useEffect(() => {
    if (!gibsKey) return undefined;
    const [layer, level] = gibsKey.split('|');
    const controller = new AbortController();
    const load = () => {
      setGibs((s) => ({ key: gibsKey, times: s.key === gibsKey ? s.times : [], error: null, loading: true }));
      fetchGibsFrameTimes(layer, Number(level), { signal: controller.signal })
        .then((times) => setGibs({ key: gibsKey, times, error: null, loading: false }))
        .catch((error) => {
          if (error?.name === 'AbortError') return;
          setGibs((s) => ({ ...s, key: gibsKey, error, loading: false }));
        });
    };
    load();
    const id = setInterval(load, GIBS_REFRESH_MS);
    return () => { controller.abort(); clearInterval(id); };
  }, [gibsKey, reloadKey]);

  const gibsTimes = useMemo(() => (gibs.key === gibsKey ? gibs.times : []), [gibs, gibsKey]);
  const frames = useMemo(() => (canLoop ? loopFrames(gibsTimes, loopHours) : []), [canLoop, gibsTimes, loopHours]);
  const {
    frame, index, live, playing, setFrame, goLive, togglePlaying, step, clearChoice,
  } = useFramePlayback(frames, { active, frameMs: FRAME_MS, lastFrameHold: LAST_FRAME_HOLD });

  // What is on the map right now.
  const source = useMemo(() => {
    if (!active) return null;
    if (!live && frame) return resolveSource(selection, { frameTime: frame.time });
    if (liveSource?.kind === 'gibs') {
      const newest = gibsTimes[gibsTimes.length - 1] ?? null;
      return newest ? { ...liveSource, time: newest } : null;
    }
    return liveSource;
  }, [active, live, frame, selection, liveSource, gibsTimes]);

  const imageTime = source?.kind === 'iem'
    ? (iem.key === iemUrl ? iem.time : null)
    : source?.time ?? null;
  const fetchError = source?.kind === 'iem'
    ? (iem.key === iemUrl ? iem.error : null)
    : (gibs.key === gibsKey ? gibs.error : null);
  const metaLoading = (liveSource?.kind === 'iem' && iem.key === iemUrl && iem.loading && !iem.time)
    || (liveSource?.kind === 'gibs' && gibs.loading && !gibsTimes.length);

  // ── Selection changes (never silent: anything forced is explained in `notice`) ──
  const applySelection = useCallback((next, { zoom = false } = {}) => {
    const { selection: normalized, notice: why } = normalizeSelection(next);
    setSelection(normalized);
    setNotice(why);
    setTileError(false);
    clearChoice();
    if (zoom) {
      const bounds = getRegion(normalized.region)?.bounds;
      if (bounds) setFocus({ bounds, seq: (focusSeq.current += 1) });
    }
  }, [clearChoice]);

  const setSatellite = useCallback((id) => {
    const next = { ...selection, satellite: id };
    applySelection(next, { zoom: !getRegion(selection.region)?.satellites.includes(id) });
  }, [selection, applySelection]);
  const setRegion = useCallback((id) => applySelection({ ...selection, region: id }, { zoom: true }), [selection, applySelection]);
  const setProduct = useCallback((id) => applySelection({ ...selection, product: id }), [selection, applySelection]);
  const dismissNotice = useCallback(() => setNotice(null), []);

  const reportTileError = useCallback(() => setTileError(true), []);
  const retry = useCallback(() => { setTileError(false); setReloadKey((k) => k + 1); }, []);

  // ── Mirror the selection into the URL while the layer is on ──
  useEffect(() => {
    const url = writeSatelliteQuery(new URL(window.location.href), active ? selection : null);
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
  }, [active, selection]);

  const openPanel = useCallback(() => onPanelOpenChange?.(true), [onPanelOpenChange]);
  const closePanel = useCallback(() => onPanelOpenChange?.(false), [onPanelOpenChange]);

  let error = null;
  if (active) {
    if (!liveSource) error = 'This product is not available for the selected region.';
    else if (tileError) error = 'Satellite imagery temporarily unavailable.';
    else if (fetchError && !imageTime) error = 'Satellite imagery temporarily unavailable.';
    else if (liveSource.kind === 'gibs' && !metaLoading && !gibsTimes.length && gibs.key === gibsKey && !gibs.loading) {
      error = 'No recent imagery for this product.';
    }
  }

  const value = useMemo(() => ({
    active,
    selection,
    satellite: getSatellite(satellite),
    region: regionDef,
    product: productDef,
    regions: regionsFor(satellite),
    setSatellite,
    setRegion,
    setProduct,
    notice,
    dismissNotice,
    source,
    imageTime,
    loading: active && (metaLoading || tilesLoading),
    setTilesLoading,
    error,
    reportTileError,
    retry,
    reloadKey,
    canLoop,
    loopHours,
    setLoopHours,
    frames,
    frame,
    index,
    live,
    playing,
    setFrame,
    goLive,
    togglePlaying,
    step,
    opacity,
    setOpacity,
    focus,
    panelOpen: active && panelOpen,
    openPanel,
    closePanel,
  }), [active, selection, satellite, regionDef, productDef, setSatellite, setRegion, setProduct, notice, dismissNotice,
    source, imageTime, metaLoading, tilesLoading, error, reportTileError, retry, reloadKey, canLoop, loopHours, frames,
    frame, index, live, playing, setFrame, goLive, togglePlaying, step, opacity, focus, panelOpen, openPanel, closePanel]);

  return <SatelliteContext.Provider value={value}>{children}</SatelliteContext.Provider>;
}

/**
 * Layers whose own controls take the dock (or the same spot) above the bottom
 * bar. Switching one on after the Satellite layer hides the satellite
 * controls; the imagery stays on.
 */
export const SATELLITE_DOCK_RIVALS = ['spcWeatherOutlooks', 'fireWeatherOutlooks', 'ndgdSmokeForecast', 'mrms'];

/** Whether the satellite controls should be open after the layer toggles change from `prev` to `next`. */
export function satellitePanelOpenAfter(prev, next, open) {
  const switchedOn = (key) => Boolean(next[key]) && !prev[key];
  if (!next.satellite) return false;
  if (switchedOn('satellite')) return true;
  if (SATELLITE_DOCK_RIVALS.some(switchedOn)) return false;
  return open;
}

/** null outside the provider (e.g. in isolated component tests). */
export function useSatelliteContext() {
  return useContext(SatelliteContext);
}
