/**
 * FloodHazardLayer.jsx
 * FEMA National Flood Hazard Layer (NFHL), via cloud/fema-nfhl-proxy.
 *
 *   overview (zoom 7–12): NFHL availability — where FEMA has digital flood
 *                         maps. Unshaded areas have no digital FIRM (paper
 *                         maps only, or unmapped).
 *   detail   (zoom 12+):  flood hazard zones by FEMA category, plus FIRM
 *                         panel outlines (panels carry the effective date
 *                         and panel number shown on click).
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
  const availability = data?.availability || EMPTY_GEOJSON;

  return (
    <>
      <Source id="flood-hazard-availability" type="geojson" data={availability} attribution={FLOOD_ATTRIBUTION}>
        <Layer
          id="flood-hazard-availability-fill"
          type="fill"
          source="flood-hazard-availability"
          layout={{ visibility: vis }}
          paint={{ 'fill-color': '#00c8f0', 'fill-opacity': 0.12 }}
        />
        <Layer
          id="flood-hazard-availability-line"
          type="line"
          source="flood-hazard-availability"
          layout={{ visibility: vis }}
          paint={{ 'line-color': '#7dd3fc', 'line-opacity': 0.5, 'line-width': 0.8 }}
        />
      </Source>

      <Source id="flood-hazard-panels" type="geojson" data={panels} attribution={FLOOD_ATTRIBUTION}>
        {/* Transparent everywhere except unmapped communities — kept as a
            fill so a click anywhere inside a panel can report its panel
            number and effective date. */}
        <Layer
          id={FLOOD_PANELS_FILL_ID}
          type="fill"
          source="flood-hazard-panels"
          layout={{ visibility: vis }}
          paint={{
            'fill-color': '#71717a',
            'fill-opacity': ['case', ['==', ['get', 'unmapped'], true], 0.25, 0],
          }}
        />
        <Layer
          id="flood-hazard-panels-line"
          type="line"
          source="flood-hazard-panels"
          layout={{ visibility: vis }}
          paint={{
            'line-color': '#e4e4e7',
            'line-opacity': 0.35,
            'line-width': 0.75,
            'line-dasharray': [3, 3],
          }}
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
