/**
 * DamageAssessmentLayer.jsx
 * NWS Damage Assessment Toolkit — post-storm survey polygons, tracks, and points,
 * colored by EF/damage scale. One `visible` prop drives all three geometry types.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

const EFSCALE_COLOR = [
  'match', ['get', 'efscale'],
  'EF0', '#84cc16',
  'EF1', '#eab308',
  'EF2', '#f59e0b',
  'EF3', '#f97316',
  'EF3+', '#ea580c',
  'EF4', '#dc2626',
  'EF5', '#7f1d1d',
  'TSTM/Wind', '#3b82f6',
  'Tropical', '#06b6d4',
  '#9ca3af',
];

const DamageAssessmentLayer = memo(function DamageAssessmentLayer({
  pointsGeoJSON,
  linesGeoJSON,
  polygonsGeoJSON,
  visible,
}) {
  const vis = visible ? 'visible' : 'none';

  return (
    <>
      <Source id="dat-polygons" type="geojson" data={polygonsGeoJSON || EMPTY_FC}>
        <Layer
          id="dat-polygons-fill"
          type="fill"
          source="dat-polygons"
          layout={{ visibility: vis }}
          paint={{ 'fill-color': EFSCALE_COLOR, 'fill-opacity': 0.25 }}
        />
        <Layer
          id="dat-polygons-line"
          type="line"
          source="dat-polygons"
          layout={{ visibility: vis }}
          paint={{ 'line-color': EFSCALE_COLOR, 'line-opacity': 0.8, 'line-width': 1.25 }}
        />
      </Source>

      <Source id="dat-lines" type="geojson" data={linesGeoJSON || EMPTY_FC}>
        <Layer
          id="dat-lines-line"
          type="line"
          source="dat-lines"
          layout={{ visibility: vis, 'line-cap': 'round' }}
          paint={{ 'line-color': EFSCALE_COLOR, 'line-opacity': 0.9, 'line-width': 2.5 }}
        />
      </Source>

      <Source id="dat-points" type="geojson" data={pointsGeoJSON || EMPTY_FC}>
        <Layer
          id="dat-points-circle"
          type="circle"
          source="dat-points"
          layout={{ visibility: vis }}
          paint={{
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3, 7, 5, 10, 7],
            'circle-color': EFSCALE_COLOR,
            'circle-opacity': 0.9,
            'circle-stroke-color': '#111827',
            'circle-stroke-width': 1,
          }}
        />
      </Source>
    </>
  );
});

export default DamageAssessmentLayer;
