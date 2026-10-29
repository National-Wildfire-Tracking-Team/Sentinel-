/**
 * kanariFires.js
 * Global satellite fire clusters (VIIRS, GOES, Meteosat MTG) from kanari.io,
 * outside the US, via /api/kanari/fires
 * (netlify/functions/kanari-fires/kanari-fires.mjs). That function is the only
 * caller of Kanari and is cached on the CDN, which keeps Sentinel within
 * Kanari's "no more than once a minute" polling guidance however many people
 * have the map open.
 *
 * Clusters become incident dots in the same shape as the merged IRWIN /
 * CAL FIRE dots (useMergedFireData), so they follow the live map's fire-point
 * rules: clustering, zoom, labels, containment colors, stale filters. Kanari
 * has no name, size, containment or perimeter, so those stay unknown (null)
 * rather than being guessed.
 */

import { getCached, setCached, dedupeInflight } from '../utils/dataCache';
import { throttleError } from '../../shared/utils/errorThrottle';

const ENDPOINT = '/api/kanari/fires';
const CACHE_KEY = 'kanari:fires:global';
// The function's CDN copy refreshes every 2 min; no use asking more often.
const CACHE_TTL_MS = 2 * 60 * 1000;

export const KANARI_SOURCE = 'KANARI';
export const KANARI_URL = 'https://kanari.io/en';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

/** True for a fire point that came from kanari.io. */
export function isKanariFire(props) {
  return props?._source === KANARI_SOURCE || props?.source === KANARI_SOURCE;
}

/**
 * The satellites that saw a cluster, e.g. "GOES satellites" or
 * "VIIRS + Meteosat MTG satellites". Kanari only groups their detections, so
 * a fire is credited to the satellites themselves.
 */
export function satelliteSourceLabel({ goesCount, viirsCount, mtgCount }) {
  const names = [
    goesCount && 'GOES',
    viirsCount && 'VIIRS',
    mtgCount && 'Meteosat MTG',
  ].filter(Boolean);
  return names.length ? `${names.join(' + ')} satellites` : 'Satellite';
}

const coord = (value, pos, neg) => `${Math.abs(value).toFixed(2)}°${value >= 0 ? pos : neg}`;

/** "Satellite fire 51.23°N 117.45°W" — Kanari clusters carry no name. */
export function kanariFireName(lon, lat) {
  return `Satellite fire ${coord(lat, 'N', 'S')} ${coord(lon, 'E', 'W')}`;
}

const fromUnixMinutes = (min) => (Number.isFinite(min) ? new Date(min * 60000).toISOString() : null);

/**
 * One row from the function (FIELDS order) as a dot feature with the
 * useMergedFireData dot properties.
 */
export function kanariRowToFeature(row, fields) {
  const r = Object.fromEntries(fields.map((name, i) => [name, row[i]]));
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
    properties: {
      UniqueFireIdentifier: `KANARI-${r.id}`,
      IncidentName: kanariFireName(r.lon, r.lat),
      GISAcres: null,
      PercentContained: null,
      FireDiscoveryDateTime: fromUnixMinutes(r.firstSeenMin),
      ModifiedOnDateTime: fromUnixMinutes(r.lastSeenMin),
      POOState: '',
      POOCounty: '',
      TotalIncidentPersonnel: 0,
      FireCause: null,
      _source: KANARI_SOURCE,
      _satellites: satelliteSourceLabel(r),
      _detections: r.count,
      _sensors: [
        r.viirsCount && `VIIRS ${r.viirsCount}`,
        r.goesCount && `GOES ${r.goesCount}`,
        r.mtgCount && `MTG ${r.mtgCount}`,
      ].filter(Boolean).join(' · '),
      _maxFrp: r.maxFrp,
      _confidence: r.confidence,
    },
  };
}

/**
 * Every Kanari cluster of the last 24 h outside the US, as a FeatureCollection.
 * Empty if the feed is down, so the rest of the map still loads.
 */
export async function fetchGlobalFires() {
  const cached = getCached(CACHE_KEY);
  if (cached !== null) return cached;

  return dedupeInflight(CACHE_KEY, async () => {
    try {
      const res = await fetch(ENDPOINT, { headers: { Accept: 'application/json' } });
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.fires) || !Array.isArray(data?.fields)) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const geojson = {
        type: 'FeatureCollection',
        features: data.fires
          .map((row) => kanariRowToFeature(row, data.fields))
          .filter((f) => Number.isFinite(f.geometry.coordinates[0]) && Number.isFinite(f.geometry.coordinates[1])),
      };
      setCached(CACHE_KEY, geojson, CACHE_TTL_MS);
      return geojson;
    } catch (err) {
      throttleError('[Kanari]', 'Skipping global satellite fires:', err, { friendlyType: 'unavailable' });
      return EMPTY_GEOJSON;
    }
  });
}
