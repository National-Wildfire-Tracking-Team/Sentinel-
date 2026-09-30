/**
 * nwsMapServerAlerts.js
 * Supplemental NWS watch/warning/advisory polygons from the NOAA WWA MapServer
 * (mapservices.weather.noaa.gov …/WWA/watch_warn_adv/MapServer, proxied at
 * /api/nws/wwa by netlify/edge-functions/nws-mapservices-proxy.js).
 *
 * api.weather.gov (noaaWeather.js) is the primary alert source; this only
 * fills in alerts the NWS API doesn't have. The caller discards any MapServer
 * alert whose cap_id it already holds, which in practice is nearly all of
 * them — and layer 1's full nationwide geometry is ~13 MB raw / ~4.7 MB
 * gzipped per poll. So the lookup is ID-first:
 *
 *   1. Ask each layer for its distinct cap_ids only (a few KB, no geometry).
 *   2. Diff against the ids already loaded from api.weather.gov.
 *   3. Fetch geometry only for the missing ids, in `cap_id IN (…)` batches.
 *
 * Anything that stops the diff from being trustworthy — a failed or malformed
 * id response, a truncated id list, an id we can't safely quote into a where
 * clause, a failed geometry batch — falls back to the original full-layer
 * query for that layer. The optimization may cost bandwidth when it fails;
 * it must never cost an alert.
 */

const MAPSERVER_BASE = '/api/nws/wwa';

export const MAPSERVER_LAYERS = [0, 1];

const ALERT_FIELDS = 'prod_type,sig,cap_id,issuance,expiration';

// ~50 URN-style cap_ids is ~3.6 KB of where clause — comfortably inside URL
// limits while keeping a gap-heavy cycle to a handful of requests.
export const ID_BATCH_SIZE = 50;

// cap_ids are CAP URNs ("urn:oid:2.49.0.1.840.0.<hash>.001.1"). Anything
// outside this charset can't be quoted into a where clause with confidence,
// so it sends the layer down the full-query fallback instead.
const CAP_ID_PATTERN = /^[A-Za-z0-9:._-]+$/;

/**
 * The original full-layer query. Kept byte-for-byte identical to the URL the
 * hook used before the ID-first change so the fallback shares its CDN cache
 * key with any client still on the old build.
 */
export function fullLayerUrl(layerId) {
  return (
    `${MAPSERVER_BASE}/${layerId}/query` +
    `?where=1%3D1&outFields=${ALERT_FIELDS}` +
    `&outSR=4326&f=geojson`
  );
}

export function idQueryUrl(layerId) {
  return (
    `${MAPSERVER_BASE}/${layerId}/query` +
    `?where=1%3D1&outFields=cap_id&returnGeometry=false` +
    `&returnDistinctValues=true&f=json`
  );
}

export function geometryQueryUrl(layerId, capIds) {
  const where = `cap_id IN (${capIds.map((id) => `'${id}'`).join(',')})`;
  return (
    `${MAPSERVER_BASE}/${layerId}/query` +
    `?where=${encodeURIComponent(where)}&outFields=${ALERT_FIELDS}` +
    `&outSR=4326&f=geojson`
  );
}

/**
 * Parse an `f=json` distinct-cap_id response.
 *
 * @returns {string[] | null}  the layer's cap_ids, or null when the response
 *   can't be trusted as a complete id list (caller must fall back).
 */
export function parseIdResponse(data) {
  if (!data || typeof data !== 'object' || data.error) return null;
  if (!Array.isArray(data.features)) return null;
  // A truncated list would make every id past the cutoff look "already
  // loaded" — exactly the silent suppression the fallback exists to prevent.
  if (data.exceededTransferLimit) return null;

  const ids = [];
  for (const f of data.features) {
    const capId = f?.attributes?.cap_id;
    // Rows without a cap_id were always dropped downstream (mergeAlerts keys
    // on id), so skipping them here preserves existing behavior.
    if (capId == null || capId === '') continue;
    if (typeof capId !== 'string' || !CAP_ID_PATTERN.test(capId)) return null;
    ids.push(capId);
  }
  return ids;
}

function isFeatureCollection(data) {
  return Boolean(data) && typeof data === 'object' && !data.error && Array.isArray(data.features);
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Full-layer fetch, with the same failure semantics the hook always had. */
async function fetchFullLayer(layerId) {
  try {
    const data = await getJson(fullLayerUrl(layerId));
    return isFeatureCollection(data) ? data.features : [];
  } catch (err) {
    console.warn('[WeatherAlerts] MapServer full query failed:', err?.message || err, `layer ${layerId}`);
    return [];
  }
}

async function fetchLayer(layerId, knownIds, stats) {
  let ids;
  try {
    ids = parseIdResponse(await getJson(idQueryUrl(layerId)));
  } catch {
    ids = null;
  }

  if (ids === null) {
    stats.fallbackLayers.push(layerId);
    return fetchFullLayer(layerId);
  }

  stats.mapServerIds += ids.length;
  const missing = [...new Set(ids)].filter((id) => !knownIds.has(id));
  stats.missingIds += missing.length;
  if (!missing.length) return [];

  try {
    const batches = chunk(missing, ID_BATCH_SIZE);
    stats.geometryRequests += batches.length;
    const results = await Promise.all(batches.map((b) => getJson(geometryQueryUrl(layerId, b))));
    if (!results.every(isFeatureCollection)) throw new Error('malformed geometry response');

    const wanted = new Set(missing);
    return results.flatMap((r) => r.features).filter((f) => wanted.has(f?.properties?.cap_id));
  } catch (err) {
    console.warn('[WeatherAlerts] MapServer geometry batch failed, using full query:', err?.message || err, `layer ${layerId}`);
    stats.fallbackLayers.push(layerId);
    return fetchFullLayer(layerId);
  }
}

/* =========================
   SEVERITY MAP
   ========================= */
export function sigToSeverity(sig) {
  if (sig === 'W') return 'Extreme';
  if (sig === 'A') return 'Severe';
  if (sig === 'Y') return 'Moderate';
  if (sig === 'S') return 'Minor';
  return 'Unknown';
}

export function sigToUrgency(sig) {
  if (sig === 'W') return 'Immediate';
  if (sig === 'A') return 'Expected';
  return 'Unknown';
}

function toAlert(f) {
  return {
    id: f.properties.cap_id || null,
    type: f.properties.prod_type || null,
    severity: sigToSeverity(f.properties.sig),
    urgency: sigToUrgency(f.properties.sig),
    geometry: f.geometry,
    geocode: null,
    source: 'NWS',
  };
}

/**
 * Fetch the MapServer alerts that aren't already loaded.
 *
 * @param {Set<string>} knownIds  alert ids already loaded from api.weather.gov
 * @returns {Promise<{ alerts: object[], stats: object }>}
 *   `alerts` are normalized the same way the hook always normalized them.
 *   On the fallback path they may include already-known ids, which the
 *   caller's existing de-dup filter removes exactly as before.
 */
export async function fetchMapServerSupplement(knownIds) {
  const stats = {
    mode: 'id-first',
    mapServerIds: 0,
    missingIds: 0,
    geometryRequests: 0,
    fallbackLayers: [],
    features: 0,
  };

  // Without a usable id set the diff is meaningless — take the old path.
  if (!(knownIds instanceof Set)) {
    stats.mode = 'fallback';
    stats.fallbackLayers = [...MAPSERVER_LAYERS];
    const features = (await Promise.all(MAPSERVER_LAYERS.map(fetchFullLayer))).flat();
    stats.features = features.length;
    return { alerts: features.map(toAlert), stats };
  }

  const features = (
    await Promise.all(MAPSERVER_LAYERS.map((id) => fetchLayer(id, knownIds, stats)))
  ).flat();

  if (stats.fallbackLayers.length) stats.mode = 'fallback';
  stats.features = features.length;
  return { alerts: features.map(toAlert), stats };
}
