/**
 * layerStack.js
 * Pins the top of the map's layer stack, whatever order layers mount in.
 *
 * Layers are drawn in the order they were added, so a layer that mounts late
 * (GOES, MRMS, a layer whose data just arrived) would otherwise land on top
 * of everything. applyLayerStack moves these groups to the top, bottom to top:
 *
 *   NWS alerts → evacuation zones → fire perimeters → fire points
 *   → map tools (Route to Safety, measurement, selection spotlight)
 *   → country/state borders
 *
 * Every other layer stays below, in its existing order. Groups match layers
 * by source id, so sub-layers that mount conditionally are included too.
 */

const STACK_GROUPS = [
  (s) => s === 'weather-alerts',
  (s) => s === 'evac-zones',
  (s) => s === 'fire-perimeters' || s === 'fire-perimeter-centroids',
  (s) => s === 'incident-locations',
  (s) => s.startsWith('route-safety-') || s.startsWith('measure-') || s.startsWith('selected-feature-spotlight'),
  (s) => s === 'country-outlines' || s === 'state-boundaries',
];

function groupOf(layer) {
  const source = typeof layer.source === 'string' ? layer.source : '';
  return STACK_GROUPS.findIndex((match) => match(source));
}

/** Reorders the map's layers so the stacked groups sit on top, in order. No-op when already in place. */
export function applyLayerStack(map) {
  const layers = map.getStyle?.()?.layers;
  if (!layers) return;

  const stacked = layers
    .map((layer, i) => ({ id: layer.id, group: groupOf(layer), i }))
    .filter((l) => l.group !== -1)
    .sort((a, b) => a.group - b.group || a.i - b.i);
  if (!stacked.length) return;

  const top = layers.slice(-stacked.length).map((l) => l.id);
  if (stacked.every((l, i) => top[i] === l.id)) return;

  // Moving each layer to the top in turn leaves them in `stacked` order.
  stacked.forEach(({ id }) => map.moveLayer(id));
}
