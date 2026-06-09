/**
 * IncidentLocationsLayer.jsx
 * Renders WFIGS current incident locations as interactive point markers.
 * Circle markers use a uniform size; color indicates containment status.
 * Layer stays mounted; visibility is controlled via layout property.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const IS_FULLY_CONTAINED = ['>=', ['coalesce', ['get', 'contained'], 0], 100];

// Grey at 100% contained; otherwise interpolate red -> orange -> yellow -> lime
const CONTAINMENT_COLOR = [
  'case',
  IS_FULLY_CONTAINED,
  '#6b7280',
  [
    'interpolate', ['linear'], ['get', 'contained'],
    0,  '#ef4444',
    25, '#f97316',
    50, '#eab308',
    75, '#84cc16',
  ],
];

const DOT_RADIUS = 7;
const DOT_GLOW_RADIUS = 14;

const IncidentLocationsLayer = memo(function IncidentLocationsLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  // Hide fire dots below 0.4 acres
  const sizeFilter = ['>=', ['get', 'acres'], 0.4];

  return (
    <Source id="incident-locations" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      {/* Outer glow ring */}
      <Layer
        id="incident-locations-glow"
        type="circle"
        source="incident-locations"
        filter={sizeFilter}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': DOT_GLOW_RADIUS,
          'circle-color': CONTAINMENT_COLOR,
          'circle-opacity': 0.12,
          'circle-stroke-width': 0,
        }}
      />
      {/* Main marker circle */}
      <Layer
        id="incident-locations-circle"
        type="circle"
        source="incident-locations"
        filter={sizeFilter}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': DOT_RADIUS,
          'circle-color': CONTAINMENT_COLOR,
          'circle-opacity': 0.8,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-stroke-opacity': 0.6,
        }}
      />
      {/* Name labels at higher zoom */}
      <Layer
        id="incident-locations-label"
        type="symbol"
        source="incident-locations"
        filter={sizeFilter}
        minzoom={7}
        layout={{
          visibility: vis,
          'text-field': ['get', 'name'],
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
export default IncidentLocationsLayer;
