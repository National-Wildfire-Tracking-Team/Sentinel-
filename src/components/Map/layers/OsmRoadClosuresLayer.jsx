/**
 * Temporary road closures (OSM community API) — points and line segments.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const OsmRoadClosuresLayer = memo(function OsmRoadClosuresLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="osm-road-closures" type="geojson" data={geoJSON || EMPTY_GEOJSON} generateId>
      <Layer
        id="osm-road-closures-line"
        type="line"
        source="osm-road-closures"
        filter={['==', ['geometry-type'], 'LineString']}
        layout={{ visibility: vis }}
        paint={{
          'line-color': '#f59e0b',
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.5, 10, 3, 14, 5],
          'line-opacity': 0.85,
        }}
      />
      <Layer
        id="osm-road-closures-point"
        type="circle"
        source="osm-road-closures"
        filter={['==', ['geometry-type'], 'Point']}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3, 8, 5, 12, 7],
          'circle-color': '#f59e0b',
          'circle-opacity': 0.9,
          'circle-stroke-color': '#1c1917',
          'circle-stroke-width': 1,
        }}
      />
    </Source>
  );
});

export default OsmRoadClosuresLayer;
