import { getFireMatchKey } from '../hooks/useMergedFireData';
import { incidentIdsFor } from './incidentAliases';

/**
 * Reporter incidents ↔ official incidents
 * ───────────────────────────────────────
 * A reporter often adds a fire (a fire_reports row) before CAL FIRE or IRWIN
 * lists it. Once the official record appears, the two are the same fire,
 * linked by normalised fire name — the same rule the live map uses to show
 * the reporter's dot in place of the official one. Evacuations, shelters and
 * updates may have been saved under either side's id, so each side lists the
 * other's ids as aliases (see incidentAliases.js).
 */

/** Ids of the official incidents (plus their own aliases) that share a report's fire name. */
export function officialIdsForReport(report, incidents) {
  const key = getFireMatchKey(report?.title);
  if (!key || !incidents?.length) return [];
  return [...new Set(
    incidents.filter((inc) => getFireMatchKey(inc.name) === key).flatMap(incidentIdsFor),
  )];
}

/** Ids of the reports that share an incident's (or another report's) fire name. */
export function reportIdsForName(name, reports) {
  const key = getFireMatchKey(name);
  if (!key || !reports?.length) return [];
  return reports.filter((r) => getFireMatchKey(r.title) === key).map((r) => String(r.id));
}
