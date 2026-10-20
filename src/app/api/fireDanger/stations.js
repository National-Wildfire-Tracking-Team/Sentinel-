/**
 * stations.js
 * NFDRS station values published by cloud/fire-danger from the USDA Forest
 * Service FEMS (Fire Environment Mapping System): one point per active
 * weather station with its latest observed day, the 7-day forecast and the
 * change over the past week. Served from Sentinel's CDN at
 * VITE_FIRE_DANGER_URL; browsers never call FEMS.
 *
 * Every value is FEMS's own NFDRS 2016 output for fuel model Y at that
 * station. Nothing is interpolated between stations, and the colour ramps
 * below are display scales, not danger classes: official adjective ratings
 * use local breakpoints that FEMS doesn't publish here.
 */

import { fetchJson } from './fetchJson';

export const FIRE_DANGER_URL = (import.meta.env.VITE_FIRE_DANGER_URL || '').replace(/\/+$/, '');
export const STATIONS_SOURCE = 'USDA Forest Service FEMS · NFDRS 2016 station values';
export const STATIONS_SOURCE_URL = 'https://fems.fs2c.usda.gov';
export const MANIFEST_REFRESH_MS = 5 * 60 * 1000;

/** A station's observed day older than this (vs. the newest in the run) is drawn as stale. */
export const STATION_STALE_DAYS = 2;

/**
 * What a station layer can show. `kind`:
 *   index      higher = more fire potential; ramp light → dark red
 *   moisture   lower = drier; ramp reversed
 * `source`: 'computed' (NFDRS from observed weather) or 'modelled' (NFDRS live
 * fuel moisture model; nothing is measured).
 */
export const STATION_FIELDS = {
  erc: { label: 'Energy Release Component', short: 'ERC', unit: '', kind: 'index', range: [0, 100], source: 'computed',
    about: 'Potential available energy per unit area at the flaming front; reflects drying of heavy and live fuels over weeks.' },
  bi: { label: 'Burning Index', short: 'BI', unit: '', kind: 'index', range: [0, 120], source: 'computed',
    about: 'Combines spread and energy release; related to potential flame length and difficulty of control.' },
  sc: { label: 'Spread Component', short: 'SC', unit: '', kind: 'index', range: [0, 60], source: 'computed',
    about: 'Forward rate of spread of a head fire; sensitive to wind and fine fuel moisture.' },
  ic: { label: 'Ignition Component', short: 'IC', unit: '%', kind: 'index', range: [0, 100], source: 'computed',
    about: 'Probability that a firebrand causes a fire needing suppression.' },
  fm1: { label: '1-hour dead fuel moisture', short: '1-h', unit: '%', kind: 'moisture', range: [2, 30], source: 'computed' },
  fm10: { label: '10-hour dead fuel moisture', short: '10-h', unit: '%', kind: 'moisture', range: [2, 30], source: 'computed' },
  fm100: { label: '100-hour dead fuel moisture', short: '100-h', unit: '%', kind: 'moisture', range: [4, 35], source: 'computed' },
  fm1000: { label: '1000-hour dead fuel moisture', short: '1000-h', unit: '%', kind: 'moisture', range: [5, 35], source: 'computed' },
  herbFM: { label: 'Herbaceous live fuel moisture', short: 'Herb', unit: '%', kind: 'moisture', range: [30, 250], source: 'modelled' },
  woodyFM: { label: 'Woody live fuel moisture', short: 'Woody', unit: '%', kind: 'moisture', range: [60, 200], source: 'modelled' },
};

export const DEAD_FM_FIELDS = ['fm1', 'fm10', 'fm100', 'fm1000'];
export const LIVE_FM_FIELDS = ['herbFM', 'woodyFM'];

/** Panel layer key → the station field it shows (dead/live pick their class in the drawer). */
export const STATION_LAYER_FIELDS = {
  fdErc: 'erc',
  fdBi: 'bi',
  fdSc: 'sc',
  fdDeadFm: 'dead',
  fdLiveFm: 'live',
};
export const STATION_LAYER_KEYS = Object.keys(STATION_LAYER_FIELDS);

// Sequential ramp, low → high fire potential (dry/hot end last).
export const RAMP = ['#fff7bc', '#fee391', '#fec44f', '#fe9929', '#ec7014', '#cc4c02', '#8c2d04'];

/** Ramp stops [value, colour, …] for a field, oriented so the dry/high end is dark red. */
export function rampStops(field) {
  const { range: [lo, hi], kind } = STATION_FIELDS[field];
  const colors = kind === 'moisture' ? [...RAMP].reverse() : RAMP;
  return colors.flatMap((c, i) => [lo + ((hi - lo) * i) / (colors.length - 1), c]);
}

export function manifestUrl() {
  return `${FIRE_DANGER_URL}/v1/manifest.json`;
}

export async function fetchFireDangerManifest() {
  if (!FIRE_DANGER_URL) throw new Error('not configured');
  const m = await fetchJson(manifestUrl(), 'fire-danger:manifest', MANIFEST_REFRESH_MS);
  if (m?.schemaVersion !== 1 || m?.kind !== 'sentinel-fire-danger') throw new Error('unexpected manifest');
  return m;
}

/** The station collection for a manifest (immutable per run, so cached long). */
export async function fetchStations(manifest) {
  const path = manifest?.products?.stations?.path;
  if (!path) throw new Error('no station data published yet');
  return fetchJson(`${FIRE_DANGER_URL}/v1/${path}`, `fire-danger:stations:${path}`, 6 * 60 * 60 * 1000);
}

/** One station's observed window and forecast. */
export async function fetchStationDetail(manifest, id) {
  const tpl = manifest?.products?.stations?.detailPath;
  if (!tpl) throw new Error('no station data published yet');
  const path = tpl.replace('{id}', encodeURIComponent(String(id)));
  return fetchJson(`${FIRE_DANGER_URL}/v1/${path}`, `fire-danger:station:${path}`, 6 * 60 * 60 * 1000);
}

function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/**
 * Adds `stale` (observed day missing or STATION_STALE_DAYS older than the
 * run's newest) so the map can draw such stations as unrated.
 */
export function markStaleStations(fc, latestObservedDate) {
  const features = (fc?.features ?? []).map((f) => {
    const d = f.properties.observedDate;
    const stale = !d || !latestObservedDate || daysBetween(d, latestObservedDate) > STATION_STALE_DAYS;
    return { ...f, properties: { ...f.properties, stale } };
  });
  return { type: 'FeatureCollection', features };
}

const KM_PER_DEG = 111.32;

/** Nearest station with current data within `maxKm`, with its distance; null if none. */
export function nearestStation(fc, lat, lng, maxKm = 40) {
  let best = null;
  const cos = Math.cos((lat * Math.PI) / 180);
  for (const f of fc?.features ?? []) {
    if (f.properties.stale) continue;
    const [x, y] = f.geometry.coordinates;
    const km = Math.hypot((x - lng) * cos, y - lat) * KM_PER_DEG;
    if (km <= maxKm && (!best || km < best.km)) best = { feature: f, km };
  }
  return best;
}

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Summary of stations inside `bounds` ([w, s, e, n]) for the drawer's
 * regional overview. Station counts and statistics only: with point data
 * there is no honest "share of area" to report.
 */
export function summarizeStations(fc, bounds, { top = 5 } = {}) {
  const [w, s, e, n] = bounds;
  const inView = (fc?.features ?? []).filter((f) => {
    const [x, y] = f.geometry.coordinates;
    return x >= w && x <= e && y >= s && y <= n;
  });
  const current = inView.filter((f) => !f.properties.stale);
  const vals = (field) => current.map((f) => f.properties[field]).filter((v) => v != null);
  const ercChanges = current.filter((f) => f.properties.ercChange7d != null);
  const forecastPeak = current
    .map((f) => ({ f, peak: Math.max(...(f.properties.forecastErc ?? []).filter((v) => v != null)) }))
    .filter((x) => Number.isFinite(x.peak));
  return {
    stations: inView.length,
    current: current.length,
    stale: inView.length - current.length,
    erc: { median: median(vals('erc')), max: vals('erc').length ? Math.max(...vals('erc')) : null },
    fm100: { median: median(vals('fm100')), min: vals('fm100').length ? Math.min(...vals('fm100')) : null },
    rising: ercChanges.filter((f) => f.properties.ercChange7d > 0).length,
    falling: ercChanges.filter((f) => f.properties.ercChange7d < 0).length,
    withTrend: ercChanges.length,
    biggestRises: [...ercChanges].sort((a, b) => b.properties.ercChange7d - a.properties.ercChange7d)
      .filter((f) => f.properties.ercChange7d > 0).slice(0, top).map((f) => f.properties),
    driest100h: current.filter((f) => f.properties.fm100 != null)
      .sort((a, b) => a.properties.fm100 - b.properties.fm100).slice(0, top).map((f) => f.properties),
    forecastRising: forecastPeak.filter(({ f, peak }) => f.properties.erc != null && peak > f.properties.erc).length,
  };
}

/**
 * Approximate [w, s, e, n] of the map view from its centre, zoom and size
 * (Web Mercator, 512 px tiles), for the regional summary. Unrotated view.
 */
export function viewportBounds({ longitude, latitude, zoom }, widthPx, heightPx) {
  const scale = 512 * 2 ** zoom; // world size in px
  const lonSpan = (360 * widthPx) / scale;
  const yOf = (lat) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
  const latOf = (y) => (360 / Math.PI) * Math.atan(Math.exp(Math.PI * (1 - 2 * y))) - 90;
  const yc = yOf(latitude);
  const dy = heightPx / scale / 2;
  return [
    Math.max(-180, longitude - lonSpan / 2),
    Math.max(-85, latOf(yc + dy)),
    Math.min(180, longitude + lonSpan / 2),
    Math.min(85, latOf(yc - dy)),
  ];
}
