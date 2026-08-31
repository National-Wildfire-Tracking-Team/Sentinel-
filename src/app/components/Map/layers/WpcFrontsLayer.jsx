/**
 * WpcFrontsLayer.jsx
 * Renders WPC surface-analysis fronts (Day 1-3): cold (blue), warm (red),
 * occluded (purple) as solid lines; stationary (purple) and trough (amber)
 * as dashed lines. `line-dasharray` isn't a data-driven property in
 * MapLibre, so solid vs. dashed fronts are split into two Layers filtered
 * on the pre-computed `dashed` boolean rather than one Layer with an
 * expression.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const LINE_COLOR_FALLBACK = [
  'match', ['get', 'frontType'],
  'COLD',       '#2E6FDB',
  'WARM',       '#DB2E2E',
  'STATIONARY', '#9B59B6',
  'OCCLUDED',   '#7B4FA6',
  'TROUGH',     '#D97706',
  '#9B59B6',
];

const LINE_COLOR = ['case', ['!=', ['get', 'color'], null], ['get', 'color'], LINE_COLOR_FALLBACK];
const LINE_WIDTH = ['interpolate', ['linear'], ['zoom'], 3, 1.5, 7, 2.2, 10, 3];

const WpcFrontsLayer = memo(function WpcFrontsLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="wpc-fronts" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      <Layer
        id="wpc-fronts-solid"
        type="line"
        source="wpc-fronts"
        filter={['!=', ['get', 'dashed'], true]}
        layout={{ visibility: vis, 'line-cap': 'round', 'line-join': 'round' }}
        paint={{ 'line-color': LINE_COLOR, 'line-opacity': 0.9, 'line-width': LINE_WIDTH }}
      />
      <Layer
        id="wpc-fronts-dashed"
        type="line"
        source="wpc-fronts"
        filter={['==', ['get', 'dashed'], true]}
        layout={{ visibility: vis, 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': LINE_COLOR,
          'line-opacity': 0.9,
          'line-width': LINE_WIDTH,
          'line-dasharray': [2, 1.5],
        }}
      />
    </Source>
  );
});

export default WpcFrontsLayer;
