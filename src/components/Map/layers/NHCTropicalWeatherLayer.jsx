/**
 * NHCTropicalWeatherLayer.jsx
 * Renders NHC Tropical Weather Outlook disturbance polygons.
 * Colors are based on formation probability (LOW / MEDIUM / HIGH) with
 * fallback to NOAA-supplied fill/stroke properties when present.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const FILL_FALLBACK = [
  'match', ['get', 'formationChance'],
  'LOW',    '#FFE566',
  'MEDIUM', '#FFA040',
  'HIGH',   '#FF4444',
  '#FFE566',
];

const STROKE_FALLBACK = [
  'match', ['get', 'formationChance'],
  'LOW',    '#CCAA00',
  'MEDIUM', '#CC5500',
  'HIGH',   '#BB0000',
  '#CCAA00',
];

const FILL_COLOR = [
  'case',
  ['!=', ['get', 'fillColor'], null],
  ['get', 'fillColor'],
  FILL_FALLBACK,
];

const STROKE_COLOR = [
  'case',
  ['!=', ['get', 'strokeColor'], null],
  ['get', 'strokeColor'],
  STROKE_FALLBACK,
];

const LINE_WIDTH = [
  'interpolate', ['linear'], ['zoom'],
  3, 1,
  7, 1.6,
  10, 2,
];

const NHCTropicalWeatherLayer = memo(function NHCTropicalWeatherLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="nhc-tropical" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      <Layer
        id="nhc-tropical-fill"
        type="fill"
        source="nhc-tropical"
        layout={{ visibility: vis }}
        paint={{
          'fill-color': FILL_COLOR,
          'fill-opacity': 0.4,
        }}
      />
      <Layer
        id="nhc-tropical-line"
        type="line"
        source="nhc-tropical"
        layout={{ visibility: vis }}
        paint={{
          'line-color': STROKE_COLOR,
          'line-opacity': 0.9,
          'line-width': LINE_WIDTH,
        }}
      />
    </Source>
  );
});

export default NHCTropicalWeatherLayer;
