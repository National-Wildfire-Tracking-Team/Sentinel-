/**
 * WeatherModelsContext.jsx
 * State for the live map's Models tab: which model (HRRR / GFS / Compare),
 * which compare view (swipe / difference), which variable, which valid time,
 * playback, wind particles, and the point the user clicked to inspect.
 *
 * The field manifest (what runs, hours and variables exist) is fetched while
 * the tab is open and refreshed every 5 minutes, so a new model run shows up
 * without a reload.
 *
 * It's a context so that stepping through forecast time re-renders only the
 * Models pieces, never the whole live map page. The tab's model, variable,
 * view and inspected point are mirrored into the URL so a view can be shared.
 */

import { createContext, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useViewport } from './ViewportContext';
import { MODEL_MODES, useWeatherModels } from '../hooks/useWeatherModels';
import { fetchFieldManifest } from '../api/modelFields';
import { WEATHER_MODEL_SERVICE_URL } from '../api/weatherModels';
import { nowIndex } from '../components/WeatherModels/modelTheme';
import { URL_KEYS, modelsHref, parseModelsQuery } from '../utils/weatherModelsLink';
import { COMPARE_VIEWS, timelineFor, variablesFor } from '../utils/modelFieldSelection';

const WeatherModelsContext = createContext(null);
const MANIFEST_REFRESH_MS = 5 * 60 * 1000;
/**
 * @param {{ active: boolean, onOpen?: () => void, apiRef?: object, children: any }} props
 *   active  — the Models tab is selected (nothing is fetched otherwise)
 *   onOpen  — asks the page to switch to the Models tab (from an incident link)
 *   apiRef  — receives { pick({lat, lon}) } so the page's map click can inspect a point
 */
export function WeatherModelsProvider({ active, onOpen, apiRef, children }) {
  const initial = useMemo(() => parseModelsQuery(window.location.search), []);
  const { setViewport } = useViewport();

  const [manifestState, setManifestState] = useState({ manifest: null, error: null });
  const [mode, setModeState] = useState(initial?.mode ?? 'hrrr');
  const [compareView, setCompareView] = useState(COMPARE_VIEWS.includes(initial?.view) ? initial.view : 'swipe');
  const [variable, setVariableState] = useState(initial?.variable || 'temperature');
  const [validTimeChoice, setValidTime] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [particles, setParticles] = useState(true);
  const [location, setLocationState] = useState(initial?.location ?? null);

  // ── manifest ──
  useEffect(() => {
    if (!active || !WEATHER_MODEL_SERVICE_URL) return undefined;
    let cancelled = false;
    const load = () => fetchFieldManifest()
      .then((manifest) => { if (!cancelled) setManifestState({ manifest, error: null }); })
      .catch((error) => { if (!cancelled) setManifestState((s) => ({ manifest: s.manifest, error })); });
    load();
    const id = setInterval(load, MANIFEST_REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [active]);
  const { manifest } = manifestState;

  // ── selection, kept valid against what the manifest offers ──
  const variables = useMemo(() => variablesFor(manifest, mode, compareView), [manifest, mode, compareView]);
  const selected = variables.find((v) => v.id === variable);
  const effectiveVariable = selected && !selected.available
    ? (variables.find((v) => v.available && v.quantity === selected.quantity)?.id ?? variables.find((v) => v.available)?.id)
    : variable;

  const timeline = useMemo(() => timelineFor(manifest, mode, compareView), [manifest, mode, compareView]);
  const validTime = timeline.length
    ? (timeline.includes(validTimeChoice) ? validTimeChoice : timeline[nowIndex(timeline.map((t) => ({ validTime: t })))])
    : null;

  const setMode = useCallback((m) => { if (MODEL_MODES.includes(m)) setModeState(m); }, []);
  const setVariable = useCallback((v) => setVariableState(v), []);

  // ── point inspection (full-precision values from the point API) ──
  const point = useWeatherModels({ location, requestedMode: mode, active: active && Boolean(location) });

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

  useImperativeHandle(apiRef, () => ({
    pick: ({ lat, lon }) => setLocation({ lat, lon, place: null }, { fly: false }),
  }), [setLocation]);

  // Arriving from a shared link with a point: center the map on it.
  useEffect(() => {
    if (initial?.location) setViewport({ longitude: initial.location.lon, latitude: initial.location.lat, zoom: 6 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mirror the tab into the URL (replaceState: nothing else needs to re-render).
  useEffect(() => {
    const url = new URL(window.location.href);
    for (const k of URL_KEYS) url.searchParams.delete(k);
    if (active) {
      const target = new URL(modelsHref({ ...location, model: mode, variable: effectiveVariable, view: compareView }), url.origin);
      for (const [k, v] of target.searchParams) url.searchParams.set(k, v);
    }
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
  }, [active, location, mode, effectiveVariable, compareView]);

  const value = useMemo(() => ({
    active,
    manifest,
    manifestError: manifestState.error,
    mode,
    setMode,
    compareView,
    setCompareView,
    variable: effectiveVariable,
    variableSwitched: effectiveVariable !== variable ? selected?.reason : null,
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
  }), [active, manifest, manifestState.error, mode, setMode, compareView, effectiveVariable, variable, selected,
    setVariable, variables, timeline, validTime, playing, particles, location, setLocation, clearLocation, point, open]);

  return <WeatherModelsContext.Provider value={value}>{children}</WeatherModelsContext.Provider>;
}

/** The Models tab state, or null outside the live map (e.g. in tests). */
// eslint-disable-next-line react-refresh/only-export-components -- context hook beside its provider, as ThemeContext does
export function useWeatherModelsContext() {
  return useContext(WeatherModelsContext);
}
