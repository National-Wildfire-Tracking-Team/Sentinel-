/**
 * CMRA electric transmission lines (line features) for situational awareness.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const CriticalInfrastructureLayer = memo(function CriticalInfrastructureLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="critical-infrastructure" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      <Layer
        id="cmra-transmission-lines"
        type="line"
        source="critical-infrastructure"
        layout={{ visibility: vis, 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': '#fbbf24',
          'line-opacity': 0.85,
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 8, 1.2, 12, 2.5, 16, 4],
        }}
      />
    </Source>
  );
});

export default CriticalInfrastructureLayer;
