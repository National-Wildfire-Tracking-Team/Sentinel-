/**
 * CaliforniaLandOwnershipLayer.jsx
 * Renders CAL FIRE FRAP's California Land Ownership (public) polygons.
 * Source: CNRA-hosted ArcGIS FeatureServer, via californiaLandOwnership.js.
 *
 * Ownership levels (field: Own_Level):
 *   Federal, State, Tribal, County, City, Special District, Non Profit
 * (privately-owned land is excluded from the source dataset, so it renders
 * as a gap rather than a polygon.)
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

// Colors per ownership level
const OWNERSHIP_FILL_COLOR = [
  'match',
  ['get', 'Own_Level'],
  'Federal',          '#2563eb',
  'State',            '#16a34a',
  'Tribal',           '#a855f7',
  'County',           '#f59e0b',
  'City',             '#f97316',
  'Special District', '#06b6d4',
  'Non Profit',       '#84cc16',
  '#94a3b8',
];

const CaliforniaLandOwnershipLayer = memo(function CaliforniaLandOwnershipLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="california-land-ownership" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      <Layer
        id="california-land-ownership-fill"
        type="fill"
        source="california-land-ownership"
        layout={{ visibility: vis }}
        paint={{
          'fill-color': OWNERSHIP_FILL_COLOR,
          'fill-opacity': 0.35,
        }}
      />

      <Layer
        id="california-land-ownership-line"
        type="line"
        source="california-land-ownership"
        layout={{ visibility: vis }}
        paint={{
          'line-color': OWNERSHIP_FILL_COLOR,
          'line-opacity': 0.8,
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            10, 0.8,
            14, 1.6,
            18, 2.4,
          ],
        }}
      />
    </Source>
  );
});

export default CaliforniaLandOwnershipLayer;
