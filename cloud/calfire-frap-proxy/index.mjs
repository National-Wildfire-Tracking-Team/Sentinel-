/**
 * index.mjs
 * calfire-frap-proxy — Google Cloud Run service (HTTP).
 *
 * The browser's last-resort fallback for CAL FIRE FRAP historical fire
 * perimeters (src/app/api/calFirePerimeters.js) is data.ca.gov's CKAN
 * mirror of the statewide "California Fire Perimeters (all)" dataset. Unlike
 * the primary ArcGIS sources (which filter server-side via `where`/
 * `outFields` query params), the CKAN resource is a single static GeoJSON
 * file covering every recorded fire back to the 1800s — the client was
 * downloading the whole thing into the browser and filtering by year/acreage
 * there. This service does that same fetch + filter once, server-side, and
 * hands the browser only the rows it asked for.
 *
 * GET /perimeters?minYear=<int>&minAcres=<number>
 *
 * The raw (unfiltered) CKAN payload is cached in memory for RAW_CACHE_TTL_MS
 * — the resource is a static file that data.ca.gov's own dataset says
 * updates ~annually, and this service redeploys/restarts often enough that
 * an in-memory cache (vs. Firestore/GCS) is simplest and sufficient; a cold
 * start just re-fetches once. Filtering is cheap and always done fresh per
 * request so minYear/minAcres stay fully dynamic.
 */

import { createServer } from 'node:http';
import { gzip } from 'node:zlib';

const DATA_CA_GOV_PACKAGE_URL =
  'https://data.ca.gov/api/3/action/package_show?id=california-fire-perimeters-all';

const RAW_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // matches the client's own CACHE_TTL_MS
const PORT = process.env.PORT || 8080;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// The default query (the last ten years, any size) is ~107 MB of GeoJSON
// and gzips to ~36 MB. That matters most on AWS Lambda, which streams
// anything past 6 MB at 2 MB/s. Same approach as fire-perimeters-merge:
// async so a large body doesn't block the event loop, falling back to the
// uncompressed body if zlib fails, and unchanged for clients that don't
// send Accept-Encoding: gzip.
const GZIP_MIN_BYTES = 1024;

function jsonResponse(res, body, status = 200, extraHeaders = {}) {
  const json = JSON.stringify(body);
  const headers = { ...CORS_HEADERS, 'Content-Type': 'application/json', Vary: 'Accept-Encoding', ...extraHeaders };
  const acceptsGzip = /\bgzip\b/.test(res.req?.headers['accept-encoding'] || '');
  if (!acceptsGzip || json.length < GZIP_MIN_BYTES) {
    res.writeHead(status, headers);
    res.end(json);
    return;
  }
  gzip(json, (err, compressed) => {
    if (err) {
      res.writeHead(status, headers);
      res.end(json);
      return;
    }
    res.writeHead(status, { ...headers, 'Content-Encoding': 'gzip' });
    res.end(compressed);
  });
}

/** @type {{ data: object, fetchedAt: number } | null} */
let rawCache = null;
/** Coalesces concurrent cold-start requests onto a single upstream fetch. */
let inFlight = null;

/**
 * Resolve the current download URL for the "California Fire Perimeters
 * (all)" dataset via CKAN's package_show API rather than hardcoding a
 * resource URL (CKAN resource IDs/URLs can change across dataset revisions)
 * — same approach as the client's own resolveDataCaGovResourceUrl().
 */
async function resolveResourceUrl() {
  const resp = await fetch(DATA_CA_GOV_PACKAGE_URL);
  if (!resp.ok) throw new Error(`CKAN package_show failed: HTTP ${resp.status}`);
  const pkg = await resp.json();
  const resources = pkg?.result?.resources;
  if (!pkg?.success || !Array.isArray(resources) || resources.length === 0) {
    throw new Error('Unexpected data.ca.gov CKAN response');
  }
  const resource =
    resources.find((r) => /geojson/i.test(r.format || '')) ||
    resources.find((r) => /json/i.test(r.format || ''));
  if (!resource?.url) throw new Error('No GeoJSON resource found in data.ca.gov dataset');
  return resource.url;
}

async function fetchRaw() {
  const resourceUrl = await resolveResourceUrl();
  const resp = await fetch(resourceUrl);
  if (!resp.ok) throw new Error(`CKAN resource fetch failed: HTTP ${resp.status}`);
  const data = await resp.json();
  if (!data?.features) throw new Error('Unexpected CKAN resource format');
  return data;
}

async function getRawCached() {
  if (rawCache && Date.now() - rawCache.fetchedAt < RAW_CACHE_TTL_MS) {
    return rawCache.data;
  }
  if (!inFlight) {
    inFlight = fetchRaw()
      .then((data) => {
        rawCache = { data, fetchedAt: Date.now() };
        return data;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Same alias-tolerant field lookup as the client's normalizer. */
function pick(props, ...keys) {
  for (const key of keys) {
    if (props[key] !== undefined && props[key] !== null && props[key] !== '') return props[key];
  }
  return undefined;
}

function filterFeatures(data, { minYear, minAcres }) {
  return {
    ...data,
    features: data.features.filter((f) => {
      const p = f.properties || {};
      const year = Number(pick(p, 'YEAR_', 'YEAR', 'Year', 'year_'));
      const acres = Number(pick(p, 'GIS_ACRES', 'GISAcres', 'gis_acres') ?? 0);
      const yearOk = Number.isNaN(year) || year >= minYear;
      const acresOk = minAcres <= 0 || acres >= minAcres;
      return yearOk && acresOk;
    }),
  };
}

async function handlePerimeters(url, res) {
  const minYear = Number(url.searchParams.get('minYear')) || new Date().getFullYear() - 10;
  const minAcres = Number(url.searchParams.get('minAcres')) || 0;

  try {
    const raw = await getRawCached();
    const filtered = filterFeatures(raw, { minYear, minAcres });
    jsonResponse(res, filtered, 200, { 'Cache-Control': 'public, max-age=300' });
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
  if (url.pathname === '/perimeters') {
    await handlePerimeters(url, res);
    return;
  }
  if (url.pathname === '/health') {
    jsonResponse(res, { ok: true });
    return;
  }
  jsonResponse(res, { error: 'Not found' }, 404);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[calfire-frap-proxy] listening on ${PORT}`);
});
