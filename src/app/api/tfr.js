/**
 * tfr.js
 * FAA Temporary Flight Restrictions (tfr.faa.gov), through
 * netlify/edge-functions/faa-tfr-proxy.js at /api/tfr/<route>.
 *
 *   shapes – every active TFR as a GeoJSON polygon (the FAA's WFS). A NOTAM
 *            with several areas comes back as several features.
 *   detail – one NOTAM's XNOTAM XML, read when a TFR is clicked: effective
 *            and expiry times, each area's altitudes, and the NOTAM text.
 */

export const TFR_BASE = '/api/tfr';

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

/** Every TFR draws in one red, whatever its type. */
export const TFR_COLOR = '#ef4444';

/** The WFS `LEGAL` value is the TFR's type, as tfr.faa.gov's list names it. */
export const TFR_TYPES = [
  { type: 'HAZARDS', label: 'Hazards (incl. wildfire)' },
  { type: 'SECURITY', label: 'Security' },
  { type: 'VIP', label: 'VIP movement' },
  { type: 'SPACE OPERATIONS', label: 'Space operations' },
  { type: 'AIR SHOWS/SPORTS', label: 'Air shows & sports' },
  { type: 'UAS PUBLIC GATHERING', label: 'Drone (UAS) restriction' },
  { type: 'SPECIAL', label: 'Special' },
];

const TYPE_BY_KEY = Object.fromEntries(TFR_TYPES.map((t) => [t.type, t]));

export function tfrTypeStyle(type) {
  const t = TYPE_BY_KEY[String(type || '').toUpperCase()] ?? { type, label: type || 'Other' };
  return { ...t, color: TFR_COLOR };
}

/** "6/9169-1-FDC-F" → "6/9169". */
export function notamIdFromKey(key) {
  return String(key || '').split('-')[0] || null;
}

/** "202610131537" (UTC) → ISO string. */
function wfsTimestamp(s) {
  const m = String(s || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00Z` : null;
}

function normalizeShape(feature) {
  const p = feature.properties || {};
  const notam = notamIdFromKey(p.NOTAM_KEY);
  return {
    type: 'Feature',
    geometry: feature.geometry,
    properties: {
      fid: feature.id || p.NOTAM_KEY,
      notam,
      title: p.TITLE || '',
      type: String(p.LEGAL || '').toUpperCase(),
      state: p.STATE || '',
      facility: p.CNS_LOCATION_ID || '',
      modified: wfsTimestamp(p.LAST_MODIFICATION_DATETIME),
    },
  };
}

/** Every active TFR outline, normalized. */
export async function fetchTfrShapes({ signal } = {}) {
  const res = await fetch(`${TFR_BASE}/shapes`, { signal });
  if (!res.ok) throw new Error(`FAA TFR: HTTP ${res.status}`);
  const fc = await res.json();
  if (!Array.isArray(fc?.features)) return EMPTY_FC;
  return {
    type: 'FeatureCollection',
    features: fc.features.filter((f) => f?.geometry).map(normalizeShape),
  };
}

// ─── Detail (XNOTAM XML) ────────────────────────────────────────────────────

/** Text of a direct child element, or null. */
function child(el, name) {
  if (!el) return null;
  for (const c of el.children) {
    if (c.tagName === name) {
      const text = c.textContent.trim();
      return text || null;
    }
  }
  return null;
}

function childEl(el, name) {
  if (!el) return null;
  for (const c of el.children) if (c.tagName === name) return c;
  return null;
}

/**
 * One altitude bound as a pilot reads it. `code` is the AIXM reference:
 * HEI = above ground, ALT = above sea level, STD = flight level.
 */
export function formatTfrAltitude(val, uom, code) {
  if (val == null) return null;
  const n = Number(val);
  if (String(uom).toUpperCase() === 'FL' || code === 'STD') return `FL${String(val).padStart(3, '0')}`;
  if (code === 'HEI' && n === 0) return 'Surface';
  const ft = Number.isFinite(n) ? n.toLocaleString('en-US') : val;
  const ref = code === 'HEI' ? 'AGL' : code === 'ALT' ? 'MSL' : '';
  return `${ft} ft${ref ? ` ${ref}` : ''}`;
}

/** "2026-10-15T13:00:00" + "EDT" → "Oct 15, 2026 13:00 EDT" (the zone the FAA gives, unconverted). */
export function formatTfrTime(iso, zone) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1];
  return `${month} ${Number(m[3])}, ${m[1]} ${m[4]}:${m[5]}${zone ? ` ${zone}` : ''}`;
}

/** XNOTAM XML text → the fields TfrDetail shows. */
export function parseTfrDetail(xmlText) {
  const doc = new DOMParser().parseFromString(String(xmlText).replace(/^\uFEFF/, ''), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('FAA TFR: unreadable NOTAM');
  const not = doc.getElementsByTagName('Not')[0];
  if (!not) throw new Error('FAA TFR: NOTAM not found');

  const uid = childEl(not, 'NotUid');
  const loc = childEl(not, 'AffLocGroup');
  const tfrNot = childEl(not, 'TfrNot');
  const areas = [...(tfrNot?.getElementsByTagName('TFRAreaGroup') ?? [])].map((group) => {
    const a = childEl(group, 'aseTFRArea');
    return {
      name: child(a, 'txtName'),
      upper: formatTfrAltitude(child(a, 'valDistVerUpper'), child(a, 'uomDistVerUpper'), child(a, 'codeDistVerUpper')),
      lower: formatTfrAltitude(child(a, 'valDistVerLower'), child(a, 'uomDistVerLower'), child(a, 'codeDistVerLower')),
    };
  });

  return {
    localName: child(uid, 'txtLocalName'),
    issued: child(uid, 'dateIssued'),
    effective: formatTfrTime(child(not, 'dateEffective'), child(not, 'codeTimeZone')),
    expire: formatTfrTime(child(not, 'dateExpire'), child(not, 'codeExpirationTimeZone') ?? child(not, 'codeTimeZone')),
    facility: child(not, 'codeFacility'),
    city: child(loc, 'txtNameCity'),
    state: child(loc, 'txtNameUSState'),
    regulation: child(tfrNot, 'codeType'),
    purpose: child(not, 'txtDescrPurpose'),
    text: child(not, 'txtDescrTraditional'),
    areas,
  };
}

/** tfr.faa.gov's page for a NOTAM, for "open on FAA". */
export function tfrFaaUrl(notam) {
  return `https://tfr.faa.gov/tfr3/?page=detail_${String(notam).replace('/', '_')}`;
}

export async function fetchTfrDetail(notam, { signal } = {}) {
  const res = await fetch(`${TFR_BASE}/detail/detail_${String(notam).replace('/', '_')}.xml`, { signal });
  if (!res.ok) throw new Error(`FAA TFR ${notam}: HTTP ${res.status}`);
  return parseTfrDetail(await res.text());
}
