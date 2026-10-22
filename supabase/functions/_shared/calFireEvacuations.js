/**
 * calFireEvacuations.js
 * Matching and diffing for calfire-evacuations-sync: assigns Genasys Protect
 * evacuation zones to the CAL FIRE-led incidents they belong to, and works out
 * which incident_evacuations rows to write.
 *
 * CAL FIRE publishes no evacuation feed of its own, and Genasys zones carry no
 * incident id, so a zone belongs to the nearest CAL FIRE-led fire whose match
 * circle (see matchRadiusMiles) its polygon touches.
 *
 * Rows this sync owns are marked by created_by = null plus notes equal to
 * AUTO_NOTES. Any other row for a level (a reporter's entry) wins: the sync
 * never overwrites or deletes it.
 *
 * Plain dependency-free ESM so Vitest and the Deno Edge runtime can import it.
 */

import { geometryIntersectsCircle, haversineMiles } from './radiusFilter.js';

export const AUTO_NOTES =
  'Zones from Genasys Protect, matched automatically to this CAL FIRE incident. ' +
  'Check the county\'s alerts for the latest official details.';

export const AUTO_LINKS = [
  { label: 'Genasys Protect evacuation map', url: 'https://protect.genasys.com/' },
];

const MIN_MATCH_RADIUS_MI = 5;

/** 'order' | 'warning' | null for a Genasys zone status. */
export function classifyZoneStatus(status) {
  const s = String(status || '').trim().toLowerCase();
  if (!s || s.includes('lifted')) return null;
  if (s === 'evacuation order' || /level 3\b/.test(s)) return 'order';
  if (s === 'evacuation warning' || /level 2\b/.test(s)) return 'warning';
  return null;
}

/**
 * How far from a fire's point a zone may be and still belong to it: 5 mi, or
 * twice the radius of a circle the fire's size, whichever is larger (a
 * 100,000-acre fire reaches about 14 mi).
 */
export function matchRadiusMiles(acres) {
  const sqMiles = Math.max(0, Number(acres) || 0) / 640;
  return Math.max(MIN_MATCH_RADIUS_MI, 2 * Math.sqrt(sqMiles / Math.PI));
}

/** "US-CA-XMY-MRY-F023-A" + "Big Sur Region" → "MRY-F023-A (Big Sur Region)". */
export function zoneLabel(identifier, commonName) {
  const id = String(identifier || '').replace(/^US-[A-Z]{2}-[A-Z0-9]+-/, '');
  const name = String(commonName || '').trim();
  return name && name !== id ? `${id} (${name})` : id;
}

/**
 * @param incidents [{ id, lat, lng, acres }]
 * @param zones     GeoJSON features from the Genasys evacuation_zone layer
 * @returns Map<incidentId, { order: string[], warning: string[] }> with sorted,
 *          de-duplicated zone labels (only incidents with at least one zone)
 */
export function assignZonesToIncidents(incidents, zones) {
  const result = new Map();
  const usable = incidents.filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lng));

  for (const zone of zones) {
    const p = zone.properties || {};
    const level = classifyZoneStatus(p.status);
    if (!level || !zone.geometry) continue;

    const zLat = Number(p.latitude);
    const zLng = Number(p.longitude);
    let best = null;
    for (const inc of usable) {
      if (!geometryIntersectsCircle(zone.geometry, inc.lat, inc.lng, matchRadiusMiles(inc.acres))) continue;
      const dist = Number.isFinite(zLat) && Number.isFinite(zLng)
        ? haversineMiles(inc.lat, inc.lng, zLat, zLng)
        : Infinity;
      if (!best || dist < best.dist) best = { inc, dist };
    }
    if (!best) continue;

    if (!result.has(best.inc.id)) result.set(best.inc.id, { order: new Set(), warning: new Set() });
    result.get(best.inc.id)[level].add(zoneLabel(p.identifer ?? p.identifier, p.commonly_known_as));
  }

  return new Map([...result].map(([id, levels]) => [id, {
    order: [...levels.order].sort(),
    warning: [...levels.warning].sort(),
  }]));
}

export function isAutoRow(row) {
  return row.created_by == null && row.notes === AUTO_NOTES;
}

const sameZones = (a, b) => a.length === b.length && a.every((z, i) => z === b[i]);

/**
 * @param incidentIds  ids of every CAL FIRE-led incident in this run
 * @param assignments  output of assignZonesToIncidents
 * @param existingRows incident_evacuations rows for incidentIds
 * @returns {{ upserts: object[], deletes: {incident_id, level}[],
 *             changes: {incidentId, level, before: string[], after: string[]}[] }}
 */
export function planEvacuationWrites({ incidentIds, assignments, existingRows }) {
  const upserts = [];
  const deletes = [];
  const changes = [];
  const rowsByKey = new Map(existingRows.map((r) => [`${r.incident_id}|${r.level}`, r]));

  for (const incidentId of incidentIds) {
    for (const level of ['order', 'warning']) {
      const row = rowsByKey.get(`${incidentId}|${level}`);
      if (row && !isAutoRow(row)) continue;

      const before = row ? [...(row.zones || [])].sort() : [];
      const after = assignments.get(incidentId)?.[level] ?? [];

      if (after.length && !sameZones(before, after)) {
        upserts.push({
          incident_id: incidentId,
          level,
          zones: after,
          notes: AUTO_NOTES,
          links: AUTO_LINKS,
          created_by: null,
        });
        changes.push({ incidentId, level, before, after });
      } else if (!after.length && row) {
        deletes.push({ incident_id: incidentId, level });
        changes.push({ incidentId, level, before, after });
      }
    }
  }
  return { upserts, deletes, changes };
}

const LEVEL_LABEL = { order: 'Evacuation order', warning: 'Evacuation warning' };

/**
 * incident_updates text for one incident's changes, or null if nothing to say.
 * A zone that moved from warning to order is reported only as a new order.
 */
export function describeEvacuationChanges(changes) {
  const lines = [];
  const nowOrdered = new Set(changes.find((c) => c.level === 'order')?.after ?? []);
  for (const { level, before, after } of changes) {
    const added = after.filter((z) => !before.includes(z));
    const removed = before.filter((z) => !after.includes(z) && !(level === 'warning' && nowOrdered.has(z)));
    if (!after.length) {
      if (removed.length) lines.push(`${LEVEL_LABEL[level]} lifted: ${removed.join(', ')}`);
      continue;
    }
    if (added.length) lines.push(`${LEVEL_LABEL[level]}: ${added.join(', ')}`);
    if (removed.length) lines.push(`${LEVEL_LABEL[level]} lifted: ${removed.join(', ')}`);
  }
  return lines.length ? lines.join('\n') : null;
}
