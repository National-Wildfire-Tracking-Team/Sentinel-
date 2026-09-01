/**
 * UserReportsLayer.jsx
 * Renders community-submitted fire reports (Supabase) on the map.
 * Uses a distinct cyan/teal color so submitted reports are visually
 * separated from official NASA FIRMS / NIFC sources.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const USER_REPORT_COLOR = '#22d3ee'; // cyan-400 – distinct from fire orange/red

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
          'circle-radius': 18,
          'circle-color': USER_REPORT_COLOR,
          'circle-opacity': 0.18,
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
          'circle-radius': 9,
          'circle-color': USER_REPORT_COLOR,
          'circle-opacity': 0.9,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-stroke-opacity': 0.95,
        }}
      />
      {/* Title label at higher zoom */}
      <Layer
        id="user-reports-label"
        type="symbol"
        source="user-reports"
        minzoom={6}
        layout={{
          visibility: vis,
          'text-field': ['get', 'title'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 11,
          'text-anchor': 'top',
          'text-offset': [0, 1.2],
          'text-max-width': 10,
        }}
        paint={{
          'text-color': '#e0f7fa',
          'text-halo-color': 'rgba(0,0,0,0.85)',
          'text-halo-width': 1.5,
        }}
      />
    </Source>
  );
});
export default UserReportsLayer;
