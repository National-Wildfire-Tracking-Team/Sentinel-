/**
 * FireHotspotsLayer.jsx
 * Renders NASA FIRMS fire hotspot detections as clustered circle markers.
 * Uses FRP (Fire Radiative Power) to drive color and size.
 * Layer stays mounted; visibility is controlled via layout property.
 */

import { Source, Layer } from 'react-map-gl';
import { FRP_COLOR_EXPRESSION, FRP_RADIUS_EXPRESSION } from '../../../utils/colorUtils';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

export default function FireHotspotsLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source
      id="fire-hotspots"
      type="geojson"
      data={geoJSON || EMPTY_GEOJSON}
      cluster
      clusterMaxZoom={12}
      clusterRadius={45}
    >
      {/* Outer glow for high-intensity fires (FRP > 200 MW) */}
      <Layer
        id="fire-hotspots-glow"
        type="circle"
        source="fire-hotspots"
        filter={['all', ['!', ['has', 'point_count']], ['>=', ['get', 'frp'], 200]]}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': ['*', FRP_RADIUS_EXPRESSION, 2.2],
          'circle-color': '#ff4500',
          'circle-opacity': 0.15,
          'circle-stroke-width': 0,
        }}
      />
      {/* Cluster circles */}
      <Layer
        id="fire-clusters"
        type="circle"
        source="fire-hotspots"
        filter={['has', 'point_count']}
        layout={{ visibility: vis }}
        paint={{
          'circle-color': ['step', ['get', 'point_count'], '#ff8c00', 10, '#ff4500', 50, '#cc0000'],
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 30],
          'circle-opacity': 0.9,
          'circle-stroke-color': 'rgba(255,255,255,0.3)',
          'circle-stroke-width': 1.5,
        }}
      />
      {/* Cluster count labels */}
      <Layer
        id="fire-cluster-count"
        type="symbol"
        source="fire-hotspots"
        filter={['has', 'point_count']}
        layout={{
          visibility: vis,
          'text-field': '{point_count_abbreviated}',
          'text-size': 12,
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
        }}
        paint={{ 'text-color': '#ffffff' }}
      />
      {/* Individual hotspot points */}
      <Layer
        id="fire-hotspots-circle"
        type="circle"
        source="fire-hotspots"
        filter={['!', ['has', 'point_count']]}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': FRP_RADIUS_EXPRESSION,
          'circle-color': FRP_COLOR_EXPRESSION,
          'circle-opacity': 0.85,
          'circle-stroke-color': 'rgba(255,255,255,0.5)',
          'circle-stroke-width': 0.8,
        }}
      />
    </Source>
  );
}
