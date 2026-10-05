/**
 * incidentDetailModel.js
 * Pure helpers that turn incident rows into what the incident detail panel
 * shows: address lines, the current-situation line, evacuation cards, and
 * timeline labels. No React here so they stay easy to test.
 */

import { parseLatestAcreage, parseLatestContainment } from '../../utils/formatUtils';

// ─── Update types ────────────────────────────────────────────────────────────

/** Display labels for incident_updates.update_type. */
export const UPDATE_TYPE_LABELS = {
  fire_growth: 'Fire Growth',
  threat: 'Threat',
  resource_request: 'Resource Request',
  evacuation: 'Evacuation',
  road_closure: 'Road Closure',
  location: 'Location Update',
  field_report: 'Field Report',
  incident_update: 'Incident Update',
};

/** Types a reporter can pick when posting, in menu order. */
export const POSTABLE_UPDATE_TYPES = [
  'field_report', 'fire_growth', 'threat', 'evacuation',
  'road_closure', 'resource_request', 'location', 'incident_update',
];

/**
 * Label for one timeline entry. Rows written before update_type existed
 * fall back to the old source-based title.
 */
export function updateTypeLabel(update) {
  if (update.update_type && UPDATE_TYPE_LABELS[update.update_type]) {
    // The column default; for older reporter rows "Field Report" reads better.
    if (update.update_type === 'incident_update' && update.source_type === 'reporter') return 'Field Report';
    if (update.update_type === 'incident_update' && update.content?.includes('→')) return 'Data Updated';
    return UPDATE_TYPE_LABELS[update.update_type];
  }
  if (update.source_type !== 'automated') return 'Field Report';
  return update.content?.includes('→') ? 'Data Updated' : 'Incident Update';
}

/** Multi-line automated diffs ("Acres: …\nContainment: …") read as one line. */
export function updateMessage(update) {
  const lines = (update.content || '').split('\n').filter(Boolean);
  return lines.length > 1 && update.source_type === 'automated' ? lines.join(' · ') : (update.content || '');
}

// ─── Current situation ───────────────────────────────────────────────────────

/** Actionable update types and the tone of the situation line they produce. */
const SITUATION_TONES = {
  evacuation: 'red',
  threat: 'amber',
  fire_growth: 'orange',
};

function firstSentence(text) {
  const line = (text || '').split('\n').find((l) => l.trim()) || '';
  const match = line.match(/^(.+?[.!?])(\s|$)/);
  return (match ? match[1] : line).trim();
}

/**
 * One-line summary of what's happening now, from the newest actionable
 * update (updates are newest first). null when nothing is actionable.
 * @returns {{ text: string, tone: 'red'|'amber'|'orange', updateId: string } | null}
 */
export function deriveSituation(updates, evacuations) {
  const latest = updates.find((u) => SITUATION_TONES[u.update_type]);
  if (!latest) return null;
  const tone = SITUATION_TONES[latest.update_type];
  let text;

  if (latest.update_type === 'evacuation') {
    text = evacuations?.order ? 'Evacuation order issued'
      : evacuations?.warning ? 'Evacuation warning issued'
      : firstSentence(latest.content) || 'Evacuations in effect';
  } else if (latest.update_type === 'fire_growth') {
    const grownTo = latest.content?.match(/Acres:\s*[\d,.]+\s*→\s*([\d,.]+)/);
    text = grownTo ? `Fire growing · ${grownTo[1]} acres` : firstSentence(latest.content) || 'Fire growing';
  } else {
    text = firstSentence(latest.content) || 'Threat reported';
  }
  return { text, tone, updateId: latest.id };
}

// ─── Evacuations ─────────────────────────────────────────────────────────────

function safeLinks(links) {
  if (!Array.isArray(links)) return [];
  return links.filter((l) => l && typeof l.url === 'string' && /^https?:\/\//i.test(l.url) && l.label);
}

/**
 * Evacuation cards for the panel. Prefers incident_evacuations rows; for
 * official incidents without rows, falls back to the evacuation fields the
 * CAL FIRE feed puts on the incident itself.
 * @returns {{ order: {zones: string[], lines: string[]}|null,
 *             warning: {zones: string[], lines: string[]}|null,
 *             notes: string, links: {label: string, url: string}[] } | null}
 */
export function buildEvacuations(rows, fire) {
  const orderRow = rows.find((r) => r.level === 'order');
  const warningRow = rows.find((r) => r.level === 'warning');

  if (orderRow || warningRow) {
    const notes = [...new Set([orderRow?.notes, warningRow?.notes].map((n) => (n || '').trim()).filter(Boolean))];
    const seen = new Set();
    const links = [...safeLinks(orderRow?.links), ...safeLinks(warningRow?.links)]
      .filter((l) => !seen.has(l.url) && seen.add(l.url));
    return {
      order: orderRow ? { zones: orderRow.zones || [], lines: [] } : null,
      warning: warningRow ? { zones: warningRow.zones || [], lines: [] } : null,
      notes: notes.join('\n\n'),
      links,
    };
  }

  const lines = Array.isArray(fire?.evacuation_order_lines) ? fire.evacuation_order_lines.filter(Boolean) : [];
  const hasOrder = fire?.evacuation_orders > 0 || lines.length > 0;
  const hasWarning = fire?.evacuation_warnings > 0;
  if (!hasOrder && !hasWarning && !fire?.evacuation_summary) return null;
  return {
    order: hasOrder ? { zones: [], lines } : null,
    warning: hasWarning ? { zones: [], lines: [] } : null,
    notes: (fire.evacuation_summary || '').trim(),
    links: [],
  };
}

// ─── Address / metrics ───────────────────────────────────────────────────────

function countyLabel(county) {
  if (!county) return null;
  return /county$/i.test(county) ? county : `${county} County`;
}

/**
 * Split a reporter address ("61600 Tamatea Rd, Anza, Riverside County, CA 92539")
 * into a street line and a "City, County, ST" line.
 */
export function splitAddress(raw) {
  const parts = (raw || '').split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { street: '', locality: '' };

  const stateMatch = parts[parts.length - 1].match(/^([A-Z]{2})(\s+\d{5}(-\d{4})?)?$/);
  const state = stateMatch ? stateMatch[1] : null;
  const rest = state ? parts.slice(0, -1) : parts;
  const countyIdx = rest.findIndex((p) => /\bcounty$/i.test(p));
  const county = countyIdx >= 0 ? rest[countyIdx] : null;
  const remaining = rest.filter((_, i) => i !== countyIdx);

  if (!state && !county) return { street: parts.join(', '), locality: '' };
  const city = remaining.length > 1 ? remaining[remaining.length - 1] : null;
  const street = (city ? remaining.slice(0, -1) : remaining).join(', ');
  return { street, locality: [city, county, state].filter(Boolean).join(', ') };
}

/** Text after "INCIDENT NOTES:" in a reporter fire_reports description. */
export function extractIncidentNotes(description) {
  if (!description || typeof description !== 'string') return '';
  const m = description.match(/\nINCIDENT NOTES:\n([\s\S]*)$/);
  if (!m) return '';
  let body = m[1].trim();
  // Acreage/containment lines and internal notes follow the public notes.
  const cut = body.search(/\n\n(Acreage|Containment):|\nINTERNAL NOTES:\n/);
  if (cut >= 0) body = body.slice(0, cut).trim();
  return body;
}

function descriptionField(description, field) {
  const m = description?.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim() : null;
}

function normalizeState(state) {
  return state ? String(state).replace(/^US-/, '') : null;
}

function officialSourceLabel(fire) {
  if (fire.source === 'CAL_FIRE') return 'CAL FIRE';
  if (fire.source === 'FIRIS') return 'FIRIS';
  return 'NIFC / IRWIN';
}

/**
 * Everything the header, metrics and Info tab need, for both official
 * incidents (type 'incident' or a 'perimeter') and reporter incidents
 * (type 'user-report').
 */
export function incidentSummary(fire) {
  const isReport = fire.type === 'user-report';
  const state = normalizeState(fire.state);

  if (isReport) {
    const rawAddress = descriptionField(fire.description, 'ADDRESS');
    const { street, locality } = splitAddress(rawAddress);
    return {
      name: fire.title || fire.name,
      isActive: true,
      statusLabel: 'Active',
      street,
      locality,
      rawAddress,
      acres: parseLatestAcreage(fire.description),
      containment: parseLatestContainment(fire.description),
      sourceLabel: 'NWTT Reporter',
      sourceVerb: 'Submitted by',
      createdAt: fire.created_at,
      updatedAt: fire.created_at,
      jurisdiction: descriptionField(fire.description, 'JURISDICTION'),
      notes: extractIncidentNotes(fire.description),
      county: null,
      state: null,
      isReport,
    };
  }

  const contained = fire.contained == null || fire.contained === '' ? null : Number(fire.contained);
  const isActive = (contained ?? 0) < 100 && (fire.status ?? '').toLowerCase() !== 'controlled';
  return {
    name: fire.name,
    isActive,
    statusLabel: fire.status ? String(fire.status) : (isActive ? 'Active' : 'Controlled'),
    street: fire.location_description || '',
    locality: [countyLabel(fire.county), state].filter(Boolean).join(', '),
    rawAddress: fire.location_description || null,
    acres: fire.acres == null || fire.acres === '' ? null : Number(fire.acres),
    containment: Number.isFinite(contained) ? contained : null,
    sourceLabel: officialSourceLabel(fire),
    sourceVerb: 'Reported by',
    createdAt: fire.started || fire.createdAt || fire.discovered || null,
    updatedAt: fire.updated || null,
    jurisdiction: null,
    notes: '',
    county: countyLabel(fire.county),
    state,
    isReport,
  };
}

/** Maps link for a shelter: coordinates when known, else the address. */
export function directionsUrl(shelter) {
  const destination = Number.isFinite(shelter.lat) && Number.isFinite(shelter.lng)
    ? `${shelter.lat},${shelter.lng}`
    : shelter.address;
  if (!destination) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

export const SHELTER_KIND_LABELS = {
  evacuation_center: 'Evacuation Center',
  large_animals: 'Large Animals',
  small_animals: 'Small Animals',
  other: 'Shelter',
};

// ─── Reporter evacuation editing ─────────────────────────────────────────────

/** "RIV-E1042, RIV-E1043\nRIV-E1044" → ['RIV-E1042', 'RIV-E1043', 'RIV-E1044'] */
export function parseZones(text) {
  return [...new Set(String(text || '').split(/[,\n]/).map((z) => z.trim()).filter(Boolean))];
}

const LEVEL_NAMES = { order: 'Evacuation order', warning: 'Evacuation warning' };

/**
 * Timeline text for an evacuation change, or null when nothing changed.
 * `before` / `after` map 'order' | 'warning' to { zones } or null.
 */
export function evacuationChangeText(before, after) {
  const lines = [];
  for (const level of ['order', 'warning']) {
    const was = before[level];
    const now = after[level];
    const zonesNow = now?.zones?.join(', ') || '';
    if (now && !was) {
      lines.push(`${LEVEL_NAMES[level]} issued${zonesNow ? ` for ${zonesNow}` : ''}.`);
    } else if (!now && was) {
      lines.push(`${LEVEL_NAMES[level]} lifted.`);
    } else if (now && was && zonesNow !== (was.zones?.join(', ') || '')) {
      lines.push(`${LEVEL_NAMES[level]} updated${zonesNow ? `: ${zonesNow}` : ''}.`);
    }
  }
  return lines.length ? lines.join('\n') : null;
}
