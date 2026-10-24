import { getFireMatchKey, pointsNearSameFire } from '../hooks/useMergedFireData';
import { parseAliasIds } from './incidentAliases';

/**
 * Combine IRWIN national incidents with CAL FIRE GeoJsonList.
 * When both list the same fire (normalized name, close together), CAL FIRE
 * wins — it's the originating state agency for CA fires and typically more
 * current than IRWIN. The IRWIN record's id is kept on the winner as an alias.
 * A same-named IRWIN fire elsewhere is a different fire and stays listed.
 *
 * Shared by LiveTrackerPage (map/sidebar feed), FireIncidentPage (standalone
 * per-fire overview) and the reporter dashboard's External Incidents tab so
 * all resolve the same incident `id` the same way. Same rule as the map's
 * mergeFireData in useMergedFireData.js.
 */
export function mergeIrwinAndCalFireIncidents(irwinIncidents, calFireIncidents) {
  const calFireByKey = new Map();
  const out = calFireIncidents.map((inc) => {
    const copy = { ...inc, aliasIds: parseAliasIds(inc.aliasIds) };
    const key = getFireMatchKey(inc.name);
    if (key) calFireByKey.set(key, [...(calFireByKey.get(key) || []), copy]);
    return copy;
  });
  irwinIncidents.forEach((inc) => {
    const key = getFireMatchKey(inc.name);
    const winner = key
      ? (calFireByKey.get(key) || []).find((c) => pointsNearSameFire([c.lng, c.lat], [inc.lng, inc.lat]))
      : null;
    if (winner) {
      winner.aliasIds = parseAliasIds([...winner.aliasIds, inc.id, ...parseAliasIds(inc.aliasIds)])
        .filter((id) => id !== String(winner.id));
      return;
    }
    out.push(inc);
  });
  return out.sort((a, b) => b.acres - a.acres);
}
