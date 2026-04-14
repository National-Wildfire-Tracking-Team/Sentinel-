/**
 * SPCOutlookLayer.jsx
 * Renders SPC categorical risk polygons (Day 1-3).
 */

import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const SPC_RISK_COLOR = [
  'match', ['get', 'riskCategory'],
  'TSTM', '#55BB55',
  'MRGL', '#00FF00',
  'SLGT', '#F9F200',
  'ENH', '#FF9900',
  'MDT', '#FF0000',
  'HIGH', '#FF00FF',
  '#55BB55',
];

const DAY_OPACITY = [
  'match', ['get', 'day'],
  'day1', 0.26,
  'day2', 0.19,
  'day3', 0.13,
  0.16,
];

export default function SPCOutlookLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="spc-outlooks" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      <Layer
        id="spc-outlook-fill"
        type="fill"
        source="spc-outlooks"
        layout={{ visibility: vis }}
        paint={{
          'fill-color': SPC_RISK_COLOR,
          'fill-opacity': DAY_OPACITY,
        }}
      />

      <Layer
        id="spc-outlook-line"
        type="line"
        source="spc-outlooks"
        layout={{ visibility: vis }}
        paint={{
          'line-color': SPC_RISK_COLOR,
          'line-opacity': 0.95,
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
}
