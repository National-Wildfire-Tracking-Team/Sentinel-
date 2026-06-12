/**
 * RiverGaugesLayer.jsx
 * NOAA NWPS river gauges rendered as colored circle markers.
 * Color indicates flood status: major (purple) → moderate (red) → minor (orange) → action (yellow) → normal (green).
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

// Mapbox expression for status → fill color
const STATUS_COLOR = [
  'match', ['get', 'status'],
  'major',    '#7c3aed',
  'moderate', '#dc2626',
  'minor',    '#f97316',
  'action',   '#eab308',
  'normal',   '#22c55e',
  '#6b7280', // default / unknown
];

const RiverGaugesLayer = memo(function RiverGaugesLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';
  const data = geoJSON || EMPTY_GEOJSON;

  return (
    <Source id="river-gauges" type="geojson" data={data}>
      {/* Glow ring */}
      <Layer
        id="river-gauges-glow"
        type="circle"
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            4, 7, 8, 12, 12, 18,
          ],
          'circle-color': STATUS_COLOR,
          'circle-opacity': 0.20,
          'circle-blur': 0.8,
          'circle-stroke-width': 0,
        }}
      />

      {/* Main dot */}
      <Layer
        id="river-gauges-circle"
        type="circle"
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            4, 4, 8, 7, 12, 10,
          ],
          'circle-color': STATUS_COLOR,
          'circle-opacity': 0.95,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': [
            'interpolate', ['linear'], ['zoom'],
            4, 1, 8, 1.5, 12, 2,
          ],
        }}
      />

      {/* Stage value label — visible at closer zoom */}
      <Layer
        id="river-gauges-label"
        type="symbol"
        minzoom={7}
        layout={{
          visibility: vis,
          'text-field': [
            'case',
            ['!=', ['get', 'currentStage'], null],
            ['concat', ['to-string', ['round', ['get', 'currentStage']]], ' ft'],
            '',
          ],
          'text-anchor': 'top',
          'text-offset': [0, 1.0],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            7, 9, 10, 11, 13, 13,
          ],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        }}
        paint={{
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.85)',
          'text-halo-width': 1.5,
        }}
      />

      {/* Station name label — only at high zoom */}
      <Layer
        id="river-gauges-name"
        type="symbol"
        minzoom={10}
        layout={{
          visibility: vis,
          'text-field': ['get', 'name'],
          'text-anchor': 'bottom',
          'text-offset': [0, -1.2],
          'text-size': 10,
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-max-width': 10,
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        }}
        paint={{
          'text-color': '#e2e8f0',
          'text-halo-color': 'rgba(0,0,0,0.9)',
          'text-halo-width': 1.5,
        }}
      />
    </Source>
  );
});

export default RiverGaugesLayer;
