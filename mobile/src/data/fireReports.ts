/**
 * Reporter incidents (public.fire_reports), merged into the live incidents the way the web's
 * LiveTrackerPage does, so what reporters post from the dashboard shows in the app:
 *   - A report and an official incident with the same fire name (getFireMatchKey) within 30 km are
 *     one fire: the incident takes the reporter's location and latest acreage / containment, and
 *     lists the report ids as aliases, so updates, evacuations and shelters saved under the report
 *     (the dashboard saves them under report.id) appear on the fire.
 *   - Reports with no official match show as their own incidents.
 * Sources: src/app/hooks/useFireReports.js, src/app/utils/formatUtils.js (parseLatest*),
 * src/app/utils/reportIncidentLinks.js and src/app/hooks/useMergedFireData.js (SAME_FIRE_KM).
 */
import { parseAliasIds } from './incidentAliases';
import { getFireMatchKey, type Incident } from './incidents';

export interface FireReport {
  id: string;
  title: string;
  description: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  status: string;
  created_at: string;
  user_id: string | null;
}

/** Reports and incidents this close (km) with the same fire name are the same fire. */
const SAME_FIRE_KM = 30;

/** Latest "Acreage: n" (or "Size: n acres") line in a report's description. */
export function parseLatestAcreage(description: string | null | undefined): number | null {
  if (!description) return null;
  for (const line of description.split('\n').reverse()) {
    const m = line.match(/acreage[:\s]+([0-9,.]+)/i) || line.match(/size[:\s]+([0-9,.]+)\s*acres?/i);
    if (m) {
      const v = parseFloat(m[1].replace(/,/g, ''));
      if (Number.isFinite(v)) return v;
    }
  }
  return null;
}

/** Latest "Containment: n%" (or "n% contained") line in a report's description. */
export function parseLatestContainment(description: string | null | undefined): number | null {
  if (!description) return null;
  for (const line of description.split('\n').reverse()) {
    const m = line.match(/containment[:\s]+([0-9]+)\s*%/i) || line.match(/([0-9]+)\s*%\s*contained/i);
    if (m) {
      const v = parseInt(m[1], 10);
      if (Number.isFinite(v)) return Math.min(100, Math.max(0, v));
    }
  }
  return null;
}

function nearSameFire(aLng: number, aLat: number, bLng: number, bLat: number): boolean {
  if (![aLng, aLat, bLng, bLat].every(Number.isFinite)) return false;
  const kmPerDegLng = 111.32 * Math.cos((((aLat + bLat) / 2) * Math.PI) / 180);
  return Math.hypot((aLng - bLng) * kmPerDegLng, (aLat - bLat) * 111.32) <= SAME_FIRE_KM;
}

/** Ids of every approved report that shares a fire name. */
function reportIdsForName(name: string, reports: FireReport[]): string[] {
  const key = getFireMatchKey(name);
  if (!key) return [];
  return reports.filter(r => getFireMatchKey(r.title) === key).map(r => String(r.id));
}

/** One report per fire name (the newest), as the web collapses repeat submissions. */
function latestPerFire(reports: FireReport[]): FireReport[] {
  const byKey = new Map<string, FireReport>();
  const unkeyed: FireReport[] = [];
  for (const r of reports) {
    const key = getFireMatchKey(r.title);
    if (!key) {
      unkeyed.push(r);
      continue;
    }
    const existing = byKey.get(key);
    if (!existing || Date.parse(r.created_at) > Date.parse(existing.created_at)) byKey.set(key, r);
  }
  return [...byKey.values(), ...unkeyed];
}

export function mergeReporterIncidents(incidents: Incident[], approved: FireReport[]): Incident[] {
  if (approved.length === 0) return incidents;
  const reports = latestPerFire(approved);
  const reportsByKey = new Map<string, FireReport[]>();
  for (const r of reports) {
    const key = getFireMatchKey(r.title);
    if (key) reportsByKey.set(key, [...(reportsByKey.get(key) ?? []), r]);
  }

  const matched = new Set<string>();
  const merged = incidents.map(inc => {
    const key = getFireMatchKey(inc.name);
    const report = key
      ? (reportsByKey.get(key) ?? []).find(r => nearSameFire(Number(r.longitude), Number(r.latitude), inc.lng, inc.lat))
      : undefined;
    if (!report) return inc;
    matched.add(String(report.id));
    // A reporter's latest acreage / containment overrides the feed, so reporters can keep a fire
    // current after CAL FIRE or IRWIN lists it; their location is usually more precise too.
    return {
      ...inc,
      lat: Number(report.latitude) || inc.lat,
      lng: Number(report.longitude) || inc.lng,
      acres: parseLatestAcreage(report.description) ?? inc.acres,
      contained: parseLatestContainment(report.description) ?? inc.contained,
      aliasIds: parseAliasIds([...inc.aliasIds, report.id, ...reportIdsForName(report.title, approved)]),
      reportId: String(report.id),
    };
  });

  // Reports no official incident has picked up yet: the fire as the reporter described it.
  const reportOnly: Incident[] = reports
    .filter(r => !matched.has(String(r.id)))
    .filter(r => Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude)))
    .map(r => {
      const key = getFireMatchKey(r.title);
      const officialIds = key ? incidents.filter(inc => getFireMatchKey(inc.name) === key).flatMap(inc => [inc.fireId, ...inc.aliasIds]) : [];
      return {
        id: String(r.id),
        fireId: String(r.id),
        fireKey: key ?? String(r.id),
        name: r.title,
        state: '',
        county: '',
        lat: Number(r.latitude),
        lng: Number(r.longitude),
        acres: parseLatestAcreage(r.description) ?? 0,
        contained: parseLatestContainment(r.description),
        started: r.created_at,
        updated: r.created_at,
        cause: null,
        personnel: 0,
        managementOrg: null,
        source: 'NWTT_REPORT',
        detailUrl: null,
        aliasIds: parseAliasIds([...officialIds, ...reportIdsForName(r.title, approved)]).filter(id => id !== String(r.id)),
        hasPerimeter: false,
        reportId: String(r.id),
      };
    });

  return [...merged, ...reportOnly];
}
