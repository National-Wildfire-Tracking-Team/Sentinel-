/**
 * MrmsContext.jsx
 * State for the Weather tab's MRMS radar layer: which product, which frame
 * (or "live", always the newest), playback and opacity, plus the manifest.
 *
 * The on/off switch stays in AppContext (layers.mrms) so tab presets and
 * the layer panel treat MRMS like every other layer. Everything else lives
 * here so stepping through frames re-renders only the MRMS pieces, never
 * the whole live map page.
 *
 * The manifest is fetched only while the layer is on and visible, and
 * re-fetched every minute (the builder publishes every 2 minutes), so new
 * radar appears without a reload. While "live", the newest frame is shown.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { MRMS_URL, fetchMrmsManifest, manifestIsStale } from '../api/mrms';
import { useFramePlayback } from '../hooks/useFramePlayback';

const MrmsContext = createContext(null);
const MANIFEST_REFRESH_MS = 60 * 1000;
const FRAME_MS = 450;
const LAST_FRAME_HOLD = 3; // extra frames to pause on the newest image before looping

export const DEFAULT_MRMS_PRODUCT = 'reflectivity';

/** @param {{ active: boolean, children: any }} props  active: the layer is on and its tab is shown */
export function MrmsProvider({ active, children }) {
  const [state, setState] = useState({ manifest: null, error: null, loading: false });
  const [product, setProduct] = useState(DEFAULT_MRMS_PRODUCT);
  const [opacity, setOpacity] = useState(0.8);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!active || !MRMS_URL) return undefined;
    let cancelled = false;
    const load = () => {
      setState((s) => ({ ...s, loading: true }));
      fetchMrmsManifest()
        .then((manifest) => { if (!cancelled) setState({ manifest, error: null, loading: false }); })
        // Keep showing the last good manifest; its own timestamps reveal staleness.
        .catch((error) => { if (!cancelled) setState((s) => ({ manifest: s.manifest, error, loading: false })); });
    };
    load();
    const id = setInterval(load, MANIFEST_REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [active, reloadKey]);

  const { manifest } = state;
  const spec = manifest?.products?.[product] ?? null;
  const frames = useMemo(() => spec?.frames ?? [], [spec]);

  // Playback: step through the window, hold on the newest frame, loop.
  const { frame, index, live, playing, setFrame, goLive, togglePlaying, clearChoice } = useFramePlayback(
    frames, { active, frameMs: FRAME_MS, lastFrameHold: LAST_FRAME_HOLD },
  );
  const chooseProduct = useCallback((id) => { setProduct(id); clearChoice(); }, [clearChoice]);
  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const value = useMemo(() => ({
    configured: Boolean(MRMS_URL),
    active,
    manifest,
    error: state.error,
    loading: state.loading && !manifest,
    stale: manifestIsStale(manifest),
    product,
    setProduct: chooseProduct,
    spec,
    frames,
    frame,
    index,
    live,
    setFrame,
    goLive,
    playing,
    togglePlaying,
    opacity,
    setOpacity,
    retry,
  }), [active, manifest, state.error, state.loading, product, chooseProduct, spec, frames, frame, index, live,
    setFrame, goLive, playing, togglePlaying, opacity, retry]);

  return <MrmsContext.Provider value={value}>{children}</MrmsContext.Provider>;
}

/** null outside the provider (e.g. in isolated component tests). */
export function useMrmsContext() {
  return useContext(MrmsContext);
}
