/**
 * wpcMesoscaleDiscussion.js
 * Fetches active WPC Mesoscale Precipitation Discussions (MPDs) — the WPC
 * analog to SPC's Mesoscale Discussions, issued for heavy-rain/flash-flood
 * potential rather than severe convection.
 *
 * Unlike SPC MDs, WPC does not publish MPDs through
 * mapservices.weather.noaa.gov's ArcGIS services (checked: not present under
 * the outlooks/, hazards/ or precip/ folders there), so this reads the Iowa
 * Environmental Mesonet's mirror instead, which is public, open-CORS, and
 * already carries the parsed issue/expire/number fields:
 * https://mesonet.agron.iastate.edu/api/1/nws/wpc_mpd.geojson
 *
 * Properties returned per feature:
 *   product_id  – "202606302132-KWNH-AWUS01-FFGMPD" (IEM product id; full
 *                 discussion text is available via
 *                 https://mesonet.agron.iastate.edu/api/1/nwstext/{product_id})
 *   num         – MPD number, e.g. 551
 *   year        – issuance year
 *   issue       – ISO 8601 issuance time
 *   expire      – ISO 8601 expiration time
 *   concerning  – short heading, e.g. "HEAVY RAINFALL...FLASH FLOODING POSSIBLE"
 */

import { fetchWithCache } from '../utils/dataCache';

const MPD_URL = 'https://mesonet.agron.iastate.edu/api/1/nws/wpc_mpd.geojson';
const CACHE_KEY = 'wpc:mpd:active:v1';

/** Public WPC product page for a given MPD number/year. */
function buildProductUrl(num, year) {
  if (!Number.isFinite(num) || !Number.isFinite(year)) return null;
  return `https://www.wpc.ncep.noaa.gov/metwatch/metwatch_mpd_multi.php?md=${num}&yr=${year}`;
}

/** Format an ISO timestamp as "HHMM UTC", matching the SPC MD activeTill style. */
function formatExpireUtc(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}${mm} UTC`;
}

function normalizeFeature(feature) {
  const p = feature?.properties || {};
  const num = Number(p.num);
  const year = Number(p.year);

  return {
    ...feature,
    properties: {
      ...p,
      mpdNumber: Number.isFinite(num) ? num : null,
      activeTill: formatExpireUtc(p.expire),
      url: buildProductUrl(num, year),
    },
  };
}

export async function fetchWpcMesoscaleDiscussions() {
  const data = await fetchWithCache(MPD_URL, CACHE_KEY, {}, 5 * 60 * 1000);

  if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) {
    return {
      ...data,
      features: data.features.filter((f) => f?.geometry).map(normalizeFeature),
    };
  }
  return { type: 'FeatureCollection', features: [] };
}
