/**
 * SPCOutlookLayer.jsx
 * Renders SPC categorical risk polygons (Day 1-3).
 * Colors are driven by the NOAA MapServer's own fill/stroke properties when
 * available, with a fallback match expression based on risk category.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

// Fallback risk colors matching official SPC palette
const SPC_RISK_FILL_FALLBACK = [
  'match', ['get', 'riskCategory'],
  'TSTM', '#C1E9C1',
  'MRGL', '#66A366',
  'SLGT', '#FFE066',
  'ENH', '#FFA366',
  'MDT', '#FF6666',
  'HIGH', '#FF88FF',
  '#C1E9C1',
];

const SPC_RISK_STROKE_FALLBACK = [
  'match', ['get', 'riskCategory'],
  'TSTM', '#55BB55',
  'MRGL', '#005500',
  'SLGT', '#DDAA00',
  'ENH', '#FF6600',
  'MDT', '#FF0000',
  'HIGH', '#FF00FF',
  '#55BB55',
];

// Use the NOAA-provided fill color when present, fall back to risk-based color
const FILL_COLOR = [
  'case',
  ['!=', ['get', 'fillColor'], null],
  ['get', 'fillColor'],
  SPC_RISK_FILL_FALLBACK,
];

const STROKE_COLOR = [
  'case',
  ['!=', ['get', 'strokeColor'], null],
  ['get', 'strokeColor'],
  SPC_RISK_STROKE_FALLBACK,
];

const DAY_OPACITY = [
  'match', ['get', 'day'],
  'day1', 0.55,
  'day2', 0.45,
  'day3', 0.35,
  0.45,
];

const SPCOutlookLayer = memo(function SPCOutlookLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="spc-outlooks" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      <Layer
        id="spc-outlook-fill"
        type="fill"
        source="spc-outlooks"
        layout={{ visibility: vis }}
        paint={{
          'fill-color': FILL_COLOR,
          'fill-opacity': DAY_OPACITY,
        }}
      />

      <Layer
        id="spc-outlook-line"
        type="line"
        source="spc-outlooks"
        layout={{ visibility: vis }}
        paint={{
          'line-color': STROKE_COLOR,
          'line-opacity': 0.9,
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            3, 1,
            7, 1.6,
            10, 2,
          ],
        }}
      />
    </Source>
  );
});
export default SPCOutlookLayer;
