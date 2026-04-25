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

const MD_URL =
  'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/spc_mesoscale_discussion/MapServer/0/query?' +
  new URLSearchParams({ where: '1=1', outFields: '*', f: 'geojson', resultRecordCount: '200' }).toString();

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

export async function fetchSpcMesoscaleDiscussions() {
  const data = await fetchWithCache(MD_URL, 'spc:md:active', {}, 5 * 60 * 1000);

  if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) {
    return {
      ...data,
      features: data.features.map(normalizeFeature),
    };
  }
  return { type: 'FeatureCollection', features: [] };
}
