/**
 * mesoscaleDiscussionText.js
 * Fetches the full bulletin text for SPC Mesoscale Discussions and WPC
 * Mesoscale Precipitation Discussions so the detail panel can show the whole
 * discussion in-app instead of linking out to spc.noaa.gov / wpc.ncep.noaa.gov
 * (neither of which allows cross-origin reads).
 *
 * Both come from the Iowa Environmental Mesonet, which is public and
 * open-CORS (same source the WPC MPD polygons already use):
 *   SPC: AFOS retrieve for PIL SWOMCD — returns the latest N MDs back to
 *        back, each wrapped in \x01 … \x03, matched here by MD number.
 *   WPC: nwstext/{product_id} — the polygon feed already carries product_id.
 */

import { getCached, setCached } from '../utils/dataCache';

const IEM = 'https://mesonet.agron.iastate.edu';
const TEXT_TTL_MS = 10 * 60 * 1000;

// SPC issues a few dozen MDs on a busy day; 60 comfortably covers every
// still-active one without pulling a large payload.
const SPC_MD_LIST_URL = `${IEM}/cgi-bin/afos/retrieve.py?pil=SWOMCD&limit=60&fmt=text`;

/** Strip WMO control characters (SOH/ETX/RS) and surrounding blank lines. */
function cleanBulletin(text) {
  // eslint-disable-next-line no-control-regex -- stripping WMO framing bytes is the point
  return String(text || '').replace(/[\x01\x03\x1e]/g, '').replace(/\r/g, '').trim();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Full text of SPC Mesoscale Discussion `mdNumber`, or null if not found. */
export async function fetchSpcMdText(mdNumber) {
  if (!Number.isFinite(mdNumber)) return null;
  const cacheKey = `spc:md:text:${mdNumber}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const raw = await fetchText(SPC_MD_LIST_URL);
  const re = new RegExp(`Mesoscale Discussion\\s+0*${mdNumber}\\b`, 'i');
  const match = raw.split('\x03').map(cleanBulletin).find((b) => re.test(b));
  if (!match) return null;

  setCached(cacheKey, match, TEXT_TTL_MS);
  return match;
}

/** Full text of a WPC MPD by its IEM product id, or null if unavailable. */
export async function fetchWpcMpdText(productId) {
  if (!productId) return null;
  const cacheKey = `wpc:mpd:text:${productId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const text = cleanBulletin(await fetchText(`${IEM}/api/1/nwstext/${encodeURIComponent(productId)}`));
  if (!text) return null;

  setCached(cacheKey, text, TEXT_TTL_MS);
  return text;
}
