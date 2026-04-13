/**
 * IncidentLocationsLayer.jsx
 * Renders WFIGS current incident locations as interactive point markers.
 * Circle size scales with fire acreage; color indicates containment status.
 * Layer stays mounted; visibility is controlled via layout property.
 */

import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

// Circle color: red (active) -> yellow (partial containment) -> green (controlled)
const CONTAINMENT_COLOR = [
  'interpolate', ['linear'], ['get', 'contained'],
  0,   '#ef4444',
  25,  '#f97316',
  50,  '#eab308',
  75,  '#84cc16',
  100, '#22c55e',
];

// Circle radius: scales with acreage
const ACRES_RADIUS = [
  'interpolate', ['linear'], ['get', 'acres'],
  0,      5,
  100,    8,
  1000,  12,
  10000, 18,
  50000, 24,
  100000, 30,
];

export default function IncidentLocationsLayer({ geoJSON, visible }) {
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
          'circle-radius': ['*', ACRES_RADIUS, 1.8],
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
          'circle-radius': ACRES_RADIUS,
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
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.8)',
          'text-halo-width': 1.5,
        }}
      />
    </Source>
  );
}
