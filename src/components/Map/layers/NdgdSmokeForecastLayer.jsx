/**
 * NdgdSmokeForecastLayer.jsx
 * NOAA NDGD hourly smoke concentration polygons (next 48h, CONUS).
 * Class breaks from layer drawingInfo (smoke_classdesc, µg/m³).
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

// Matches NOAA NDGD FeatureServer renderer (uniqueValueInfos)
const SMOKE_FILL_COLOR = [
  'match',
  ['get', 'smoke_classdesc'],
  '0 - 3',     '#ffffa3',
  '3 - 25',    '#fad157',
  '25 - 63',   '#f2a62c',
  '63 - 158',  '#ab5213',
  '158 - 1000', '#690000',
  '#94a3b8',
];

const SMOKE_LINE_COLOR = [
  'match',
  ['get', 'smoke_classdesc'],
  '0 - 3',     '#b8b870',
  '3 - 25',    '#a68530',
  '25 - 63',   '#a66f1a',
  '63 - 158',  '#6b3410',
  '158 - 1000', '#3d0000',
  '#64748b',
];

const NdgdSmokeForecastLayer = memo(function NdgdSmokeForecastLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="ndgd-smoke-forecast" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      <Layer
        id="ndgd-smoke-forecast-fill"
        type="fill"
        source="ndgd-smoke-forecast"
        layout={{ visibility: vis }}
        paint={{
          'fill-color': SMOKE_FILL_COLOR,
          'fill-opacity': 0.42,
        }}
      />
      <Layer
        id="ndgd-smoke-forecast-line"
        type="line"
        source="ndgd-smoke-forecast"
        layout={{ visibility: vis }}
        paint={{
          'line-color': SMOKE_LINE_COLOR,
          'line-opacity': 0.65,
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            3, 0.5,
            7, 1,
            10, 1.5,
          ],
        }}
      />
    </Source>
  );
});

export default NdgdSmokeForecastLayer;
