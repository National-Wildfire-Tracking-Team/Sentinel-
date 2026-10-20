/**
 * FireDangerContext.jsx
 * State for the Fire Danger & Fuels layers (Wildfire and All Hazards tabs):
 * the NWCG 7-day Significant Fire Potential collection for the chosen day,
 * its freshness, and each layer's opacity.
 *
 * On/off switches stay in AppContext (layers.fireRiskOutlook, layers.fuelModels,
 * and the station layers fdErc/fdBi/fdSc/fdDeadFm/fdLiveFm, of which at most
 * one is on) and the forecast day in AppContext.fireRiskDay, so tab presets
 * and the layer panel treat these like every other layer. Station data
 * (cloud/fire-danger via VITE_FIRE_DANGER_URL) loads only while a station
 * layer is on. Data is fetched only while a layer
 * is on and its tab is shown. A failed refresh keeps the last good data and
 * reports the error; nothing is ever filled in.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useApp } from './AppContext';
import {
  fetchSignificantFirePotential, summarizeSfp, SFP_REFRESH_MS,
} from '../api/fireDanger/significantFirePotential';
import { sfpFreshness } from '../api/fireDanger/freshness';
import { defaultWfpiDay } from '../api/fireDanger/wfpi';
import { fetchFieldSamples } from '../api/fireDanger/fieldSamples';
import { productDate } from '../api/fireDanger/freshness';
import {
  FIRE_DANGER_URL, MANIFEST_REFRESH_MS, STATION_LAYER_FIELDS, fetchFireDangerManifest, fetchStations, markStaleStations,
} from '../api/fireDanger/stations';

const FireDangerContext = createContext(null);

const DEFAULT_FIRE_DANGER_OPACITY = { sfp: 0.55, fuels: 0.7, stations: 0.9, wfpi: 0.65, samples: 1 };
const SAMPLES_REFRESH_MS = 30 * 60 * 1000;

function stationLayerOn(layers) {
  return Object.keys(STATION_LAYER_FIELDS).find((k) => layers[k]) ?? null;
}

/** @param {{ active: boolean, children: any }} props  active: a tab that shows these layers is open */
export function FireDangerProvider({ active, children }) {
  const { layers, fireRiskDay } = useApp();
  const sfpOn = Boolean(active && layers.fireRiskOutlook);
  const fuelsOn = Boolean(active && layers.fuelModels);
  const stationLayer = active ? stationLayerOn(layers) : null;
  const stationsOn = Boolean(stationLayer);
  const [deadClass, setDeadClass] = useState('fm100');
  const [liveClass, setLiveClass] = useState('herbFM');
  const fieldPick = stationLayer ? STATION_LAYER_FIELDS[stationLayer] : null;
  const stationField = fieldPick === 'dead' ? deadClass : fieldPick === 'live' ? liveClass : fieldPick;
  const [st, setSt] = useState({ manifest: null, data: null, error: null, loading: false });
  const wfpiOn = Boolean(active && layers.wfpi);
  const samplesOn = Boolean(active && layers.lfmSamples);
  const [samples, setSamples] = useState({ data: null, error: null, loading: false, fetchedAt: null });
  const [wfpiChoice, setWfpiDay] = useState(null); // null: the day valid today, once dates are known

  const [sfp, setSfp] = useState({ day: null, data: null, error: null, loading: false, fetchedAt: null });
  const [opacity, setOpacityState] = useState(DEFAULT_FIRE_DANGER_OPACITY);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!sfpOn) return undefined;
    let cancelled = false;
    const load = () => {
      setSfp((s) => ({ ...s, loading: true }));
      fetchSignificantFirePotential(fireRiskDay)
        .then((data) => {
          if (!cancelled) setSfp({ day: fireRiskDay, data, error: null, loading: false, fetchedAt: new Date().toISOString() });
        })
        .catch((error) => {
          if (cancelled) return;
          console.warn('[FireDanger] significant fire potential:', error.message);
          // Keep the last good collection only if it is for the day being asked for.
          setSfp((s) => (s.day === fireRiskDay
            ? { ...s, error, loading: false }
            : { day: fireRiskDay, data: null, error, loading: false, fetchedAt: null }));
        });
    };
    load();
    const id = setInterval(load, SFP_REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [sfpOn, fireRiskDay, reloadKey]);

  useEffect(() => {
    if (!samplesOn) return undefined;
    let cancelled = false;
    const load = () => {
      setSamples((s) => ({ ...s, loading: true }));
      fetchFieldSamples()
        .then((data) => { if (!cancelled) setSamples({ data, error: null, loading: false, fetchedAt: new Date().toISOString() }); })
        .catch((error) => {
          if (cancelled) return;
          console.warn('[FireDanger] field samples:', error.message);
          setSamples((s) => ({ ...s, error, loading: false }));
        });
    };
    load();
    const id = setInterval(load, SAMPLES_REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [samplesOn, reloadKey]);

  // The manifest also carries WFPI's valid dates, so it loads for either layer;
  // the station file only for the station layers.
  useEffect(() => {
    if (!(stationsOn || wfpiOn) || !FIRE_DANGER_URL) return undefined;
    let cancelled = false;
    const load = async () => {
      setSt((s) => ({ ...s, loading: true }));
      try {
        const manifest = await fetchFireDangerManifest();
        const data = stationsOn
          ? markStaleStations(await fetchStations(manifest), manifest.sources?.fems?.latestObservedDate)
          : null;
        if (!cancelled) setSt((s) => ({ manifest, data: data ?? s.data, error: null, loading: false }));
      } catch (error) {
        if (cancelled) return;
        console.warn('[FireDanger] stations:', error.message);
        // Keep the last good run on screen; its own dates show its age.
        setSt((s) => ({ ...s, error, loading: false }));
      }
    };
    load();
    const id = setInterval(load, MANIFEST_REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [stationsOn, wfpiOn, reloadKey]);

  const setOpacity = useCallback((layer, value) => {
    setOpacityState((o) => ({ ...o, [layer]: Math.min(1, Math.max(0.1, Number(value) || 0)) }));
  }, []);
  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const wfpiSource = st.manifest?.sources?.wfpi ?? null;
  const wfpiDates = wfpiSource?.validDates ?? null;
  const wfpiDay = wfpiChoice ?? defaultWfpiDay(wfpiDates, productDate());

  const sfpData = sfp.day === fireRiskDay ? sfp.data : null;
  const sfpSummary = useMemo(() => (sfpData ? summarizeSfp(sfpData) : null), [sfpData]);

  const value = useMemo(() => ({
    active,
    sfpOn,
    fuelsOn,
    anyOn: sfpOn || fuelsOn || stationsOn || wfpiOn || samplesOn,
    samplesOn,
    samples: { ...samples, loading: samples.loading && !samples.data },
    wfpiOn,
    wfpi: {
      day: wfpiDay,
      setDay: setWfpiDay,
      validDates: wfpiDates,
      validDate: wfpiDates?.[wfpiDay - 1] ?? null,
      source: wfpiSource,
      manifestError: wfpiOn && !st.manifest ? st.error : null,
    },
    stationsOn,
    stations: {
      configured: Boolean(FIRE_DANGER_URL),
      layer: stationLayer,
      field: stationField,
      deadClass,
      setDeadClass,
      liveClass,
      setLiveClass,
      manifest: st.manifest,
      fems: st.manifest?.sources?.fems ?? null,
      data: st.data,
      error: st.error,
      loading: st.loading && !st.data,
    },
    sfp: {
      day: fireRiskDay,
      data: sfpData,
      summary: sfpSummary,
      error: sfp.error,
      loading: sfp.loading && !sfpData,
      fetchedAt: sfpData ? sfp.fetchedAt : null,
      freshness: sfpFreshness(sfpSummary, fireRiskDay),
    },
    opacity,
    setOpacity,
    retry,
  }), [active, sfpOn, fuelsOn, stationsOn, wfpiOn, samplesOn, samples, wfpiDay, wfpiDates, wfpiSource, stationLayer, stationField, deadClass, liveClass, st, fireRiskDay, sfpData, sfpSummary,
    sfp.error, sfp.loading, sfp.fetchedAt, opacity, setOpacity, retry]);

  return <FireDangerContext.Provider value={value}>{children}</FireDangerContext.Provider>;
}

/** null outside the provider (e.g. in isolated component tests). */
export function useFireDangerContext() {
  return useContext(FireDangerContext);
}
