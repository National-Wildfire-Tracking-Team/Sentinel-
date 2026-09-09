/**
 * UserReportsLayer.jsx
 * Renders community-submitted fire reports (Supabase) on the map.
 * Uses the same containment-based color scale as official incident dots.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

// Reporter dots render with the exact same size/opacity/stroke as official
// IncidentLocationsLayer (WFIGS/IRWIN) dots so the two sources are visually
// indistinguishable on the map.
const DOT_RADIUS = 7;
const DOT_GLOW_RADIUS = 14;

const IS_FULLY_CONTAINED = ['>=', ['coalesce', ['get', 'contained'], 0], 100];

const USER_REPORT_COLOR = [
  'case',
  ['==', ['get', 'contained'], null],
  '#9ca3af',
  ['>=', ['get', 'contained'], 100],
  '#6b7280',
  [
    'interpolate',
    ['linear'],
    ['get', 'contained'],
    0, '#ef4444',
    25, '#f97316',
    50, '#eab308',
    75, '#84cc16',
  ],
];

const UserReportsLayer = memo(function UserReportsLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="user-reports" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      {/* Outer glow / pulse ring */}
      <Layer
        id="user-reports-glow"
        type="circle"
        source="user-reports"
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': DOT_GLOW_RADIUS,
          'circle-color': USER_REPORT_COLOR,
          'circle-opacity': 0.12,
          'circle-stroke-width': 0,
        }}
      />
      {/* Main marker */}
      <Layer
        id="user-reports-circle"
        type="circle"
        source="user-reports"
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': DOT_RADIUS,
          'circle-color': USER_REPORT_COLOR,
          'circle-opacity': 0.8,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-stroke-opacity': 0.6,
        }}
      />
      {/* Title label at higher zoom */}
      <Layer
        id="user-reports-label"
        type="symbol"
        source="user-reports"
        minzoom={7}
        layout={{
          visibility: vis,
          'text-field': ['get', 'title'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 11,
          'text-anchor': 'top',
          'text-offset': [0, 1.5],
          'text-max-width': 10,
        }}
        paint={{
          'text-color': ['case', IS_FULLY_CONTAINED, '#9ca3af', '#ffffff'],
          'text-halo-color': 'rgba(0,0,0,0.8)',
          'text-halo-width': 1.5,
        }}
      />
    </Source>
  );
});
export default UserReportsLayer;
