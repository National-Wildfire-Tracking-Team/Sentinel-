/**
 * floodHazard.js
 * Display metadata for the FEMA National Flood Hazard Layer (NFHL) map layer.
 *
 * Category keys come from cloud/fema-nfhl-proxy/nfhl.mjs's classifyZone(),
 * which follows FEMA's own renderer for the NFHL FIRMette service. Colors
 * start from FEMA's palette (1% cyan, 0.2% orange, floodway red, undetermined
 * yellow) and are tuned only enough to read against Sentinel's satellite
 * basemap at the layer's low opacity.
 */

export const FLOOD_ATTRIBUTION = 'Flood hazard data: FEMA National Flood Hazard Layer (NFHL)';

/**
 * Map zoom thresholds — mirrors LEVELS in cloud/fema-nfhl-proxy/nfhl.mjs.
 * The server is authoritative; these only drive the client's own hints and
 * its request-snapping cache key, so drift costs cache hits, not correctness.
 */
export const FLOOD_MIN_ZOOM = 7;
export const FLOOD_DETAIL_ZOOM = 12;
export const FLOOD_FINE_ZOOM = 14;

export function floodLevelForZoom(zoom) {
  if (!Number.isFinite(zoom) || zoom < FLOOD_MIN_ZOOM) return null;
  if (zoom >= FLOOD_FINE_ZOOM) return { name: 'fine', tileZoom: 14 };
  if (zoom >= FLOOD_DETAIL_ZOOM) return { name: 'detail', tileZoom: 12 };
  return { name: 'overview', tileZoom: 7 };
}

/**
 * Ordered most → least severe; the legend lists them in this order.
 * `sfha` marks categories inside FEMA's Special Flood Hazard Area.
 */
export const FLOOD_CATEGORIES = {
  floodway: {
    label: 'Regulatory Floodway',
    color: '#ef4444',
    sfha: true,
    description: 'The channel and adjacent land that must be kept free of encroachment so the 1% annual chance flood can pass without raising flood heights.',
  },
  special_floodway: {
    label: 'Special Floodway',
    color: '#dc2626',
    sfha: true,
    description: 'A floodway designated under special local or state rules (e.g. density fringe or special consideration areas).',
  },
  coastal_high_hazard: {
    label: '1% Annual Chance — Coastal High Hazard',
    color: '#2563eb',
    sfha: true,
    description: 'Coastal area subject to the 1% annual chance flood with additional hazards from storm-driven waves (Zones V/VE).',
  },
  pct_1: {
    label: '1% Annual Chance Flood Hazard',
    color: '#00c8f0',
    sfha: true,
    description: 'Special Flood Hazard Area — land with a 1% or greater chance of flooding in any given year (the "100-year" floodplain).',
  },
  levee_risk: {
    label: 'Area with Risk Due to Levee',
    color: '#a855f7',
    sfha: false,
    description: 'Area behind a levee that is not accredited to provide protection from the 1% annual chance flood; flood hazard is undetermined.',
  },
  future_1pct: {
    label: 'Future Conditions 1% Annual Chance',
    color: '#94a3b8',
    sfha: false,
    description: '1% annual chance floodplain based on projected future land-use and watershed conditions.',
  },
  pct_0_2: {
    label: '0.2% Annual Chance Flood Hazard',
    color: '#ff8000',
    sfha: false,
    description: 'Moderate flood hazard — 0.2% annual chance (the "500-year" floodplain), or 1% annual chance with average depths under 1 foot or drainage areas under 1 square mile.',
  },
  levee_reduced: {
    label: 'Reduced Flood Risk Due to Levee',
    color: '#64748b',
    sfha: false,
    description: 'Area protected by an accredited levee from the 1% annual chance flood. Risk is reduced, not removed — levees can be overtopped or fail.',
  },
  undetermined: {
    label: 'Undetermined Flood Hazard',
    color: '#e6d26b',
    sfha: false,
    description: 'Zone D — flood hazards are possible but have not been studied or determined.',
  },
  not_included: {
    label: 'Area Not Included',
    color: '#71717a',
    sfha: false,
    description: 'Area not included in the community\'s flood insurance study.',
  },
  other: {
    label: 'Other FEMA Flood Zone',
    color: '#9ca3af',
    sfha: false,
    description: null,
  },
};

export function floodCategoryMeta(category) {
  return FLOOD_CATEGORIES[category] || FLOOD_CATEGORIES.other;
}

/** Mapbox `match` expression for per-category color. */
export const FLOOD_CATEGORY_COLOR_EXPRESSION = [
  'match',
  ['get', 'category'],
  ...Object.entries(FLOOD_CATEGORIES).flatMap(([key, meta]) => [key, meta.color]),
  FLOOD_CATEGORIES.other.color,
];

/** FEMA's definitions of the FLD_ZONE codes, shown under "Flood Zone". */
const ZONE_DESCRIPTIONS = {
  A: '1% annual chance flood area; no base flood elevations determined.',
  AE: '1% annual chance flood area with base flood elevations determined.',
  AH: '1% annual chance shallow flooding (usually ponding), depths 1–3 ft; base flood elevations determined.',
  AO: '1% annual chance shallow flooding (usually sheet flow on sloping terrain), depths 1–3 ft; average depths determined.',
  AR: 'Area temporarily at 1% annual chance risk while a flood-control system is being restored.',
  A99: '1% annual chance flood area to be protected by a federal flood-protection system under construction.',
  V: 'Coastal 1% annual chance flood area with wave hazard; no base flood elevations determined.',
  VE: 'Coastal 1% annual chance flood area with wave hazard; base flood elevations determined.',
  X: 'Outside the 1% annual chance floodplain.',
  D: 'Possible but undetermined flood hazard.',
};

export function floodZoneDescription(zone) {
  return ZONE_DESCRIPTIONS[String(zone || '').toUpperCase()] || null;
}

/** "1 PCT ANNUAL CHANCE FLOOD HAZARD CONTAINED IN CHANNEL" → sentence case. */
export function formatZoneSubtype(subtype) {
  if (!subtype) return null;
  const s = String(subtype)
    .trim()
    .toLowerCase()
    .replace(/\b(\d+(?:\.\d+)?) ?pct\b/g, '$1%')
    .replace(/\b(\d+(?:\.\d+)?) percent\b/g, '$1%');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function unitLabel(unit) {
  const u = String(unit || '').toLowerCase();
  if (u.startsWith('feet') || u === 'ft') return 'ft';
  if (u.startsWith('meter') || u === 'm') return 'm';
  return u || 'ft';
}

/**
 * Human-readable rows for a flood-zone record, skipping anything FEMA left
 * blank. Raw GIS field names never appear here.
 * @returns {{ label: string, value: string }[]}
 */
export function floodZoneRows(record) {
  const rows = [];
  const push = (label, value) => {
    if (value != null && String(value).trim() !== '') rows.push({ label, value: String(value) });
  };
  push('Flood Zone', record.zone);
  push('Zone subtype', formatZoneSubtype(record.subtype));
  if (record.zone) push('Special Flood Hazard Area', record.sfha ? 'Yes' : 'No');
  if (record.bfe != null) {
    push('Base flood elevation', `${record.bfe} ${unitLabel(record.lengthUnit)}${record.verticalDatum ? ` (${record.verticalDatum})` : ''}`);
  }
  if (record.depth != null) push('Flood depth', `${record.depth} ${unitLabel(record.lengthUnit)}`);
  if (record.velocity != null) push('Flood velocity', `${record.velocity} ${record.velocityUnit || 'ft/s'}`);
  push('FIRM panel', record.panel);
  push('Panel effective date', record.effectiveDate ? formatEffectiveDate(record.effectiveDate) : null);
  push('Panel type', record.panelType);
  push('FIRM study (DFIRM ID)', record.dfirmId);
  return rows;
}

export function formatEffectiveDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}
