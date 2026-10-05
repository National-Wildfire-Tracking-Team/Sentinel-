/**
 * Alias ids
 * ─────────
 * One real fire can carry several ids: its IRWIN UniqueFireIdentifier, its
 * CAL FIRE UniqueId, a perimeter capture's own id, an NWTT reporter report.
 * The merges keep one record (and its id) per fire, but data stored by id —
 * incident_updates, incident_evacuations, incident_shelters, incident_follows
 * — may have been written under any of them (e.g. before CAL FIRE picked the
 * fire up, or from a screen that resolved the other record). Each merged
 * record therefore lists the ids it absorbed as `aliasIds`; readers query
 * the primary id plus its aliases, writers use the primary id.
 *
 * On map features (where Mapbox flattens arrays) aliases travel as a
 * comma-separated `_aliasIds` / `alias_ids` string; see parseAliasIds.
 */

/** Alias list (array or comma string) → deduped array of ids. */
export function parseAliasIds(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(',');
  return [...new Set(list.map((id) => String(id ?? '').trim()).filter(Boolean))];
}

/** Merge alias sources into one comma string, excluding the primary id; '' when none. */
export function joinAliasIds(primaryId, ...sources) {
  const primary = primaryId == null ? '' : String(primaryId);
  return parseAliasIds(sources.flatMap((s) => parseAliasIds(s)))
    .filter((id) => id !== primary)
    .join(',');
}

/** Primary id followed by its aliases — what readers should query. */
export function incidentIdsFor(fire) {
  if (!fire?.id) return [];
  return [String(fire.id), ...parseAliasIds(fire.aliasIds).filter((id) => id !== String(fire.id))];
}

/**
 * Stable string key for an incident's id list, for hook dependencies
 * ('' when there is no id). Split it back with idsFromKey.
 */
export function incidentIdsKey(incidentId, aliasIds) {
  return incidentIdsFor({ id: incidentId, aliasIds }).join(',');
}

export function idsFromKey(key) {
  return key ? key.split(',') : [];
}

/** Supabase realtime postgres_changes filter matching any of the ids. */
export function incidentIdRealtimeFilter(ids) {
  return ids.length === 1 ? `incident_id=eq.${ids[0]}` : `incident_id=in.(${ids.join(',')})`;
}
