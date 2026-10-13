/**
 * nhcModelTracks.js
 * "Spaghetti" model tracks for an active storm or invest, from NHC's public
 * ATCF guidance files (the "a-decks": ftp.nhc.noaa.gov/atcf/aid_public/
 * a<id>.dat.gz, via the /api/nws/nhc-atcf edge proxy). Each line is one
 * model's forecast position at one hour.
 *
 * Models run on different cycles (the quick statistical aids every 6 hours,
 * the global and hurricane models a cycle or two behind), so each model's
 * newest run from the last 12 hours is drawn. Where NHC publishes both a
 * model's raw run and its interpolated ("early") version, the interpolated
 * one wins — it's what forecasters use. Intensity-only aids (SHIPS, LGEM,
 * ...) carry no track of their own and are left out.
 *
 * Invests (pre-genesis disturbances, ATCF numbers 90-99) have a-decks too,
 * but NHC's outlook map layers don't carry the invest number, so
 * findInvestModelRun matches an outlook system to a recently updated invest
 * file by position.
 */

const BASE = '/api/nws/nhc-atcf';
const TTL_MS = 10 * 60 * 1000;
const MAX_RUN_AGE_H = 12;

/** Model groups for the spaghetti view; the official forecast is drawn with every group. */
export const MODEL_GROUPS = [
  { key: 'all', label: 'All models' },
  { key: 'consensus', label: 'Official & consensus' },
  { key: 'dynamical', label: 'Global & hurricane models' },
  { key: 'statistical', label: 'Statistical & trajectory' },
  { key: 'ensemble', label: 'GEFS ensemble members' },
];

// Model line colors, from the hurricane panel's existing palette.
export const MODEL_GROUP_COLORS = {
  official: '#ffffff',
  consensus: '#a78bfa',
  dynamical: '#38bdf8',
  statistical: '#e69800',
  ensemble: '#cbd5e1',
  other: '#cbd5e1',
};

// ATCF technique → [group, display name, model family]. Within a family the
// interpolated ("early") techniques are listed in EARLY and win over raw runs.
const MODELS = {
  OFCL: ['official', 'NHC official', 'ofcl'], OFCI: ['official', 'NHC official (interp.)', 'ofcl'],
  TVCN: ['consensus', 'TVCN consensus'], TVCE: ['consensus', 'TVCE consensus'], TVCA: ['consensus', 'TVCA consensus'],
  IVCN: ['consensus', 'IVCN consensus'], HCCA: ['consensus', 'HCCA consensus'], RVCN: ['consensus', 'RVCN consensus'],
  GFEX: ['consensus', 'GFS/ECMWF consensus'], FSSE: ['consensus', 'FSU superensemble'],
  AVNI: ['dynamical', 'GFS', 'gfs'], AVNO: ['dynamical', 'GFS', 'gfs'],
  EMXI: ['dynamical', 'ECMWF', 'ecmwf'], EMX2: ['dynamical', 'ECMWF', 'ecmwf'], EMX: ['dynamical', 'ECMWF', 'ecmwf'],
  UKXI: ['dynamical', 'UKMET', 'ukmet'], UKX2: ['dynamical', 'UKMET', 'ukmet'], UKMI: ['dynamical', 'UKMET', 'ukmet'], UKX: ['dynamical', 'UKMET', 'ukmet'],
  CMCI: ['dynamical', 'Canadian', 'cmc'], CMC2: ['dynamical', 'Canadian', 'cmc'], CMC: ['dynamical', 'Canadian', 'cmc'],
  NVGI: ['dynamical', 'NAVGEM', 'navgem'], NGX2: ['dynamical', 'NAVGEM', 'navgem'], NGX: ['dynamical', 'NAVGEM', 'navgem'], NVGM: ['dynamical', 'NAVGEM', 'navgem'],
  HWFI: ['dynamical', 'HWRF', 'hwrf'], HWRF: ['dynamical', 'HWRF', 'hwrf'],
  HFAI: ['dynamical', 'HAFS-A', 'hafsa'], HFSA: ['dynamical', 'HAFS-A', 'hafsa'],
  HFBI: ['dynamical', 'HAFS-B', 'hafsb'], HFSB: ['dynamical', 'HAFS-B', 'hafsb'],
  HMNI: ['dynamical', 'HMON', 'hmon'], HMON: ['dynamical', 'HMON', 'hmon'],
  CTCI: ['dynamical', 'COAMPS-TC', 'coamps'], CTCX: ['dynamical', 'COAMPS-TC', 'coamps'],
  AEMI: ['dynamical', 'GEFS mean', 'gefsmean'], AEMN: ['dynamical', 'GEFS mean', 'gefsmean'],
  CEM2: ['dynamical', 'Canadian ens. mean', 'cmcmean'], CEMI: ['dynamical', 'Canadian ens. mean', 'cmcmean'], CEMN: ['dynamical', 'Canadian ens. mean', 'cmcmean'],
  EEMN: ['dynamical', 'ECMWF ens. mean', 'ecmean'], EMNI: ['dynamical', 'ECMWF ens. mean', 'ecmean'],
  TABS: ['statistical', 'Beta & advection (shallow)'], TABM: ['statistical', 'Beta & advection (medium)'],
  TABD: ['statistical', 'Beta & advection (deep)'], BAMS: ['statistical', 'BAM shallow'], BAMM: ['statistical', 'BAM medium'],
  BAMD: ['statistical', 'BAM deep'], CLP5: ['statistical', 'CLIPER5'], TCLP: ['statistical', 'Trajectory CLIPER'],
  XTRP: ['statistical', 'Extrapolation'], LBAR: ['statistical', 'LBAR'],
  AC00: ['ensemble', 'GEFS control'],
};
const EARLY = new Set(['OFCL', 'AVNI', 'EMXI', 'EMX2', 'UKXI', 'UKX2', 'UKMI', 'CMCI', 'CMC2', 'NVGI', 'NGX2',
  'HWFI', 'HFAI', 'HFBI', 'HMNI', 'CTCI', 'AEMI', 'CEM2', 'CEMI', 'EMNI']);

function modelInfo(tech) {
  if (MODELS[tech]) return MODELS[tech];
  const member = tech.match(/^AP(\d\d)$/);
  if (member) return ['ensemble', `GEFS member ${Number(member[1])}`];
  return ['other', tech];
}

// Analysis records and intensity-only aids.
const SKIP = new Set(['CARQ', 'WRNG', 'SHIP', 'DSHP', 'LGEM', 'SHF5', 'DSF5', 'OCD5', 'DRCL', 'SHFR', 'NNIB', 'NNIC', 'RI25', 'RI30', 'RI35', 'RI40']);

function coord(value) {
  const m = String(value ?? '').trim().match(/^(\d+)([NSEW])$/);
  if (!m) return null;
  const deg = Number(m[1]) / 10;
  return m[2] === 'S' || m[2] === 'W' ? -deg : deg;
}

/** "2026100612" → hours since epoch, for comparing cycles. */
function cycleHours(cycle) {
  return Date.UTC(+cycle.slice(0, 4), +cycle.slice(4, 6) - 1, +cycle.slice(6, 8), +cycle.slice(8, 10)) / 3_600_000;
}

/**
 * a-deck text → each model's newest track from the last 12 hours, plus where
 * the system is now (tau 0 of the newest cycle):
 * { cycle, position: { lat, lng } | null,
 *   tracks: [{ tech, label, group, cycle, points: [{ tau, lng, lat, windKt }] }] }.
 */
export function parseADeck(text) {
  const rows = [];
  for (const line of String(text ?? '').split('\n')) {
    const f = line.split(',').map((x) => x.trim());
    if (f.length < 9) continue;
    const [, , cycle, , tech, tau, lat, lon, vmax] = f;
    if (!/^\d{10}$/.test(cycle) || !tech) continue;
    const point = { tau: Number(tau), lat: coord(lat), lng: coord(lon), windKt: Number(vmax) || null };
    if (!Number.isFinite(point.tau) || point.tau < 0 || point.lat == null || point.lng == null) continue;
    rows.push({ cycle, tech, point });
  }
  const cycle = rows.reduce((max, r) => (r.cycle > max ? r.cycle : max), '');
  if (!cycle) return { cycle: null, position: null, tracks: [] };

  const now = rows.find((r) => r.cycle === cycle && r.point.tau === 0 && r.tech === 'CARQ')
    ?? rows.find((r) => r.cycle === cycle && r.point.tau === 0);
  const position = now ? { lat: now.point.lat, lng: now.point.lng } : null;

  // Each model's newest cycle within the window.
  const newestByTech = new Map();
  for (const r of rows) {
    if (SKIP.has(r.tech) || cycleHours(cycle) - cycleHours(r.cycle) > MAX_RUN_AGE_H) continue;
    if (!newestByTech.has(r.tech) || r.cycle > newestByTech.get(r.tech)) newestByTech.set(r.tech, r.cycle);
  }
  const byTech = new Map();
  for (const r of rows) {
    if (newestByTech.get(r.tech) !== r.cycle) continue;
    const points = byTech.get(r.tech) ?? new Map();
    // One line per wind radius at the same hour; the position repeats.
    if (!points.has(r.point.tau)) points.set(r.point.tau, r.point);
    byTech.set(r.tech, points);
  }

  const tracks = [];
  for (const [tech, points] of byTech) {
    if (points.size < 2) continue;
    const [group, label, family] = modelInfo(tech);
    tracks.push({ tech, label, group, family, cycle: newestByTech.get(tech), points: [...points.values()].sort((a, b) => a.tau - b.tau) });
  }
  // A raw run gives way to its interpolated version.
  const earlyFamilies = new Set(tracks.filter((t) => t.family && EARLY.has(t.tech)).map((t) => t.family));
  const kept = tracks
    .filter((t) => !t.family || EARLY.has(t.tech) || !earlyFamilies.has(t.family))
    .map(({ family, ...t }) => t); // eslint-disable-line no-unused-vars
  return { cycle, position, tracks: kept };
}

/**
 * Tracks for a model group as GeoJSON lines plus an end-of-track label point
 * each. "All models" leaves out the 30 ensemble members; they have their
 * own group.
 */
export function modelTracksGeoJSON(data, groupKey = 'all') {
  const wanted = (t) => t.group === 'official'
    || (groupKey === 'all' ? t.group !== 'ensemble' : t.group === groupKey);
  const features = [];
  for (const t of (data?.tracks ?? []).filter(wanted)) {
    const coordinates = t.points.map((p) => [p.lng, p.lat]);
    const properties = { tech: t.tech, label: t.label, group: t.group, color: MODEL_GROUP_COLORS[t.group] };
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties });
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coordinates[coordinates.length - 1] },
      properties: { ...properties, end: true },
    });
  }
  return { type: 'FeatureCollection', features };
}

async function gunzipText(buffer) {
  const bytes = new Uint8Array(buffer);
  // Some hops decompress on the way; only inflate real gzip.
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes);
  const stream = new Response(bytes).body.pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

const cache = new Map();

/**
 * Model tracks for a storm or invest (ATCF id, e.g. "EP182026", "AL922026").
 * Concurrent callers share one request. Throws on network failure so the
 * caller can say so.
 */
export function fetchModelTracks(atcfId) {
  const id = String(atcfId ?? '').toLowerCase();
  if (!/^(al|ep|cp)\d{6}$/.test(id)) return Promise.reject(new Error(`Not an ATCF storm id: ${atcfId}`));
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = (async () => {
    const res = await fetch(`${BASE}/a${id}.dat.gz`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseADeck(await gunzipText(await res.arrayBuffer()));
  })();
  cache.set(id, { at: Date.now(), promise });
  promise.catch(() => cache.delete(id));
  return promise;
}

// ─── Invests ─────────────────────────────────────────────────────────────────

// An invest file NHC hasn't touched in this long belongs to an old system
// (numbers 90-99 are reused through the season).
const INVEST_MAX_AGE_MS = 36 * 3_600_000;
// How far (degrees) an invest's position can be from an outlook system and still be it.
const INVEST_MATCH_DEG = 5;

/**
 * Invest ids in NHC's a-deck directory listing updated within 36 hours:
 * ['AL922026', 'EP922026'].
 */
export function recentInvestIds(indexHtml, now = Date.now()) {
  const ids = [];
  for (const m of String(indexHtml ?? '').matchAll(/a((?:al|ep|cp)9\d\d{4})\.dat\.gz">[^<]*<\/a>\s+(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/g)) {
    const updated = Date.parse(`${m[2]}T${m[3]}:00Z`);
    if (Number.isFinite(updated) && now - updated <= INVEST_MAX_AGE_MS) ids.push(m[1].toUpperCase());
  }
  return ids;
}

let indexCache = null;

/**
 * The invest whose model guidance belongs to an outlook system at this
 * position: the nearest recently updated invest within 5°, or null (an area
 * of interest with nothing to track yet has no model runs).
 */
export async function findInvestModelRun({ lat, lng }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!indexCache || Date.now() - indexCache.at > TTL_MS) {
    const promise = fetch(`${BASE}/`).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    });
    indexCache = { at: Date.now(), promise };
    promise.catch(() => { indexCache = null; });
  }
  const ids = recentInvestIds(await indexCache.promise);
  const runs = await Promise.all(ids.map((id) => fetchModelTracks(id).then((data) => ({ id, data })).catch(() => null)));
  let best = null;
  for (const run of runs) {
    const p = run?.data?.position;
    if (!p || run.data.tracks.length === 0) continue;
    const d = Math.hypot(p.lat - lat, p.lng - lng);
    if (d <= INVEST_MATCH_DEG && (!best || d < best.d)) best = { id: run.id, d };
  }
  return best?.id ?? null;
}
