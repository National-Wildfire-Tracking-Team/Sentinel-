/**
 * CMRA electric transmission lines + EIA natural gas pipelines (line features).
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const transmissionPaint = {
  'line-color': '#fbbf24',
  'line-opacity': 0.85,
  'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 8, 1.2, 12, 2.5, 16, 4],
};

const gasPipelinePaint = {
  'line-color': '#38bdf8',
  'line-opacity': 0.88,
  'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 8, 1, 12, 2, 16, 3.2],
};

const CriticalInfrastructureLayer = memo(function CriticalInfrastructureLayer({
  transmissionGeoJSON,
  gasPipelinesGeoJSON,
  visible,
}) {
  const vis = visible ? 'visible' : 'none';

  return (
    <>
      <Source
        id="eia-gas-pipelines"
        type="geojson"
        data={gasPipelinesGeoJSON || EMPTY_GEOJSON}
      >
        <Layer
          id="eia-gas-pipelines"
          type="line"
          source="eia-gas-pipelines"
          layout={{ visibility: vis, 'line-cap': 'round', 'line-join': 'round' }}
          paint={gasPipelinePaint}
        />
      </Source>
      <Source
        id="cmra-transmission"
        type="geojson"
        data={transmissionGeoJSON || EMPTY_GEOJSON}
      >
        <Layer
          id="cmra-transmission-lines"
          type="line"
          source="cmra-transmission"
          layout={{ visibility: vis, 'line-cap': 'round', 'line-join': 'round' }}
          paint={transmissionPaint}
        />
      </Source>
    </>
  );
});

export default CriticalInfrastructureLayer;
