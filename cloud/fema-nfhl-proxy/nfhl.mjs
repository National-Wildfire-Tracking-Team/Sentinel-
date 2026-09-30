/**
 * nfhl.mjs
 * Pure logic for fema-nfhl-proxy: request validation, the tile grid the cache
 * is keyed on, FEMA flood-zone classification, attribute normalization, and a
 * TTL cache with in-flight coalescing. Kept separate from index.mjs (the HTTP
 * server) so it can be unit-tested without binding a port — see
 * Tests/Vitest/femaNfhlProxy.test.js.
 *
 * Nothing here knows about users or exact viewports once a request has been
 * snapped to tiles: cache keys, logs, and metrics are all tile-based.
 */

export const NFHL_SERVICE_URL =
  process.env.NFHL_SERVICE_URL ||
  'https://hazards.fema.gov/arcgis/rest/services/FIRMette/NFHLREST_FIRMette/MapServer';

export const ATTRIBUTION = 'Flood hazard data: FEMA National Flood Hazard Layer (NFHL)';

/** NFHL MapServer sublayers used here (ids verified against the live service). */
const LAYER_IDS = {
  availability: 0, // "NFHL Availability" — where digital NFHL data exists
  panels: 1,       // "FIRM Panels" — panel number, effective date, panel type
  zones: 20,       // "Flood Hazard Zones" — S_FLD_HAZ_AR polygons
};

/**
 * Datasets fetched per detail level. Each dataset is cached per slippy-map
 * tile at its own `tileZoom`, so a request only goes upstream for tiles that
 * aren't already cached — neighbouring viewports share most of their tiles.
 *
 * `maxAllowableOffset` (degrees) is picked to be ~1 screen pixel at the
 * lowest map zoom the level serves (z12 ≈ 0.00017°/px), so simplification
 * isn't visible but a dense metro tile stays ~100KB instead of ~600KB.
 */
const DATASETS = {
  availability: {
    layerId: LAYER_IDS.availability,
    tileZoom: 7,
    maxAllowableOffset: 0.01,
    geometryPrecision: 4,
    outFields: ['OBJECTID', 'STUDY_ID'],
    where: '1=1',
  },
  panels: {
    layerId: LAYER_IDS.panels,
    tileZoom: 10,
    maxAllowableOffset: 0.0002,
    geometryPrecision: 5,
    outFields: ['OBJECTID', 'DFIRM_ID', 'FIRM_PAN', 'PANEL_TYP', 'EFF_DATE', 'PCOMM', 'SUFFIX'],
    where: '1=1',
  },
  zones: {
    layerId: LAYER_IDS.zones,
    tileZoom: 12,
    maxAllowableOffset: 0.0002,
    geometryPrecision: 5,
    outFields: [
      'OBJECTID', 'DFIRM_ID', 'FLD_ZONE', 'ZONE_SUBTY', 'SFHA_TF', 'STATIC_BFE',
      'DEPTH', 'LEN_UNIT', 'VELOCITY', 'VEL_UNIT', 'V_DATUM', 'SOURCE_CIT',
    ],
    // Unshaded Zone X ("area of minimal flood hazard") and open water carry no
    // symbol in FEMA's own renderer for this service and cover most of the
    // map area, so they're dropped upstream rather than shipped and hidden.
    where:
      "FLD_ZONE <> 'OPEN WATER' AND NOT (FLD_ZONE = 'X' AND " +
      "(ZONE_SUBTY IS NULL OR ZONE_SUBTY = '' OR ZONE_SUBTY = 'AREA OF MINIMAL FLOOD HAZARD'))",
  },
  zonesFine: null, // filled below — same as zones, finer tiles + tolerance
};
DATASETS.zonesFine = { ...DATASETS.zones, tileZoom: 14, maxAllowableOffset: 0.00003, geometryPrecision: 6 };

/**
 * Map zoom (Mapbox GL, 512px tiles) → what gets fetched. Below `overview`
 * nothing is served: a national-scale view would be all availability
 * polygons and no useful hazard detail.
 */
export const LEVELS = [
  { name: 'fine', minZoom: 14, datasets: ['zonesFine', 'panels'] },
  { name: 'detail', minZoom: 12, datasets: ['zones', 'panels'] },
  { name: 'overview', minZoom: 7, datasets: ['availability'] },
];
export const MIN_ZOOM = 7;
export const MAX_ZOOM = 22;

/** Upper bound on tiles per dataset per request — the geographic-extent guard. */
export const MAX_TILES_PER_DATASET = 64;

/** ArcGIS caps a single query at 2000 records; page past it, but not forever. */
const PAGE_SIZE = 2000;
const MAX_PAGES = 4;

export function levelForZoom(zoom) {
  return LEVELS.find((l) => zoom >= l.minZoom) || null;
}

// ─── Validation ─────────────────────────────────────────────────────────────

export class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Parse and validate `bbox=<west>,<south>,<east>,<north>&zoom=<z>`.
 * Throws RequestError with a user-safe message on anything malformed.
 */
export function parseQuery(searchParams) {
  const rawBbox = searchParams.get('bbox');
  const rawZoom = searchParams.get('zoom');
  if (!rawBbox) throw new RequestError('bbox is required as "west,south,east,north"');
  if (rawZoom == null || rawZoom === '') throw new RequestError('zoom is required');

  const parts = rawBbox.split(',').map((s) => Number(s.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new RequestError('bbox must be four numbers: west,south,east,north');
  }
  const [west, south, east, north] = parts;
  if (west < -180 || east > 180 || south < -85 || north > 85) {
    throw new RequestError('bbox is outside valid WGS84 bounds');
  }
  if (west >= east || south >= north) {
    throw new RequestError('bbox must have west < east and south < north');
  }

  const zoom = Number(rawZoom);
  if (!Number.isFinite(zoom) || zoom < 0 || zoom > MAX_ZOOM) {
    throw new RequestError(`zoom must be between 0 and ${MAX_ZOOM}`);
  }
  if (zoom < MIN_ZOOM) {
    throw new RequestError(`Flood hazard data is only available at zoom ${MIN_ZOOM} and closer`);
  }

  return { bbox: { west, south, east, north }, zoom };
}

// ─── Tile grid ──────────────────────────────────────────────────────────────

function lngToTileX(lng, z) {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}

function latToTileY(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * 2 ** z);
}

export function tileBounds(x, y, z) {
  const n = 2 ** z;
  const lat = (ty) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n))) * 180) / Math.PI;
  return { west: (x / n) * 360 - 180, east: ((x + 1) / n) * 360 - 180, north: lat(y), south: lat(y + 1) };
}

/** Every tile at zoom `z` that intersects `bbox`. */
export function tilesForBbox({ west, south, east, north }, z) {
  const max = 2 ** z - 1;
  const clamp = (v) => Math.min(max, Math.max(0, v));
  // Nudge the max edges inward so a bbox ending exactly on a tile boundary
  // doesn't pull in an extra row/column of tiles it doesn't actually touch.
  const eps = 1e-9;
  const x0 = clamp(lngToTileX(west, z));
  const x1 = clamp(lngToTileX(east - eps, z));
  const y0 = clamp(latToTileY(north, z));
  const y1 = clamp(latToTileY(south + eps, z));
  const tiles = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) tiles.push({ x, y, z });
  }
  return tiles;
}

/** Approximate bbox area in km² — logged instead of coordinates. */
export function bboxAreaKm2({ west, south, east, north }) {
  const midLat = ((south + north) / 2) * (Math.PI / 180);
  return (east - west) * 111.32 * Math.cos(midLat) * (north - south) * 110.57;
}

// ─── Classification ─────────────────────────────────────────────────────────

/**
 * FEMA hazard category keys. These mirror the classes FEMA's own renderer for
 * NFHLREST_FIRMette layer 20 draws (1% annual chance, Regulatory Floodway,
 * Special Floodway, 0.2% annual chance, Future Conditions 1%, Reduced Risk Due
 * to Levee, Risk Due to Levee, Undetermined), with V/VE broken out of the 1%
 * class as FEMA's FIRM legend does ("Coastal High Hazard Area"), plus the
 * "AREA NOT INCLUDED" FLD_ZONE domain value.
 */
export const CATEGORIES = {
  FLOODWAY: 'floodway',
  SPECIAL_FLOODWAY: 'special_floodway',
  COASTAL_HIGH_HAZARD: 'coastal_high_hazard',
  PCT_1: 'pct_1',
  PCT_0_2: 'pct_0_2',
  FUTURE_1PCT: 'future_1pct',
  LEVEE_REDUCED: 'levee_reduced',
  LEVEE_RISK: 'levee_risk',
  UNDETERMINED: 'undetermined',
  NOT_INCLUDED: 'not_included',
  MINIMAL: 'minimal',
  OTHER: 'other',
};

const SPECIAL_FLOODWAY_SUBTYPES = new Set([
  'AREA OF SPECIAL CONSIDERATION',
  'COLORADO RIVER',
  'COLORADO RIVER FLOODWAY',
  'DENSITY FRINGE AREA',
]);

/**
 * Classify one S_FLD_HAZ_AR record. Order matters and follows FEMA's renderer:
 * e.g. "1 PCT FUTURE CONDITIONS, FLOODWAY" is Future Conditions (not
 * Floodway), and "VE; RIVERINE FLOODWAY SHOWN IN COASTAL ZONE" is Floodway
 * (not Coastal High Hazard).
 */
export function classifyZone(fldZone, zoneSubtype) {
  const zone = String(fldZone || '').trim().toUpperCase();
  const sub = String(zoneSubtype || '').trim().toUpperCase();

  if (zone === 'AREA NOT INCLUDED') return CATEGORIES.NOT_INCLUDED;
  if (zone === 'D') return sub.includes('LEVEE') ? CATEGORIES.LEVEE_RISK : CATEGORIES.UNDETERMINED;
  if (sub.includes('FUTURE')) return CATEGORIES.FUTURE_1PCT;
  if (SPECIAL_FLOODWAY_SUBTYPES.has(sub)) return CATEGORIES.SPECIAL_FLOODWAY;
  if (sub.includes('FLOODWAY') || sub.includes('ENCROACHMENT') || sub.includes('FLOWAGE EASEMENT')) {
    return CATEGORIES.FLOODWAY;
  }
  if (zone === 'X') {
    if (sub.includes('REDUCED') && sub.includes('LEVEE')) return CATEGORIES.LEVEE_REDUCED;
    if (!sub || sub.includes('MINIMAL')) return CATEGORIES.MINIMAL;
    return CATEGORIES.PCT_0_2;
  }
  if (zone === 'V' || zone === 'VE') return CATEGORIES.COASTAL_HIGH_HAZARD;
  if (zone.startsWith('A')) return CATEGORIES.PCT_1;
  return CATEGORIES.OTHER;
}

// ─── Normalization ──────────────────────────────────────────────────────────

/** NFHL uses -9999 (and occasionally blanks) for "not applicable". */
function num(v) {
  const n = Number(v);
  return v == null || v === '' || !Number.isFinite(n) || n <= -9999 ? null : n;
}

function str(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function isoDate(v) {
  if (v == null || v === '') return null;
  const d = new Date(typeof v === 'number' ? v : String(v));
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

function normalizeZone(p) {
  return {
    id: p.OBJECTID,
    zone: str(p.FLD_ZONE),
    subtype: str(p.ZONE_SUBTY),
    category: classifyZone(p.FLD_ZONE, p.ZONE_SUBTY),
    sfha: str(p.SFHA_TF) === 'T',
    bfe: num(p.STATIC_BFE),
    depth: num(p.DEPTH),
    lengthUnit: str(p.LEN_UNIT),
    velocity: num(p.VELOCITY),
    velocityUnit: str(p.VEL_UNIT),
    verticalDatum: str(p.V_DATUM),
    dfirmId: str(p.DFIRM_ID),
    sourceCitation: str(p.SOURCE_CIT),
  };
}

function normalizePanel(p) {
  return {
    id: p.OBJECTID,
    panel: str(p.FIRM_PAN),
    panelType: str(p.PANEL_TYP),
    effectiveDate: isoDate(p.EFF_DATE),
    dfirmId: str(p.DFIRM_ID),
    communityNumber: str(p.PCOMM),
    suffix: str(p.SUFFIX),
    unmapped: /unmapped/i.test(String(p.PANEL_TYP || '')),
  };
}

function normalizeAvailability(p) {
  return { id: p.OBJECTID, studyId: str(p.STUDY_ID) };
}

const NORMALIZERS = {
  availability: normalizeAvailability,
  panels: normalizePanel,
  zones: normalizeZone,
  zonesFine: normalizeZone,
};

/**
 * Drop features with no geometry and anything classified out (minimal X).
 * Null-valued properties are omitted — most NFHL attributes are "not
 * applicable" for most polygons, and a dense viewport has thousands of them.
 */
export function normalizeFeatures(datasetKey, features) {
  const normalize = NORMALIZERS[datasetKey];
  const out = [];
  for (const f of features || []) {
    if (!f?.geometry) continue;
    const full = normalize(f.properties || {});
    if (full.category === CATEGORIES.MINIMAL) continue;
    const properties = {};
    for (const [k, v] of Object.entries(full)) {
      if (v !== null && v !== false) properties[k] = v;
    }
    out.push({ type: 'Feature', id: properties.id, geometry: f.geometry, properties });
  }
  return out;
}

/** Merge per-tile feature lists, de-duplicating features that span tiles. */
export function mergeTiles(tileFeatureLists) {
  const seen = new Set();
  const features = [];
  for (const list of tileFeatureLists) {
    for (const f of list) {
      const key = f.properties?.id ?? f.id;
      if (key != null) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      features.push(f);
    }
  }
  return { type: 'FeatureCollection', features };
}

// ─── Upstream ───────────────────────────────────────────────────────────────

export class UpstreamError extends Error {
  constructor(message, { retryable = false } = {}) {
    super(message);
    this.retryable = retryable;
  }
}

const UPSTREAM_TIMEOUT_MS = 15000;

/**
 * FEMA's server resets connections (ECONNRESET) when hit with ~10 parallel
 * queries, which a cold viewport easily produces. Cap concurrent upstream
 * requests per instance, and retry resets / 5xx / 429 with backoff.
 */
export const MAX_UPSTREAM_CONCURRENCY = 4;
const RETRY_DELAYS_MS = [250, 750];

let activeUpstream = 0;
const upstreamQueue = [];

async function withUpstreamSlot(fn) {
  if (activeUpstream >= MAX_UPSTREAM_CONCURRENCY) {
    await new Promise((resolve) => upstreamQueue.push(resolve));
  }
  activeUpstream += 1;
  try {
    return await fn();
  } finally {
    activeUpstream -= 1;
    upstreamQueue.shift()?.();
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildQueryUrl(dataset, bounds, offset) {
  const { west, south, east, north } = bounds;
  const params = new URLSearchParams({
    geometry: JSON.stringify({ xmin: west, ymin: south, xmax: east, ymax: north, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outSR: '4326',
    where: dataset.where,
    outFields: dataset.outFields.join(','),
    returnGeometry: 'true',
    maxAllowableOffset: String(dataset.maxAllowableOffset),
    geometryPrecision: String(dataset.geometryPrecision),
    orderByFields: 'OBJECTID',
    resultOffset: String(offset),
    resultRecordCount: String(PAGE_SIZE),
    f: 'geojson',
  });
  return `${NFHL_SERVICE_URL}/${dataset.layerId}/query?${params}`;
}

/** One upstream query, parsed. Throws UpstreamError (retryable when transient). */
async function queryOnce(url, fetchImpl) {
  let resp;
  try {
    resp = await fetchImpl(url, {
      headers: { Accept: 'application/geo+json, application/json' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    const cause = err?.cause?.code || err?.name || 'network error';
    throw new UpstreamError(`FEMA request failed (${cause})`, { retryable: true });
  }
  if (!resp.ok) {
    throw new UpstreamError(`FEMA responded HTTP ${resp.status}`, { retryable: resp.status >= 500 || resp.status === 429 });
  }
  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new UpstreamError('FEMA returned a non-JSON response', { retryable: true });
  }
  if (data?.error) throw new UpstreamError(`FEMA query error ${data.error.code ?? ''}`.trim(), { retryable: data.error.code >= 500 });
  if (!Array.isArray(data?.features)) throw new UpstreamError('Unexpected FEMA response format');
  return { data, bytes: text.length };
}

async function queryWithRetry(url, fetchImpl, delays = RETRY_DELAYS_MS) {
  let attempts = 0;
  for (;;) {
    attempts += 1;
    try {
      const res = await withUpstreamSlot(() => queryOnce(url, fetchImpl));
      return { ...res, attempts };
    } catch (err) {
      const delay = delays[attempts - 1];
      if (!(err instanceof UpstreamError) || !err.retryable || delay == null) {
        err.attempts = attempts;
        throw err;
      }
      await sleep(delay);
    }
  }
}

/**
 * Query one dataset for one tile, paging past ArcGIS's record cap.
 * @returns {Promise<{ features: object[], truncated: boolean, bytes: number, requests: number }>}
 */
export async function fetchTile(datasetKey, tile, { fetchImpl = fetch, retryDelaysMs } = {}) {
  const dataset = DATASETS[datasetKey];
  const bounds = tileBounds(tile.x, tile.y, tile.z);
  const raw = [];
  let bytes = 0;
  let requests = 0;
  let truncated = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = buildQueryUrl(dataset, bounds, page * PAGE_SIZE);
    const { data, bytes: pageBytes, attempts } = await queryWithRetry(url, fetchImpl, retryDelaysMs);
    requests += attempts;
    bytes += pageBytes;
    raw.push(...data.features);

    const exceeded = data.exceededTransferLimit || data.properties?.exceededTransferLimit;
    if (!exceeded) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }

  return { features: normalizeFeatures(datasetKey, raw), truncated, bytes, requests };
}

// ─── Cache ──────────────────────────────────────────────────────────────────

/**
 * In-memory TTL cache keyed by `nfhl:<version>:<dataset>:<z>/<x>/<y>`.
 *
 * - `ttlMs`: how long an entry is served as fresh.
 * - `staleMs`: how long past that an entry is still kept to fall back on if
 *   FEMA is down — an outage degrades to day-old flood zones (which change on
 *   the scale of months) instead of an empty layer.
 * - `version` is part of every key, so bumping NFHL_CACHE_VERSION (an env var
 *   change creates a new Cloud Run revision) invalidates everything at once.
 */
export class TileCache {
  constructor({ ttlMs, staleMs, maxEntries, version, now = Date.now }) {
    this.ttlMs = ttlMs;
    this.staleMs = staleMs;
    this.maxEntries = maxEntries;
    this.version = version;
    this.now = now;
    this.entries = new Map();
    this.inFlight = new Map();
  }

  key(datasetKey, tile) {
    return `nfhl:${this.version}:${datasetKey}:${tile.z}/${tile.x}/${tile.y}`;
  }

  /**
   * @param {string} key
   * @param {() => Promise<object>} loader
   * @returns {Promise<{ value: object, status: 'hit'|'miss'|'stale' }>}
   */
  async get(key, loader) {
    const entry = this.entries.get(key);
    const age = entry ? this.now() - entry.storedAt : Infinity;
    if (entry && age < this.ttlMs) {
      // Refresh LRU position.
      this.entries.delete(key);
      this.entries.set(key, entry);
      return { value: entry.value, status: 'hit' };
    }

    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = loader()
        .then((value) => {
          this.set(key, value);
          return value;
        })
        .finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, pending);
    }

    try {
      return { value: await pending, status: 'miss' };
    } catch (err) {
      if (entry && age < this.ttlMs + this.staleMs) return { value: entry.value, status: 'stale' };
      throw err;
    }
  }

  set(key, value) {
    this.entries.delete(key);
    while (this.entries.size >= this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value);
    }
    this.entries.set(key, { value, storedAt: this.now() });
  }

  get size() {
    return this.entries.size;
  }
}

// ─── Rate limiting ──────────────────────────────────────────────────────────

/**
 * Fixed-window per-client limiter. Per Cloud Run instance, so the effective
 * ceiling is limit × instances — it exists to stop one client hammering the
 * service (and FEMA through it), not to meter fair use precisely.
 * Client keys are held in memory only for the current window and never logged.
 */
export class RateLimiter {
  constructor({ limit, windowMs, now = Date.now }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.windowStart = now();
    this.counts = new Map();
  }

  allow(clientKey) {
    const t = this.now();
    if (t - this.windowStart >= this.windowMs) {
      this.windowStart = t;
      this.counts.clear();
    }
    const n = (this.counts.get(clientKey) || 0) + 1;
    this.counts.set(clientKey, n);
    return n <= this.limit;
  }
}

// ─── Request handler ────────────────────────────────────────────────────────

/**
 * Resolve a validated request into a response body. Fetches only the tiles
 * missing from the cache; everything else is served from memory.
 *
 * @returns {Promise<{ body: object, stats: object }>}
 */
export async function resolveFloodHazards({ bbox, zoom }, { cache, fetchImpl = fetch, retryDelaysMs }) {
  const level = levelForZoom(zoom);
  const stats = { level: level.name, tiles: 0, hits: 0, misses: 0, stale: 0, upstreamRequests: 0, upstreamBytes: 0 };
  const body = {
    level: level.name,
    attribution: ATTRIBUTION,
    truncated: false,
    generatedAt: new Date().toISOString(),
  };

  // Validate extent for every dataset before fetching anything.
  const plan = level.datasets.map((datasetKey) => {
    const tiles = tilesForBbox(bbox, DATASETS[datasetKey].tileZoom);
    if (tiles.length > MAX_TILES_PER_DATASET) {
      throw new RequestError('Requested area is too large for this zoom level — zoom in further', 413);
    }
    return { datasetKey, tiles };
  });

  await Promise.all(plan.map(async ({ datasetKey, tiles }) => {
    stats.tiles += tiles.length;
    const results = await Promise.all(tiles.map(async (tile) => {
      const { value, status } = await cache.get(cache.key(datasetKey, tile), async () => {
        const res = await fetchTile(datasetKey, tile, { fetchImpl, retryDelaysMs });
        stats.upstreamRequests += res.requests;
        stats.upstreamBytes += res.bytes;
        return { features: res.features, truncated: res.truncated };
      });
      if (status === 'hit') stats.hits += 1;
      else if (status === 'stale') stats.stale += 1;
      else stats.misses += 1;
      if (value.truncated) body.truncated = true;
      return value.features;
    }));

    const collection = mergeTiles(results);
    const outKey = datasetKey === 'zonesFine' ? 'zones' : datasetKey;
    body[outKey] = collection;
  }));

  for (const k of ['zones', 'panels', 'availability']) {
    if (!body[k]) body[k] = { type: 'FeatureCollection', features: [] };
  }
  if (stats.stale > 0) body.stale = true;
  return { body, stats };
}
