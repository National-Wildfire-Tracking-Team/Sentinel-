/**
 * WpcEroLayer.jsx
 * Renders the WPC Excessive Rainfall Outlook polygons (Day 1-3).
 * Marginal (green) / Slight (yellow) / Moderate (red) / High (magenta).
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const FILL_FALLBACK = [
  'match', ['get', 'riskCategory'],
  'MARGINAL', '#7FBF7F',
  'SLIGHT',   '#FFE066',
  'MODERATE', '#FF6666',
  'HIGH',     '#FF00FF',
  '#7FBF7F',
];

const STROKE_FALLBACK = [
  'match', ['get', 'riskCategory'],
  'MARGINAL', '#2E8B3D',
  'SLIGHT',   '#DDAA00',
  'MODERATE', '#CC0000',
  'HIGH',     '#990099',
  '#2E8B3D',
];

const FILL_COLOR = ['case', ['!=', ['get', 'fillColor'], null], ['get', 'fillColor'], FILL_FALLBACK];
const STROKE_COLOR = ['case', ['!=', ['get', 'strokeColor'], null], ['get', 'strokeColor'], STROKE_FALLBACK];

const LINE_WIDTH = ['interpolate', ['linear'], ['zoom'], 3, 1, 7, 1.6, 10, 2];

const WpcEroLayer = memo(function WpcEroLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="wpc-ero" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      <Layer
        id="wpc-ero-fill"
        type="fill"
        source="wpc-ero"
        layout={{ visibility: vis }}
        paint={{ 'fill-color': FILL_COLOR, 'fill-opacity': 0.4 }}
      />
      <Layer
        id="wpc-ero-line"
        type="line"
        source="wpc-ero"
        layout={{ visibility: vis }}
        paint={{ 'line-color': STROKE_COLOR, 'line-opacity': 0.9, 'line-width': LINE_WIDTH }}
      />
    </Source>
  );
});

export default WpcEroLayer;
