/**
 * WeatherModelsContext.jsx
 * State for the live map's Models tab: which model (HRRR / GFS / Compare),
 * which compare view (swipe / difference), which variable, which valid time,
 * playback, wind particles, and the point the user clicked to inspect.
 *
 * The field manifest (what runs, hours and variables exist) is refreshed
 * every 5 minutes while the tab is open, so a new model run shows up without
 * a reload. So the tab draws at once: the last manifest is kept on the
 * device, a fresh one is fetched when the map page goes idle, and hovering
 * the tab (warm()) also fetches the first frame.
 *
 * HAFS (mode 'hafs') is the hurricane model: its fields are per storm and
 * per run (useHafs), so in that mode the timeline, variables and valid time
 * come from the selected HAFS run, and point forecasts (HRRR/GFS only) pause.
 *
 * It's a context so that stepping through forecast time re-renders only the
 * Models pieces, never the whole live map page. The tab's model, variable,
 * view and inspected point are mirrored into the URL so a view can be shared.
 */

import { createContext, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useViewport } from './ViewportContext';
import { MODEL_MODES, useWeatherModels } from '../hooks/useWeatherModels';
import { fieldUrl, fieldsBase, hourAt, loadFieldManifest, preconnectFields, readCachedManifest } from '../api/modelFields';
import { preloadFrame } from '../hooks/usePreloadFrames';
import { WEATHER_MODEL_SERVICE_URL } from '../api/weatherModels';
import { nowIndex } from '../components/WeatherModels/modelTheme';
import { URL_KEYS, modelsHref, parseModelsQuery } from '../utils/weatherModelsLink';
import { COMPARE_VIEWS, timelineFor, variablesFor } from '../utils/modelFieldSelection';
import { HAFS_URL } from '../api/hafs';
import { useHafs } from '../hooks/useHafs';
import { DEFAULT_HAFS_FIELD, effectiveHafsField, hafsFields, hafsFrameAt, hafsTimeline } from '../utils/hafsSelection';

const WeatherModelsContext = createContext(null);
const MANIFEST_REFRESH_MS = 5 * 60 * 1000;
const MODES = HAFS_URL ? [...MODEL_MODES, 'hafs'] : MODEL_MODES;
/**
 * @param {{ active: boolean, onOpen?: () => void, apiRef?: object, children: any }} props
 *   active  — the Models tab is selected (otherwise only the manifest is fetched, once, when idle)
 *   onOpen  — asks the page to switch to the Models tab (from an incident link)
 *   apiRef  — receives { pick({lat, lon}), warm() }: the page's map click inspects a point;
 *             warm() (tab hover/focus) fetches the manifest and the frame the tab opens on
 */
export function WeatherModelsProvider({ active, onOpen, apiRef, children }) {
  const initial = useMemo(() => parseModelsQuery(window.location.search), []);
  const { setViewport } = useViewport();

  const [manifestState, setManifestState] = useState(() => ({ manifest: readCachedManifest(), error: null }));
  const [mode, setModeState] = useState(MODES.includes(initial?.mode) ? initial.mode : 'hrrr');
  const [compareView, setCompareView] = useState(COMPARE_VIEWS.includes(initial?.view) ? initial.view : 'swipe');
  const [variable, setVariableState] = useState(initial?.mode !== 'hafs' && initial?.variable ? initial.variable : 'temperature');
  const [hafsFieldChoice, setHafsField] = useState(initial?.mode === 'hafs' && initial?.variable ? initial.variable : DEFAULT_HAFS_FIELD);
  const [hafsChoice, setHafsChoice] = useState(() => ({ storm: initial?.storm ?? undefined }));
  const [validTimeChoice, setValidTime] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [particles, setParticles] = useState(false);
  const [location, setLocationState] = useState(initial?.location ?? null);

  // ── manifest ──
  const loadManifest = useCallback(() => loadFieldManifest()
    .then((manifest) => { setManifestState({ manifest, error: null }); return manifest; }), []);

  useEffect(() => {
    if (!active || !WEATHER_MODEL_SERVICE_URL) return undefined;
    let cancelled = false;
    const load = () => loadFieldManifest()
      .then((manifest) => { if (!cancelled) setManifestState({ manifest, error: null }); })
      .catch((error) => { if (!cancelled) setManifestState((s) => ({ manifest: s.manifest, error })); });
    load();
    const id = setInterval(load, MANIFEST_REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [active]);

  // Before the tab is opened: connect to the CDN now, and fetch the manifest
  // once the page is idle, so opening the tab doesn't wait on either.
  useEffect(() => {
    if (active || !WEATHER_MODEL_SERVICE_URL) return undefined;
    preconnectFields();
    const prefetch = () => { loadManifest().catch(() => {}); };
    if (window.requestIdleCallback) {
      const id = window.requestIdleCallback(prefetch, { timeout: 5000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(prefetch, 2000);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { manifest } = manifestState;

  // ── HAFS ──
  const isHafs = mode === 'hafs';
  const hafsData = useHafs({ active: active && isHafs, choice: hafsChoice });
  const { sel: hafsSel, detail: hafsDetail } = hafsData;
  const hafsFieldList = useMemo(
    () => hafsFields(hafsData.catalog, hafsDetail, hafsSel?.domain),
    [hafsData.catalog, hafsDetail, hafsSel?.domain],
  );
  const hafsField = effectiveHafsField(hafsFieldList, hafsFieldChoice);

  // Choosing a storm (or opening HAFS) centres the map on it once its run loads.
  const [flyTo, setFlyTo] = useState(isHafs ? (initial?.storm ?? true) : null);
  const chooseHafs = useCallback((patch) => {
    setHafsChoice((c) => ({ ...c, ...patch }));
    if (patch.storm || patch.domain) setFlyTo(patch.storm ?? true);
  }, []);

  // ── selection, kept valid against what the manifest offers ──
  const fieldVariables = useMemo(() => variablesFor(manifest, mode, compareView), [manifest, mode, compareView]);
  const variables = isHafs ? hafsFieldList : fieldVariables;
  const selected = fieldVariables.find((v) => v.id === variable);
  const effectiveVariable = isHafs ? hafsField : selected && !selected.available
    ? (fieldVariables.find((v) => v.available && v.quantity === selected.quantity)?.id ?? fieldVariables.find((v) => v.available)?.id)
    : variable;

  const fieldTimeline = useMemo(() => timelineFor(manifest, mode, compareView), [manifest, mode, compareView]);
  const hafsTimes = useMemo(() => hafsTimeline(hafsDetail, hafsSel?.domain), [hafsDetail, hafsSel?.domain]);
  const timeline = isHafs ? hafsTimes : fieldTimeline;
  const validTime = timeline.length
    ? (timeline.includes(validTimeChoice) ? validTimeChoice : timeline[nowIndex(timeline.map((t) => ({ validTime: t })))])
    : null;

  const setMode = useCallback((m) => {
    if (!MODES.includes(m)) return;
    if (m === 'hafs') setFlyTo(true); // (re)centre on the storm
    setModeState(m);
  }, []);
  const setVariable = useCallback((v) => (isHafs ? setHafsField(v) : setVariableState(v)), [isHafs]);

  useEffect(() => {
    if (!isHafs || !flyTo || !hafsDetail || !hafsSel) return;
    if (flyTo !== true && hafsSel.storm.key !== flyTo) return;
    const frame = hafsFrameAt(hafsDetail, hafsSel.domain, hafsTimes[0]);
    if (!frame) return;
    const [w, s, e, n] = frame.bounds;
    setViewport({ longitude: (w + e) / 2, latitude: (s + n) / 2, zoom: hafsSel.domain === 'storm' ? 5 : 3 });
    setFlyTo(null);
  }, [isHafs, flyTo, hafsDetail, hafsSel, hafsTimes, setViewport]);

  // ── point inspection (full-precision values from the point API; not for HAFS) ──
  const point = useWeatherModels({
    location, requestedMode: isHafs ? 'hrrr' : mode, active: active && Boolean(location) && !isHafs,
  });

  const setLocation = useCallback((loc, { fly = true } = {}) => {
    setLocationState(loc);
    if (fly && loc) setViewport({ longitude: loc.lon, latitude: loc.lat, zoom: 7 });
  }, [setViewport]);
  const clearLocation = useCallback(() => setLocationState(null), []);

  const open = useCallback(({ lat, lon, place, model }) => {
    setLocation({ lat, lon, place: place || null });
    if (MODEL_MODES.includes(model)) setModeState(model);
    onOpen?.();
  }, [setLocation, onOpen]);

  // Tab hover/focus: the manifest, then the frame the tab will open on.
  const warm = useCallback(() => {
    if (active || isHafs || !WEATHER_MODEL_SERVICE_URL || (mode === 'compare' && compareView === 'difference')) return;
    loadManifest().then((m) => {
      const model = mode === 'gfs' ? 'gfs' : 'hrrr';
      const times = timelineFor(m, mode, compareView);
      const t = times[nowIndex(times.map((v) => ({ validTime: v })))];
      const hour = t && hourAt(m, model, t);
      if (hour != null && m.variables[variable]?.models.includes(model)) {
        preloadFrame(fieldUrl(fieldsBase(), m, model, variable, hour, 'lo'));
      }
    }).catch(() => {});
  }, [active, isHafs, loadManifest, mode, compareView, variable]);

  useImperativeHandle(apiRef, () => ({
    pick: ({ lat, lon }) => setLocation({ lat, lon, place: null }, { fly: false }),
    warm,
  }), [setLocation, warm]);

  // Arriving from a shared link with a point: center the map on it.
  useEffect(() => {
    if (initial?.location) setViewport({ longitude: initial.location.lon, latitude: initial.location.lat, zoom: 6 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mirror the tab into the URL (replaceState: nothing else needs to re-render).
  useEffect(() => {
    const url = new URL(window.location.href);
    for (const k of URL_KEYS) url.searchParams.delete(k);
    if (active) {
      const target = new URL(modelsHref({
        ...location, model: mode, variable: effectiveVariable, view: compareView, storm: isHafs ? hafsSel?.storm.atcfId : null,
      }), url.origin);
      for (const [k, v] of target.searchParams) url.searchParams.set(k, v);
    }
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
  }, [active, location, mode, effectiveVariable, compareView, isHafs, hafsSel?.storm.atcfId]);

  const value = useMemo(() => ({
    active,
    manifest,
    manifestError: manifestState.error,
    mode,
    setMode,
    compareView,
    setCompareView,
    variable: effectiveVariable,
    variableSwitched: isHafs
      ? (hafsDetail && hafsField !== hafsFieldChoice ? hafsFieldList.find((f) => f.id === hafsFieldChoice)?.reason ?? null : null)
      : effectiveVariable !== variable ? selected?.reason : null,
    setVariable,
    variables,
    timeline,
    validTime,
    setValidTime,
    playing,
    setPlaying,
    particles,
    setParticles,
    units: 'us',
    location,
    setLocation,
    clearLocation,
    point,
    open,
    modes: MODES,
    hafs: {
      ...hafsData,
      choose: chooseHafs,
      fields: hafsFieldList,
      frame: isHafs ? hafsFrameAt(hafsDetail, hafsSel?.domain, validTime) : null,
    },
  }), [active, manifest, manifestState.error, mode, setMode, compareView, effectiveVariable, variable, selected,
    setVariable, variables, timeline, validTime, playing, particles, location, setLocation, clearLocation, point, open,
    isHafs, hafsData, chooseHafs, hafsFieldList, hafsField, hafsFieldChoice, hafsDetail, hafsSel?.domain]);

  return <WeatherModelsContext.Provider value={value}>{children}</WeatherModelsContext.Provider>;
}

/** The Models tab state, or null outside the live map (e.g. in tests). */
// eslint-disable-next-line react-refresh/only-export-components -- context hook beside its provider, as ThemeContext does
export function useWeatherModelsContext() {
  return useContext(WeatherModelsContext);
}
