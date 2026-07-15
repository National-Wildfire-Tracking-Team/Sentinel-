/**
 * Fire behavior spread-projection rings (+1h/+3h/+6h). Sentinel Pro/Team.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const horizonColorExpr = [
  'match', ['get', 'horizonHours'],
  1, '#ff3b1f',
  3, '#ff8c1a',
  6, '#ffd11a',
  '#ffd11a',
];

const fillPaint = {
  'fill-color': horizonColorExpr,
  'fill-opacity': ['match', ['get', 'horizonHours'], 1, 0.32, 3, 0.2, 6, 0.12, 0.15],
};

const linePaint = {
  'line-color': horizonColorExpr,
  'line-width': 1.5,
  'line-opacity': 0.85,
  'line-dasharray': [2, 1.5],
};

const FireBehaviorModelingLayer = memo(function FireBehaviorModelingLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="fire-behavior-modeling" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      <Layer
        id="fire-behavior-modeling-fill"
        type="fill"
        source="fire-behavior-modeling"
        layout={{ visibility: vis }}
        paint={fillPaint}
      />
      <Layer
        id="fire-behavior-modeling-line"
        type="line"
        source="fire-behavior-modeling"
        layout={{ visibility: vis, 'line-cap': 'round', 'line-join': 'round' }}
        paint={linePaint}
      />
    </Source>
  );
});

export default FireBehaviorModelingLayer;
