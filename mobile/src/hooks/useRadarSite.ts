/**
 * Individual Radar Site state (the web's RadarSiteContext): which stations are down, the selected
 * station and product, and its newest sweep drawn as a map image. Only the selected station is
 * listed and downloaded; it re-checks for a newer scan every minute.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DBZ_MAX,
  RADAR_SITES,
  fetchDownStations,
  fetchScan,
  latestScanKey,
  siteProduct,
  type RadarKind,
} from '@/data/radarSites';
import { HAS_SKIA } from '@/lib/skia';
import type { SweepImage, SweepTextures } from '@/map/radarSweepImage';

// Drawing sweeps needs Skia; without it the station pills and scan details still work.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sweepRenderer: typeof import('@/map/radarSweepImage') | null = HAS_SKIA ? require('@/map/radarSweepImage') : null;

const REFRESH_MS = 60_000;
const STATUS_REFRESH_MS = 5 * 60_000;
const STALE_MS = 20 * 60_000;

export interface RadarScanInfo {
  time: number;
  elevation: number;
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'ready'; key: string; info: RadarScanInfo };

export function useRadarSite(active: boolean) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chosenKind, setKind] = useState<RadarKind>('reflectivity');
  const [downIds, setDownIds] = useState<Set<string>>(() => new Set());
  const [load, setLoad] = useState<LoadState>({ status: 'idle' });
  const [textures, setTextures] = useState<SweepTextures | null>(null);
  const [image, setImage] = useState<SweepImage | null>(null);
  const [dbzLow, setDbzLow] = useState(0);
  const [dbzHigh, setDbzHigh] = useState(DBZ_MAX);
  const [opacity, setOpacity] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const site = useMemo(() => RADAR_SITES.find(s => s.id === selectedId) ?? null, [selectedId]);
  // TDWRs have no CC or ZDR; fall back to reflectivity for them.
  const kind: RadarKind = !site || siteProduct(site, chosenKind) ? chosenKind : 'reflectivity';

  // Which stations are down, while the layer is on.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const run = () =>
      fetchDownStations()
        .then(ids => !cancelled && setDownIds(ids))
        .catch(() => {});
    const first = setTimeout(run, 0);
    const timer = setInterval(run, STATUS_REFRESH_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [active]);

  // The selected station's newest scan, then poll for newer ones. A new station or product never
  // shows the previous sweep.
  useEffect(() => {
    const reset = setTimeout(() => {
      setTextures(null);
      setImage(null);
      setLoad({ status: site && active ? 'loading' : 'idle' });
    }, 0);
    if (!active || !site) return () => clearTimeout(reset);
    let cancelled = false;
    let currentKey: string | null = null;
    const run = async () => {
      try {
        const key = await latestScanKey(site, kind);
        if (cancelled) return;
        if (!key) {
          setLoad({ status: 'empty' });
          return;
        }
        if (key === currentKey) return;
        const scan = await fetchScan(key);
        if (cancelled) return;
        currentKey = key;
        if (sweepRenderer) setTextures(sweepRenderer.sweepTextures(scan));
        else setLoad({ status: 'error', message: 'Update the app to draw radar sweeps' });
        setLoad({ status: 'ready', key, info: { time: scan.time, elevation: scan.elevation } });
      } catch (err: any) {
        // Keep the last good sweep on a failed refresh; its time shows its age.
        if (!cancelled && !currentKey) setLoad({ status: 'error', message: err?.message || 'Radar unavailable' });
      }
    };
    const first = setTimeout(run, 0);
    const timer = setInterval(() => {
      setNow(Date.now());
      run();
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      clearTimeout(reset);
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [active, site, kind, reloadKey]);

  // Draw the sweep, again whenever the reflectivity gates change.
  const renderId = useRef(0);
  useEffect(() => {
    if (!textures || !sweepRenderer) return;
    const id = ++renderId.current;
    const filtered = kind === 'reflectivity';
    const min = filtered ? Math.max(2, sweepRenderer.dbzToLevel(textures.scan, dbzLow)) : 2;
    const max = filtered && dbzHigh < DBZ_MAX ? sweepRenderer.dbzToLevel(textures.scan, dbzHigh) - 1 : 255;
    sweepRenderer
      .renderSweep(textures, min, max)
      .then(img => id === renderId.current && setImage(img))
      .catch(err => id === renderId.current && setLoad({ status: 'error', message: err?.message || 'Radar drawing failed' }));
  }, [textures, kind, dbzLow, dbzHigh]);

  const toggleSite = useCallback((id: string) => setSelectedId(cur => (cur === id ? null : id)), []);
  const clearSite = useCallback(() => setSelectedId(null), []);
  const retry = useCallback(() => setReloadKey(k => k + 1), []);

  const sitesShape = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: RADAR_SITES.map(s => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: { id: s.id, down: downIds.has(s.id) },
      })),
    }),
    [downIds],
  );

  const info = load.status === 'ready' ? load.info : null;
  return {
    site,
    selectedId,
    toggleSite,
    clearSite,
    kind,
    setKind,
    product: siteProduct(site, kind),
    load,
    retry,
    image: active && site ? image : null,
    info,
    stale: info != null && now - info.time > STALE_MS,
    siteDown: Boolean(site && downIds.has(site.id)),
    sitesShape,
    dbzLow,
    setDbzLow,
    dbzHigh,
    setDbzHigh,
    opacity,
    setOpacity,
  };
}

export type RadarSiteState = ReturnType<typeof useRadarSite>;
