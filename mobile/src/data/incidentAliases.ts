/**
 * Alias ids, ported from the web's src/app/utils/incidentAliases.js. One real fire can carry
 * several ids (IRWIN, CAL FIRE, a perimeter capture, an NWTT report). Data stored by id
 * (incident_updates, incident_evacuations, incident_shelters, incident_follows) may sit under any
 * of them, so readers query the primary id plus its aliases and writers use the primary id.
 */

/** Alias list (array or comma string) → deduped array of ids. */
export function parseAliasIds(value: unknown): string[] {
  const list = Array.isArray(value) ? value : String(value ?? '').split(',');
  return [...new Set(list.map(id => String(id ?? '').trim()).filter(Boolean))];
}

/** Stable key for an incident's id list ('' when there is no id); split it with idsFromKey. */
export function incidentIdsKey(incidentId: string | null | undefined, aliasIds: unknown): string {
  if (!incidentId) return '';
  const primary = String(incidentId);
  return [primary, ...parseAliasIds(aliasIds).filter(id => id !== primary)].join(',');
}

export function idsFromKey(key: string): string[] {
  return key ? key.split(',') : [];
}

/** Supabase realtime postgres_changes filter matching any of the ids. */
export function incidentIdRealtimeFilter(ids: string[]): string {
  return ids.length === 1 ? `incident_id=eq.${ids[0]}` : `incident_id=in.(${ids.join(',')})`;
}
