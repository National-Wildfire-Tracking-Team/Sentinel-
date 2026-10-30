/**
 * Pure helpers behind the incident sheet, ported from the web's
 * src/app/components/FireDetailPanel/incidentDetailModel.js: timeline labels, the current-situation
 * line, evacuation cards, header/summary fields, and shelter links.
 */
import type { Incident } from './incidents';

export interface IncidentUpdate {
  id: string;
  incident_id: string;
  content: string | null;
  update_type: string | null;
  source_type: string | null;
  source_name: string | null;
  user_id: string | null;
  photo_urls: string[] | null;
  created_at: string;
}

export interface EvacuationRow {
  id: string;
  incident_id: string;
  level: 'order' | 'warning';
  zones: string[] | null;
  notes: string | null;
  links: { label: string; url: string }[] | null;
  updated_at: string;
}

export interface ShelterRow {
  id: string;
  incident_id: string;
  kind: string | null;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  status_note: string | null;
}

// ─── Update types ────────────────────────────────────────────────────────────

export const UPDATE_TYPE_LABELS: Record<string, string> = {
  fire_growth: 'Fire Growth',
  threat: 'Threat',
  resource_request: 'Resource Request',
  evacuation: 'Evacuation',
  road_closure: 'Road Closure',
  location: 'Location Update',
  field_report: 'Field Report',
  incident_update: 'Incident Update',
};

/** Label for one timeline entry; rows from before update_type existed fall back to the source. */
export function updateTypeLabel(update: IncidentUpdate): string {
  if (update.update_type && UPDATE_TYPE_LABELS[update.update_type]) {
    if (update.update_type === 'incident_update' && update.source_type === 'reporter') return 'Field Report';
    if (update.update_type === 'incident_update' && update.content?.includes('→')) return 'Data Updated';
    return UPDATE_TYPE_LABELS[update.update_type];
  }
  if (update.source_type !== 'automated') return 'Field Report';
  return update.content?.includes('→') ? 'Data Updated' : 'Incident Update';
}

/** Multi-line automated diffs ("Acres: …\nContainment: …") read as one line. */
export function updateMessage(update: IncidentUpdate): string {
  const lines = (update.content || '').split('\n').filter(Boolean);
  return lines.length > 1 && update.source_type === 'automated' ? lines.join(' · ') : update.content || '';
}

// ─── Current situation ───────────────────────────────────────────────────────

export type SituationTone = 'red' | 'amber' | 'orange';

const SITUATION_TONES: Record<string, SituationTone> = {
  evacuation: 'red',
  threat: 'amber',
  fire_growth: 'orange',
};

function firstSentence(text: string | null): string {
  const line = (text || '').split('\n').find(l => l.trim()) || '';
  const match = line.match(/^(.+?[.!?])(\s|$)/);
  return (match ? match[1] : line).trim();
}

/** One-line summary from the newest actionable update (updates are newest first). */
export function deriveSituation(
  updates: IncidentUpdate[],
  evacuations: Evacuations | null,
): { text: string; tone: SituationTone } | null {
  const latest = updates.find(u => u.update_type && SITUATION_TONES[u.update_type]);
  if (!latest?.update_type) return null;
  const tone = SITUATION_TONES[latest.update_type];
  let text: string;
  if (latest.update_type === 'evacuation') {
    text = evacuations?.order
      ? 'Evacuation order issued'
      : evacuations?.warning
        ? 'Evacuation warning issued'
        : firstSentence(latest.content) || 'Evacuations in effect';
  } else if (latest.update_type === 'fire_growth') {
    const grownTo = latest.content?.match(/Acres:\s*[\d,.]+\s*→\s*([\d,.]+)/);
    text = grownTo ? `Fire growing · ${grownTo[1]} acres` : firstSentence(latest.content) || 'Fire growing';
  } else {
    text = firstSentence(latest.content) || 'Threat reported';
  }
  return { text, tone };
}

// ─── Evacuations ─────────────────────────────────────────────────────────────

export interface Evacuations {
  order: { zones: string[] } | null;
  warning: { zones: string[] } | null;
  notes: string;
  links: { label: string; url: string }[];
}

function safeLinks(links: unknown): { label: string; url: string }[] {
  if (!Array.isArray(links)) return [];
  return links.filter(l => l && typeof l.url === 'string' && /^https?:\/\//i.test(l.url) && l.label);
}

/** Evacuation cards from incident_evacuations rows (newest first, one per level). */
export function buildEvacuations(rows: EvacuationRow[]): Evacuations | null {
  const orderRow = rows.find(r => r.level === 'order');
  const warningRow = rows.find(r => r.level === 'warning');
  if (!orderRow && !warningRow) return null;
  const notes = [...new Set([orderRow?.notes, warningRow?.notes].map(n => (n || '').trim()).filter(Boolean))];
  const seen = new Set<string>();
  const links = [...safeLinks(orderRow?.links), ...safeLinks(warningRow?.links)].filter(
    l => !seen.has(l.url) && !!seen.add(l.url),
  );
  return {
    order: orderRow ? { zones: orderRow.zones || [] } : null,
    warning: warningRow ? { zones: warningRow.zones || [] } : null,
    notes: notes.join('\n\n'),
    links,
  };
}

// ─── Summary ─────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  CAL_FIRE: 'CAL FIRE',
  FIRIS: 'FIRIS',
  // A reporter-added fire no official feed lists yet (data/fireReports.ts).
  NWTT_REPORT: 'NWTT field reporter',
};

/** Header, metrics and Info fields for an official incident (incidentSummary on the web). */
export function incidentSummary(incident: Incident) {
  const contained = incident.contained;
  const isActive = (contained ?? 0) < 100;
  const county = incident.county ? (/county$/i.test(incident.county) ? incident.county : `${incident.county} County`) : null;
  return {
    name: incident.name,
    isActive,
    statusLabel: isActive ? 'Active' : 'Contained',
    locality: [county, incident.state].filter(Boolean).join(', '),
    county,
    state: incident.state || null,
    acres: incident.acres,
    containment: contained,
    sourceLabel: SOURCE_LABELS[incident.source] ?? 'NIFC / IRWIN',
    createdAt: incident.started,
    updatedAt: incident.updated,
  };
}

// ─── Shelters ────────────────────────────────────────────────────────────────

export const SHELTER_KIND_LABELS: Record<string, string> = {
  evacuation_center: 'Evacuation Center',
  large_animals: 'Large Animals',
  small_animals: 'Small Animals',
  other: 'Shelter',
};

/** Apple Maps directions: coordinates when known, else the address. */
export function directionsUrl(shelter: ShelterRow): string | null {
  const hasCoords = Number.isFinite(shelter.lat) && Number.isFinite(shelter.lng);
  if (hasCoords) return `https://maps.apple.com/?daddr=${shelter.lat},${shelter.lng}`;
  return shelter.address ? `https://maps.apple.com/?daddr=${encodeURIComponent(shelter.address)}` : null;
}
