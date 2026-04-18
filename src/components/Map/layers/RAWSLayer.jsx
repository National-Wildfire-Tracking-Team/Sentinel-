/**
 * RAWSLayer.jsx
 * Renders RAWS (Remote Automated Weather Stations) as color-coded circles.
 * Color encodes relative humidity: low RH = red (fire-danger), high = blue (safe).
 * Falls back to a neutral amber if RH is unavailable.
 */

import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

// RH-based color gradient: low humidity → fire danger red, high → blue
const RH_COLOR_EXPRESSION = [
  'case',
  ['==', ['get', 'relHumidity'], null],
  '#f59e0b', // amber fallback when RH unavailable
  [
    'interpolate', ['linear'], ['get', 'relHumidity'],
    0,   '#ef4444', // 0% – extreme fire danger
    15,  '#f97316', // 15% – very high
    25,  '#f59e0b', // 25% – high
    40,  '#84cc16', // 40% – moderate
    60,  '#22d3ee', // 60% – low danger
    80,  '#3b82f6', // 80% – minimal danger
    100, '#6366f1', // 100%
  ],
];

export default function RAWSLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="raws-stations" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      {/* Outer glow ring */}
      <Layer
        id="raws-stations-glow"
        type="circle"
        source="raws-stations"
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            4, 7,
            8, 11,
            12, 15,
          ],
          'circle-color': RH_COLOR_EXPRESSION,
          'circle-opacity': 0.2,
          'circle-stroke-width': 0,
        }}
      />

      {/* Main station dot */}
      <Layer
        id="raws-stations-circle"
        type="circle"
        source="raws-stations"
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            4, 4,
            8, 7,
            12, 10,
          ],
          'circle-color': RH_COLOR_EXPRESSION,
          'circle-opacity': 0.9,
          'circle-stroke-color': 'rgba(255,255,255,0.6)',
          'circle-stroke-width': 1.5,
        }}
      />

      {/* Station name label – only visible when zoomed in */}
      <Layer
        id="raws-stations-label"
        type="symbol"
        source="raws-stations"
        minzoom={8}
        layout={{
          visibility: vis,
          'text-field': ['get', 'stationName'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': 10,
          'text-anchor': 'top',
          'text-offset': [0, 1],
          'text-max-width': 10,
        }}
        paint={{
          'text-color': '#e2e8f0',
          'text-halo-color': 'rgba(0,0,0,0.8)',
          'text-halo-width': 1.5,
        }}
      />
    </Source>
  );
}
