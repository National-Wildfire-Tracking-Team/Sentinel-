/**
 * spcMesoscaleDiscussion.js
 * Fetches active SPC Mesoscale Discussions (MDs) from the NOAA MapServer.
 * https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/spc_mesoscale_discussion/MapServer
 *
 * Properties returned per feature:
 *   name        – "MD 0519"
 *   folderpath  – "MD 0519 Active Till 2130 UTC"
 *   popupinfo   – "http://www.spc.noaa.gov/products/md/md0519.html"
 */

import { fetchWithCache } from '../utils/dataCache';

/** Exclude NOAA placeholder polygon shown when no MD is active (name "NoArea"). */
const MD_URL =
  'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/spc_mesoscale_discussion/MapServer/0/query?' +
  new URLSearchParams({
    where: "name <> 'NoArea'",
    outFields: '*',
    f: 'geojson',
    resultRecordCount: '200',
  }).toString();

const CACHE_KEY = 'spc:md:active:v2';

/** Parse the expiry time from folderpath, e.g. "MD 0519 Active Till 2130 UTC" → "2130 UTC" */
function parseActiveTill(folderpath = '') {
  const m = /active\s+till\s+(\d{4}\s+utc)/i.exec(folderpath);
  return m ? m[1].toUpperCase() : null;
}

/** Parse MD number from name, e.g. "MD 0519" → 519 */
function parseMdNumber(name = '') {
  const m = /md\s*(\d+)/i.exec(name);
  return m ? parseInt(m[1], 10) : null;
}

function normalizeFeature(feature) {
  const p = feature?.properties || {};
  const activeTill = parseActiveTill(p.folderpath);
  const mdNumber   = parseMdNumber(p.name);

  return {
    ...feature,
    properties: {
      ...p,
      mdNumber,
      activeTill,
      url: p.popupinfo || null,
    },
  };
}

function isPlaceholderMd(feature) {
  const name = String(feature?.properties?.name ?? '').trim();
  return /^noarea$/i.test(name);
}

export async function fetchSpcMesoscaleDiscussions() {
  const data = await fetchWithCache(MD_URL, CACHE_KEY, {}, 5 * 60 * 1000);

  if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) {
    const features = data.features
      .filter((f) => f?.geometry && !isPlaceholderMd(f))
      .map(normalizeFeature);
    return {
      ...data,
      features,
    };
  }
  return { type: 'FeatureCollection', features: [] };
}
