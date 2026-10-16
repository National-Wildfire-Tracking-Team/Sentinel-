/**
 * wpcSurfaceAnalysis.js
 * The live WPC surface analysis — the same coded bulletin NOAA's surface
 * analysis maps are drawn from ("CODED SURFACE FRONTAL POSITIONS", CODSUS),
 * reissued every 3 hours: every front, and every high and low with its
 * central pressure.
 *
 *   https://www.wpc.ncep.noaa.gov/discussions/codsus_hr   (via /api/nws/wpc-codsus)
 *
 * Format (high-resolution issue):
 *   VALID 101615Z                       ← MMDDHH, UTC
 *   HIGHS 1046 3861040 1046 4261031 …   ← pressure (mb), position
 *   LOWS  998 4560736 …
 *   COLD  4370776 4020802 …             ← a front's points, in order
 *   WARM / STNRY / OCFNT / TROF / DRYLINE / SQLN …
 * A record continues onto following lines until the next keyword.
 * Positions are LLLllll in tenths of a degree, west longitude (4370776 =
 * 43.7°N 77.6°W); the low-resolution issue uses whole degrees (4478, 39104).
 *
 * Point order matters: WPC lists each front so its symbols (triangles,
 * semicircles) sit on the LEFT side of the line as you walk the points,
 * i.e. facing the way the front is moving (see frontSymbols.js).
 */

const URL = '/api/nws/wpc-codsus/codsus_hr';

/** Bulletin keyword → front type used by the map layer */
const FRONT_KEYWORDS = {
  COLD: 'COLD',
  WARM: 'WARM',
  STNRY: 'STATIONARY',
  OCFNT: 'OCCLUDED',
  TROF: 'TROUGH',
  DRYLINE: 'DRYLINE',
  DRYLN: 'DRYLINE',
  SQLN: 'SQUALL',
};

/** Decode one position token to [lng, lat], or null. */
export function decodePosition(token) {
  if (!/^\d+$/.test(token)) return null;
  if (token.length === 7) {
    return [-Number(token.slice(3)) / 10, Number(token.slice(0, 3)) / 10];
  }
  if (token.length === 4 || token.length === 5) {
    return [-Number(token.slice(2)), Number(token.slice(0, 2))];
  }
  return null;
}

/** "101615Z" → ms, using the issuance year (rolling back over New Year). */
function validTimeMs(code, now) {
  const m = /^(\d{2})(\d{2})(\d{2})Z$/.exec(code ?? '');
  if (!m) return null;
  const year = new Date(now).getUTCFullYear();
  let t = Date.UTC(year, Number(m[1]) - 1, Number(m[2]), Number(m[3]));
  if (t - now > 180 * 86400000) t = Date.UTC(year - 1, Number(m[1]) - 1, Number(m[2]), Number(m[3]));
  return t;
}

/**
 * Parse the coded bulletin.
 * @param {string} text  bulletin text (HTML wrapper allowed)
 * @returns {{ validTime: number|null,
 *   fronts: GeoJSON.FeatureCollection,      // LineStrings, properties.frontType
 *   centers: GeoJSON.FeatureCollection }}   // Points, properties.kind 'H'|'L', pressure
 */
export function parseCodedSurface(text, now = Date.now()) {
  const pre = /<pre[^>]*>([\s\S]*?)<\/pre>/i.exec(text);
  const body = (pre ? pre[1] : text).replace(/<[^>]+>/g, ' ');
  const tokens = body.split(/\s+/).filter(Boolean);

  const validIdx = tokens.indexOf('VALID');
  const validTime = validIdx >= 0 ? validTimeMs(tokens[validIdx + 1], now) : null;

  // Group tokens into records: a keyword and the values up to the next keyword.
  const records = [];
  for (const tok of tokens.slice(validIdx >= 0 ? validIdx + 2 : 0)) {
    if (/^[A-Z]+$/.test(tok)) records.push({ key: tok, values: [] });
    else if (records.length) records[records.length - 1].values.push(tok);
  }

  const fronts = [];
  const centers = [];
  records.forEach((rec, r) => {
    if (rec.key === 'HIGHS' || rec.key === 'LOWS') {
      const kind = rec.key === 'HIGHS' ? 'H' : 'L';
      for (let i = 0; i + 1 < rec.values.length; i += 2) {
        const pressure = Number(rec.values[i]);
        const pos = decodePosition(rec.values[i + 1]);
        if (!pos || !Number.isFinite(pressure)) continue;
        centers.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: pos },
          properties: { kind, pressure, label: `${kind === 'H' ? 'High' : 'Low'} ${pressure} mb` },
        });
      }
      return;
    }
    const frontType = FRONT_KEYWORDS[rec.key];
    if (!frontType) return;
    const coords = rec.values.map(decodePosition).filter(Boolean);
    if (coords.length < 2) return;
    fronts.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: { id: `wpc-sfc-${r}`, frontType, source: 'analysis' },
    });
  });

  return {
    validTime,
    fronts: { type: 'FeatureCollection', features: fronts },
    centers: { type: 'FeatureCollection', features: centers },
  };
}

/** Fetch and parse the current surface analysis. */
export async function fetchSurfaceAnalysis({ signal } = {}) {
  const res = await fetch(URL, { signal });
  if (!res.ok) throw new Error(`WPC surface analysis HTTP ${res.status}`);
  return parseCodedSurface(await res.text());
}
