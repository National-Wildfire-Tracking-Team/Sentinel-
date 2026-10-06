/**
 * FloodHazardLayer.jsx
 * FEMA National Flood Hazard Layer (NFHL), via cloud/fema-nfhl-proxy.
 *
 * Shows flood risk zones by FEMA category from zoom 12 (about a 1-mile map
 * scale) in. FIRM panels are loaded too but drawn invisibly — they're only
 * there so a click can report the panel number and effective date.
 *
 * Contextual hazard information: mounted in MapView directly above the base
 * imagery and below weather alerts, perimeters, incidents, and evacuation
 * zones, with low fill opacity so it never hides operational data.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';
import { FLOOD_ATTRIBUTION, FLOOD_CATEGORIES, FLOOD_CATEGORY_COLOR_EXPRESSION } from '../../../utils/floodHazard';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

// Draw order within the zones layer — higher sorts on top, so floodway
// strips stay visible where they sit inside a wider 1% floodplain.
const CATEGORY_KEYS = Object.keys(FLOOD_CATEGORIES);
const SORT_KEY_EXPRESSION = [
  'match',
  ['get', 'category'],
  ...CATEGORY_KEYS.flatMap((key, i) => [key, CATEGORY_KEYS.length - i]),
  0,
];

export const FLOOD_ZONES_FILL_ID = 'flood-hazard-zones-fill';
export const FLOOD_PANELS_FILL_ID = 'flood-hazard-panels-fill';

const FloodHazardLayer = memo(function FloodHazardLayer({ data, visible }) {
  const vis = visible ? 'visible' : 'none';
  const zones = data?.zones || EMPTY_GEOJSON;
  const panels = data?.panels || EMPTY_GEOJSON;

  return (
    <>
      <Source id="flood-hazard-panels" type="geojson" data={panels} attribution={FLOOD_ATTRIBUTION}>
        {/* Fully transparent — kept as a fill so a click anywhere inside a
            panel can report its panel number and effective date. */}
        <Layer
          id={FLOOD_PANELS_FILL_ID}
          type="fill"
          source="flood-hazard-panels"
          layout={{ visibility: vis }}
          paint={{ 'fill-color': '#71717a', 'fill-opacity': 0 }}
        />
      </Source>

      <Source id="flood-hazard-zones" type="geojson" data={zones} attribution={FLOOD_ATTRIBUTION}>
        <Layer
          id={FLOOD_ZONES_FILL_ID}
          type="fill"
          source="flood-hazard-zones"
          layout={{ visibility: vis, 'fill-sort-key': SORT_KEY_EXPRESSION }}
          paint={{
            'fill-color': FLOOD_CATEGORY_COLOR_EXPRESSION,
            'fill-opacity': [
              'interpolate', ['linear'], ['zoom'],
              12, 0.3,
              16, 0.22,
            ],
          }}
        />
        <Layer
          id="flood-hazard-zones-line"
          type="line"
          source="flood-hazard-zones"
          layout={{ visibility: vis, 'line-sort-key': SORT_KEY_EXPRESSION }}
          paint={{
            'line-color': FLOOD_CATEGORY_COLOR_EXPRESSION,
            'line-opacity': 0.75,
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              12, 0.5,
              16, 1.4,
            ],
          }}
        />
      </Source>
    </>
  );
});

export default FloodHazardLayer;
