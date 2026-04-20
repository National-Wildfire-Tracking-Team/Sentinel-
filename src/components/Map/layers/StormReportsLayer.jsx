/**
 * StormReportsLayer.jsx
 * Generic storm reports point layer for SPC/IEM feeds.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const TYPE_COLOR = [
  'match', ['get', 'reportType'],
  'Tornado', '#ef4444',
  'Hail', '#3b82f6',
  'Wind', '#f59e0b',
  '#e5e7eb',
];

const StormReportsLayer = memo(function StormReportsLayer({
  idPrefix,
  geoJSON,
  visible,
  opacity = 0.9,
}) {
  const vis = visible ? 'visible' : 'none';
  const sourceId = `${idPrefix}-reports`;

  return (
    <Source id={sourceId} type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      <Layer
        id={`${idPrefix}-reports-circle`}
        type="circle"
        source={sourceId}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            3, 4,
            7, 6,
            10, 8,
          ],
          'circle-color': TYPE_COLOR,
          'circle-opacity': opacity,
          'circle-stroke-color': '#111827',
          'circle-stroke-width': 1.25,
        }}
      />
      <Layer
        id={`${idPrefix}-reports-label`}
        type="symbol"
        source={sourceId}
        minzoom={6}
        layout={{
          visibility: vis,
          'text-field': ['slice', ['get', 'reportType'], 0, 1],
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-size': 9,
          'text-anchor': 'center',
        }}
        paint={{
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.75)',
          'text-halo-width': 1,
        }}
      />
    </Source>
  );
});
export default StormReportsLayer;
