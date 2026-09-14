import { getFireMatchKey } from '../hooks/useMergedFireData';

/**
 * Combine IRWIN national incidents with CAL FIRE GeoJsonList.
 * When both list the same fire (normalized name), CAL FIRE wins — it's the
 * originating state agency for CA fires and typically more current than IRWIN.
 *
 * Shared by LiveTrackerPage (map/sidebar feed) and FireIncidentPage (standalone
 * per-fire overview) so both resolve the same incident `id` the same way.
 */
export function mergeIrwinAndCalFireIncidents(irwinIncidents, calFireIncidents) {
  const calFireKeys = new Set();
  calFireIncidents.forEach(inc => {
    const key = getFireMatchKey(inc.name);
    if (key) calFireKeys.add(key);
  });
  const out = [...calFireIncidents];
  irwinIncidents.forEach(inc => {
    const key = getFireMatchKey(inc.name);
    if (key && calFireKeys.has(key)) return;
    out.push(inc);
  });
  return out.sort((a, b) => b.acres - a.acres);
}
