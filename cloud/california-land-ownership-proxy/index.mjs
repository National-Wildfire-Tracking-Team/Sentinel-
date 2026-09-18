/**
 * index.mjs
 * california-land-ownership-proxy — Google Cloud Run service (HTTP).
 *
 * Fronts CAL FIRE FRAP's "California Land Ownership (public)" dataset
 * (CNRA-hosted ArcGIS FeatureServer) for the Pro-only land ownership map
 * layer (src/app/api/californiaLandOwnership.js). The layer only ever loads
 * once the map is zoomed to within ~4 miles of visible radius (see
 * useCaliforniaLandOwnership.js), so every request bbox is small — but
 * ownership polygon boundaries (park/refuge/reservation edges) are still
 * dense enough that an unsimplified query can run ~300KB for a single
 * viewport. This service applies the same bbox + geometry-simplification
 * query server-side, and caches the response for a snapped ("quantized")
 * version of the requested bbox so repeated pans/zooms within the same
 * few-mile cell reuse one upstream fetch instead of re-querying ArcGIS.
 *
 * GET /land-ownership?bbox=<west>,<south>,<east>,<north>  (WGS84 degrees)
 */

import { createServer } from 'node:http';

const FEATURE_LAYER_URL =
  'https://jujyio9tsa7ehvfz.svcs1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services' +
  '/Public_Land_Ownership_view/FeatureServer/0/query';

const OUT_FIELDS = ['Own_Level', 'Own_Agency', 'Own_Group'].join(',');

// Cuts a typical close-in viewport's payload from ~300KB to ~25KB with no
// visible difference in the rendered fill at the zoom this layer requires.
const SIMPLIFY_OFFSET_DEG = 0.00005;

// Requests are snapped outward to this grid before querying ArcGIS, so
// nearby pans within the same cell share one cached response instead of
// each issuing their own upstream fetch.
const CACHE_CELL_DEG = 0.05; // ~3.4 miles at California's latitudes

const CACHE_TTL_MS = 30 * 60 * 1000; // ownership boundaries change rarely (dataset updates ~annually)
const MAX_CACHE_ENTRIES = 500; // bounds memory; evicted oldest-first

// Reject bbox requests larger than this — this layer is only ever fetched at
// close-in zoom, so an oversized bbox is either a bug or abuse, not real use.
const MAX_BBOX_SPAN_DEG = 0.5; // ~34 miles

const PORT = process.env.PORT || 8080;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(res, body, status = 200, extraHeaders = {}) {
  res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'application/json', ...extraHeaders });
  res.end(JSON.stringify(body));
}

/** @type {Map<string, { data: object, fetchedAt: number }>} */
const cache = new Map();
/** @type {Map<string, Promise<object>>} Coalesces concurrent requests for the same cell. */
const inFlight = new Map();

function parseBbox(url) {
  const raw = url.searchParams.get('bbox');
  if (!raw) return null;
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [west, south, east, north] = parts;
  if (west >= east || south >= north) return null;
  if (east - west > MAX_BBOX_SPAN_DEG || north - south > MAX_BBOX_SPAN_DEG) return null;
  return { west, south, east, north };
}

/** Snap a bbox outward to CACHE_CELL_DEG-aligned grid lines. */
function quantizeBbox({ west, south, east, north }) {
  const west_ = Math.floor(west / CACHE_CELL_DEG) * CACHE_CELL_DEG;
  const south_ = Math.floor(south / CACHE_CELL_DEG) * CACHE_CELL_DEG;
  const east_ = Math.ceil(east / CACHE_CELL_DEG) * CACHE_CELL_DEG;
  const north_ = Math.ceil(north / CACHE_CELL_DEG) * CACHE_CELL_DEG;
  return { west: west_, south: south_, east: east_, north: north_ };
}

function cacheKey({ west, south, east, north }) {
  return `${west.toFixed(4)}:${south.toFixed(4)}:${east.toFixed(4)}:${north.toFixed(4)}`;
}

async function queryFeatureLayer(bounds) {
  const { west, south, east, north } = bounds;
  const geometry = {
    xmin: west,
    ymin: south,
    xmax: east,
    ymax: north,
    spatialReference: { wkid: 4326 },
  };
  const params = new URLSearchParams({
    geometry: JSON.stringify(geometry),
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outSR: '4326',
    where: '1=1',
    outFields: OUT_FIELDS,
    returnGeometry: 'true',
    maxAllowableOffset: String(SIMPLIFY_OFFSET_DEG),
    f: 'geojson',
    resultRecordCount: '2000',
  });
  const resp = await fetch(`${FEATURE_LAYER_URL}?${params}`);
  if (!resp.ok) throw new Error(`ArcGIS query failed: HTTP ${resp.status}`);
  const data = await resp.json();
  if (data?.error) throw new Error(data.error.message || 'ArcGIS query error');
  if (!data?.features) throw new Error('Unexpected ArcGIS response format');
  return data;
}

async function getCached(quantized) {
  const key = cacheKey(quantized);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.data;

  if (!inFlight.has(key)) {
    inFlight.set(
      key,
      queryFeatureLayer(quantized)
        .then((data) => {
          if (cache.size >= MAX_CACHE_ENTRIES) {
            cache.delete(cache.keys().next().value);
          }
          cache.set(key, { data, fetchedAt: Date.now() });
          return data;
        })
        .finally(() => {
          inFlight.delete(key);
        })
    );
  }
  return inFlight.get(key);
}

async function handleLandOwnership(url, res) {
  const bbox = parseBbox(url);
  if (!bbox) {
    jsonResponse(res, { error: 'bbox must be "west,south,east,north" within a ~34 mile span' }, 400);
    return;
  }

  try {
    const data = await getCached(quantizeBbox(bbox));
    jsonResponse(res, data, 200, { 'Cache-Control': 'public, max-age=300' });
  } catch (err) {
    jsonResponse(res, { error: err instanceof Error ? err.message : String(err) }, 502);
  }
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }
  if (req.method !== 'GET') {
    jsonResponse(res, { error: 'Method not allowed' }, 405);
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === '/land-ownership') {
    await handleLandOwnership(url, res);
    return;
  }
  if (url.pathname === '/health') {
    jsonResponse(res, { ok: true });
    return;
  }
  jsonResponse(res, { error: 'Not found' }, 404);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[california-land-ownership-proxy] listening on ${PORT}`);
});
