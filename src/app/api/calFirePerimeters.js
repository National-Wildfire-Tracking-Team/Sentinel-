/**
 * calFirePerimeters.js
 * CAL FIRE FRAP – Fire and Resource Assessment Program
 * Historical California fire perimeter polygons (statewide, back to the 1800s).
 *
 * Primary source is CAL FIRE's own first-party ArcGIS Server, which is kept
 * up to date to always point at the latest official "firep" release:
 *   https://egis.fire.ca.gov/arcgis/rest/services/FRAP/FirePerimeters_FS/FeatureServer/0/query
 *
 * Falls back to CAL FIRE's ArcGIS Online mirror of the same FRAP dataset
 * (same fields, hosted on Esri's infrastructure) if the first-party server
 * is unreachable or does not allow cross-origin browser requests:
 *   https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/
 *   California_Historic_Fire_Perimeters/FeatureServer/0/query
 *
 * Last-resort fallback is the same FRAP dataset published on California's
 * open data portal ("California Fire Perimeters (all)"):
 *   https://lab.data.ca.gov/dataset/california-fire-perimeters-all
 * That page is a CKAN catalog entry rather than a queryable ArcGIS endpoint,
 * so the actual perimeter file is resolved dynamically via CKAN's
 * package_show API and then fetched as GeoJSON; filtering by year/acreage
 * happens client-side afterward instead of via `where`/`outFields` params.
 *
 * No API key required – public government data services. Updated ~annually,
 * so results are cached far longer than the live NIFC/FIRIS perimeter feeds.
 */

import { fetchWithCache } from '../utils/dataCache';
import { MOCK_CALFIRE_HISTORICAL_PERIMETERS } from '../data/mockData';
import { throttleError } from '../../shared/utils/errorThrottle';

const CALFIRE_EGIS_BASE =
  'https://egis.fire.ca.gov/arcgis/rest/services/FRAP/FirePerimeters_FS/FeatureServer/0/query';

const CALFIRE_AGOL_MIRROR_BASE =
  'https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services' +
  '/California_Historic_Fire_Perimeters/FeatureServer/0/query';

const DATA_CA_GOV_PACKAGE_URL =
  'https://data.ca.gov/api/3/action/package_show?id=california-fire-perimeters-all';

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h – FRAP data only refreshes ~annually
const CKAN_RESOURCE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // resource URLs change rarely

const OUT_FIELDS = [
  'YEAR_',
  'STATE',
  'AGENCY',
  'UNIT_ID',
  'FIRE_NAME',
  'INC_NUM',
  'ALARM_DATE',
  'CONT_DATE',
  'CAUSE',
  'GIS_ACRES',
  'COMPLEX_NAME',
  'IRWINID',
].join(',');

function buildQueryUrl(base, { year, minAcres }) {
  const clauses = [`YEAR_>=${year}`];
  if (minAcres > 0) clauses.push(`GIS_ACRES>=${minAcres}`);

  const params = new URLSearchParams({
    where: clauses.join(' AND '),
    outFields: OUT_FIELDS,
    outSR: '4326',
    f: 'geojson',
  });

  return `${base}?${params}`;
}

async function withRetry(fn, { attempts = 2, baseDelayMs = 1000, tag = '[CAL FIRE FRAP]' } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        const delay = baseDelayMs * Math.pow(2, i);
        throttleError(tag, `Attempt ${i + 1}/${attempts} failed, retrying in ${delay}ms:`, err, {
          ttlMs: 30 * 1000,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

async function fetchFromSource(url, cacheKey, tag) {
  const data = await withRetry(() => fetchWithCache(url, cacheKey, {}, CACHE_TTL_MS), { tag });
  if (data?.error) throw new Error(data.error.message || 'ArcGIS error');
  if (!data?.features) throw new Error('Unexpected response format');
  return data;
}

/**
 * Resolve the current download URL for the "California Fire Perimeters (all)"
 * dataset on data.ca.gov via CKAN's package_show API, rather than hardcoding
 * a resource URL (CKAN resource IDs/URLs can change across dataset revisions).
 * Prefers a GeoJSON resource; falls back to any other JSON-ish resource.
 */
async function resolveDataCaGovResourceUrl() {
  const pkg = await fetchWithCache(
    DATA_CA_GOV_PACKAGE_URL,
    'calfire:datacagov:package',
    {},
    CKAN_RESOURCE_CACHE_TTL_MS
  );
  const resources = pkg?.result?.resources;
  if (!pkg?.success || !Array.isArray(resources) || resources.length === 0) {
    throw new Error('Unexpected data.ca.gov CKAN response');
  }

  const resource =
    resources.find(r => /geojson/i.test(r.format || '')) ||
    resources.find(r => /json/i.test(r.format || ''));

  if (!resource?.url) {
    throw new Error('No GeoJSON resource found in data.ca.gov dataset');
  }
  return resource.url;
}

/**
 * Fetch perimeters from the data.ca.gov mirror. Unlike the ArcGIS sources
 * this is a static file rather than a queryable endpoint, so year/acreage
 * filtering is applied client-side after fetching instead of via query params.
 */
async function fetchFromDataCaGov({ year, minAcres }) {
  const resourceUrl = await withRetry(resolveDataCaGovResourceUrl, {
    tag: '[CAL FIRE FRAP: data.ca.gov package_show]',
  });
  const data = await fetchFromSource(
    resourceUrl,
    `calfire:datacagov:perimeters:${resourceUrl}`,
    '[CAL FIRE FRAP: data.ca.gov]'
  );

  return {
    ...data,
    features: data.features.filter(f => {
      const p = f.properties || {};
      const featureYear = Number(p.YEAR_ ?? p.YEAR ?? p.Year ?? p.year_);
      const featureAcres = Number(p.GIS_ACRES ?? p.GISAcres ?? p.gis_acres ?? 0);
      const yearOk = Number.isNaN(featureYear) || featureYear >= year;
      const acresOk = minAcres <= 0 || featureAcres >= minAcres;
      return yearOk && acresOk;
    }),
  };
}

/**
 * Fetch historical fire perimeters from CAL FIRE FRAP.
 * Tries CAL FIRE's first-party egis.fire.ca.gov server first, then its
 * ArcGIS Online mirror, then falls back to mock data.
 * Defaults to the last 10 fire seasons to keep the statewide (1878+) dataset
 * a reasonable size for the browser to render.
 * @param {object} [opts]
 * @param {number} [opts.minYear] Earliest fire year to include (default: current year - 10)
 * @param {number} [opts.minAcres=0] Filter perimeters below this size
 * @returns {Promise<object>} GeoJSON FeatureCollection
 */
export async function fetchCalFireHistoricalPerimeters({ minYear, minAcres = 0 } = {}) {
  const year = minYear ?? new Date().getFullYear() - 10;

  const sources = [
    {
      label: 'egis.fire.ca.gov (CAL FIRE FRAP)',
      fetch: () =>
        fetchFromSource(
          buildQueryUrl(CALFIRE_EGIS_BASE, { year, minAcres }),
          `calfire:egis:perimeters:${year}:${minAcres}`,
          '[CAL FIRE FRAP: egis.fire.ca.gov]'
        ),
    },
    {
      label: 'ArcGIS Online mirror',
      fetch: () =>
        fetchFromSource(
          buildQueryUrl(CALFIRE_AGOL_MIRROR_BASE, { year, minAcres }),
          `calfire:agol:perimeters:${year}:${minAcres}`,
          '[CAL FIRE FRAP: ArcGIS Online mirror]'
        ),
    },
    {
      label: 'data.ca.gov',
      fetch: () => fetchFromDataCaGov({ year, minAcres }),
    },
  ];

  let lastErr;
  for (const { label, fetch: fetchSource } of sources) {
    try {
      const data = await fetchSource();
      return normalizeCalFireHistoricalPerimeters(data);
    } catch (err) {
      lastErr = err;
      throttleError('[CAL FIRE FRAP]', `${label} failed:`, err, { friendlyType: 'generic' });
    }
  }

  throttleError('[CAL FIRE FRAP]', 'Using fallback historical perimeters:', lastErr, {
    friendlyType: 'generic',
  });
  return MOCK_CALFIRE_HISTORICAL_PERIMETERS;
}

/**
 * Case-insensitive, alias-tolerant field lookup. The ArcGIS sources always
 * use the canonical FRAP field names (e.g. `YEAR_`), but the data.ca.gov
 * mirror is a separately-published copy of the same dataset and may not
 * preserve that exact casing, so each field is looked up under several
 * known aliases before falling back.
 */
function pick(props, ...keys) {
  for (const key of keys) {
    if (props[key] !== undefined && props[key] !== null && props[key] !== '') return props[key];
  }
  return undefined;
}

/**
 * Normalize CAL FIRE FRAP fields to a flat schema for the map layer.
 */
export function normalizeCalFireHistoricalPerimeters(geojson) {
  return {
    ...geojson,
    features: geojson.features.map(f => {
      const p = f.properties || {};
      return {
        ...f,
        properties: {
          FireName:      pick(p, 'FIRE_NAME', 'FireName') || pick(p, 'COMPLEX_NAME', 'ComplexName') || 'Unknown Fire',
          FireYear:      pick(p, 'YEAR_', 'YEAR', 'Year', 'FireYear') ?? null,
          GISAcres:      pick(p, 'GIS_ACRES', 'GISAcres') || 0,
          AlarmDate:     pick(p, 'ALARM_DATE', 'AlarmDate') || null,
          ContainedDate: pick(p, 'CONT_DATE', 'ContainedDate') || null,
          Agency:        pick(p, 'AGENCY', 'Agency') || '',
          UnitId:        pick(p, 'UNIT_ID', 'UnitId') || '',
          Cause:         pick(p, 'CAUSE', 'Cause') ?? null,
          IncidentNum:   pick(p, 'INC_NUM', 'IncidentNum') || '',
          IRWINID:       pick(p, 'IRWINID') || '',
          _source:       'CALFIRE_FRAP',
        },
      };
    }),
  };
}
