/**
 * TropicalStormsLayer.jsx
 * Renders active NHC tropical storm positions as colored circle markers
 * with storm name + intensity labels. Color encodes storm type:
 *   TD  → yellow   TS  → orange   H1-2 → red   H3+ → magenta
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY = { type: 'FeatureCollection', features: [] };

const TropicalStormsLayer = memo(function TropicalStormsLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="tropical-storms" type="geojson" data={geoJSON || EMPTY}>
      {/* Outer glow ring */}
      <Layer
        id="tropical-storms-glow"
        type="circle"
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 14, 6, 22, 10, 30],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.18,
          'circle-blur': 0.8,
        }}
      />

      {/* Main dot */}
      <Layer
        id="tropical-storms-circle"
        type="circle"
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 6, 6, 10, 10, 14],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.95,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        }}
      />

      {/* Storm name + intensity label */}
      <Layer
        id="tropical-storms-label"
        type="symbol"
        minzoom={2}
        layout={{
          visibility: vis,
          'text-field': ['get', 'label'],
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-size': 11,
          'text-anchor': 'top',
          'text-offset': [0, 1.2],
          'text-allow-overlap': false,
        }}
        paint={{
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.8)',
          'text-halo-width': 1.5,
        }}
      />
    </Source>
  );
});

export default TropicalStormsLayer;
