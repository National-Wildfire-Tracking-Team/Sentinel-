/**
 * useNhcWindHazards.js
 * NHC wind-speed probabilities, forecast wind radii, arrival time of
 * tropical-storm-force winds, and potential storm surge flooding, for the
 * opt-in Tropical hazard layers. Only the products whose layer is on are
 * fetched (see fetchNhcWindHazards); refreshes every 10 minutes and whenever
 * the set of active storms or the probability threshold changes.
 */

import { useEffect, useState } from 'react';
import { fetchNhcWindHazards } from '../api/nhcTropicalWeather';

const REFRESH_MS = 10 * 60 * 1000;
const EMPTY_FC = { type: 'FeatureCollection', features: [] };
export const EMPTY_WIND_HAZARDS = Object.freeze({
  windProbGeoJSON: EMPTY_FC,
  windRadiiGeoJSON: EMPTY_FC,
  arrivalGeoJSON: EMPTY_FC,
  surgeImageLayerIds: [],
});

/**
 * @param {{ enabled: boolean, slots: string[], probKt: number|null, radii: boolean, arrival: boolean, surge: boolean }} opts
 */
export function useNhcWindHazards({ enabled, slots, probKt, radii, arrival, surge }) {
  const [data, setData] = useState(EMPTY_WIND_HAZARDS);
  const slotsKey = (slots ?? []).join(',');
  const wantsAny = Boolean(enabled && (probKt || radii || arrival || surge));

  useEffect(() => {
    if (!wantsAny) {
      setData(EMPTY_WIND_HAZARDS);
      return undefined;
    }
    let cancelled = false;
    const want = {
      slots: slotsKey ? slotsKey.split(',') : [],
      probKt: probKt || null,
      radii: Boolean(radii),
      arrival: Boolean(arrival),
      surge: Boolean(surge),
    };
    const load = () => fetchNhcWindHazards(want)
      .then((next) => { if (!cancelled) setData(next); })
      .catch(() => { /* keep the last good data; the next refresh retries */ });
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [wantsAny, slotsKey, probKt, radii, arrival, surge]);

  return data;
}
