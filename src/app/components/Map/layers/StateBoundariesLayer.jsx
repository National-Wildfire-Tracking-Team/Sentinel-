/**
 * StateBoundariesLayer.jsx
 * Heavier border lines than the base styles draw, so borders stay easy to
 * pick out over satellite imagery and data overlays:
 *  - state/province lines, from the Mapbox Streets admin layer (admin_level 1,
 *    land borders only — coasts come from the country outlines);
 *  - international borders (US–Canada, US–Mexico) and shorelines, from the
 *    outlines of Mapbox's country polygons, which are clipped to the coast.
 * Needs a Mapbox token, like the base styles that carry their own thin lines.
 *
 * The lines draw above every other layer, so borders show through alerts,
 * outlooks, imagery and fire data alike. Layers that mount later (switched on
 * from the layer panel) would otherwise land on top, so the border layers are
 * raised back to the top whenever the style changes.
 *
 * The base styles' own (thin, orange-tinted) admin boundaries are switched
 * off, so these white lines are the only borders on the map.
 */

import { memo, useEffect } from 'react';
import { Source, Layer, useMap } from 'react-map-gl';

const STATE_LINE_FILTER = [
  'all',
  ['==', ['get', 'admin_level'], 1],
  // Streets tiles have carried `maritime` as both a boolean and a string.
  ['!=', ['to-string', ['get', 'maritime']], 'true'],
];

// Country polygons exist once per worldview; draw the US one so disputed
// areas aren't outlined twice.
const COUNTRY_FILTER = [
  'any',
  ['==', ['get', 'worldview'], 'all'],
  ['in', 'US', ['get', 'worldview']],
];

// Width grows with zoom so the lines read at continental scale without
// overpowering a county-level view. State lines, country borders and coasts
// all share one width and color, so they read as one set of borders.
const LINE_WIDTH = ['interpolate', ['linear'], ['zoom'], 3, 1.4, 6, 2.2, 10, 3];
// 1.5px wider than the line ("zoom" must stay the top-level interpolate input).
const CASING_WIDTH = ['interpolate', ['linear'], ['zoom'], 3, 2.9, 6, 3.7, 10, 4.5];

const LINE_LAYOUT = { 'line-join': 'round', 'line-cap': 'round' };

function casedLine(id, sourceLayer, filter) {
  return [
    // Dark casing keeps the line legible over bright imagery and fills
    <Layer
      key={`${id}-casing`}
      id={`${id}-casing`}
      type="line"
      source-layer={sourceLayer}
      filter={filter}
      layout={LINE_LAYOUT}
      paint={{ 'line-color': '#000000', 'line-opacity': 0.45, 'line-width': CASING_WIDTH }}
    />,
    <Layer
      key={`${id}-line`}
      id={`${id}-line`}
      type="line"
      source-layer={sourceLayer}
      filter={filter}
      layout={LINE_LAYOUT}
      paint={{ 'line-color': '#ffffff', 'line-opacity': 0.75, 'line-width': LINE_WIDTH }}
    />,
  ];
}

// Bottom to top: each casing sits under its line.
const BORDER_LAYER_IDS = [
  'country-outlines-casing', 'country-outlines-line',
  'state-boundaries-casing', 'state-boundaries-line',
];

// Classic styles (dark-v11, the street map) draw borders in these layers;
// Mapbox Standard styles (the satellite map) expose a config switch instead.
const BASE_BOUNDARY_LAYER = /^admin-[01]-boundary/;

function hideBaseBoundaries(map) {
  try {
    if (map.getConfigProperty?.('basemap', 'showAdminBoundaries') !== false) {
      map.setConfigProperty?.('basemap', 'showAdminBoundaries', false);
    }
  } catch {
    // Not a Standard style: no 'basemap' import to configure.
  }
  for (const layer of map.getStyle?.()?.layers ?? []) {
    if (BASE_BOUNDARY_LAYER.test(layer.id) && map.getLayoutProperty(layer.id, 'visibility') !== 'none') {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  }
}

const StateBoundariesLayer = memo(function StateBoundariesLayer() {
  const { current: mapRef } = useMap();

  useEffect(() => {
    const map = mapRef?.getMap?.();
    if (!map) return undefined;
    let frame = null;
    const raise = () => {
      frame = null;
      // Touching layers mid-load throws; a later styledata/idle retries.
      if (!map.isStyleLoaded()) return;
      hideBaseBoundaries(map);
      const order = map.getStyle?.()?.layers?.map((l) => l.id);
      if (!order) return;
      const top = order.slice(-BORDER_LAYER_IDS.length);
      if (BORDER_LAYER_IDS.every((id, i) => top[i] === id)) return;
      BORDER_LAYER_IDS.forEach((id) => { if (map.getLayer(id)) map.moveLayer(id); });
    };
    // Coalesce bursts of style events (several layers mounting at once).
    const schedule = () => { if (frame == null) frame = requestAnimationFrame(raise); };
    map.on('styledata', schedule);
    map.on('idle', schedule);
    schedule();
    return () => {
      map.off('styledata', schedule);
      map.off('idle', schedule);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [mapRef]);

  return (
    <>
      <Source id="country-outlines" type="vector" url="mapbox://mapbox.country-boundaries-v1">
        {casedLine('country-outlines', 'country_boundaries', COUNTRY_FILTER)}
      </Source>
      <Source id="state-boundaries" type="vector" url="mapbox://mapbox.mapbox-streets-v8">
        {casedLine('state-boundaries', 'admin', STATE_LINE_FILTER)}
      </Source>
    </>
  );
});

export default StateBoundariesLayer;
