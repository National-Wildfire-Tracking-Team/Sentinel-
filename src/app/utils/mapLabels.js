/**
 * mapLabels.js
 * The basemap's first label (symbol) layer, so raster overlays can be added
 * beneath it and place names stay readable over them.
 */

export function firstLabelLayer(map) {
  try {
    return map.getStyle()?.layers?.find((l) => l.type === 'symbol')?.id;
  } catch {
    return undefined;
  }
}
