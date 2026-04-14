/**
 * FireHotspotsLayer.jsx
 * Renders raw NASA FIRMS hotspot records directly as map points.
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
    >
      <Layer
        id="fire-hotspots-raw"
        type="circle"
        source="fire-hotspots"
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': FRP_RADIUS_EXPRESSION,
          'circle-color': FRP_COLOR_EXPRESSION,
          'circle-opacity': 0.88,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 0.6,
        }}
      />
    </Source>
  );
}
