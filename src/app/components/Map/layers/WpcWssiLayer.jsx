/**
 * WpcWssiLayer.jsx
 * Renders the WPC Winter Storm Severity Index — Overall Impact polygons
 * (Day 1-3). Winter Weather Area (gray) / Minor (light blue) / Moderate
 * (blue) / Major (purple) / Extreme (red).
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const FILL_FALLBACK = [
  'match', ['get', 'impactCategory'],
  'WINTER WEATHER AREA', '#B0B8C0',
  'MINOR',    '#8FC1E3',
  'MODERATE', '#3A7CA5',
  'MAJOR',    '#8E5BA6',
  'EXTREME',  '#C0392B',
  '#B0B8C0',
];

const STROKE_FALLBACK = [
  'match', ['get', 'impactCategory'],
  'WINTER WEATHER AREA', '#6E7680',
  'MINOR',    '#3A7CA5',
  'MODERATE', '#1F4E6B',
  'MAJOR',    '#5A3570',
  'EXTREME',  '#7B241C',
  '#6E7680',
];

const FILL_COLOR = ['case', ['!=', ['get', 'fillColor'], null], ['get', 'fillColor'], FILL_FALLBACK];
const STROKE_COLOR = ['case', ['!=', ['get', 'strokeColor'], null], ['get', 'strokeColor'], STROKE_FALLBACK];

const LINE_WIDTH = ['interpolate', ['linear'], ['zoom'], 3, 1, 7, 1.6, 10, 2];

const WpcWssiLayer = memo(function WpcWssiLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="wpc-wssi" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      <Layer
        id="wpc-wssi-fill"
        type="fill"
        source="wpc-wssi"
        layout={{ visibility: vis }}
        paint={{ 'fill-color': FILL_COLOR, 'fill-opacity': 0.4 }}
      />
      <Layer
        id="wpc-wssi-line"
        type="line"
        source="wpc-wssi"
        layout={{ visibility: vis }}
        paint={{ 'line-color': STROKE_COLOR, 'line-opacity': 0.9, 'line-width': LINE_WIDTH }}
      />
    </Source>
  );
});

export default WpcWssiLayer;
