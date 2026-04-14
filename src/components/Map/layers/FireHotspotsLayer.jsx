/**
 * FireHotspotsLayer.jsx
 * Renders raw NASA FIRMS hotspot records as fixed-size boxes.
 * Layer stays mounted; visibility is controlled via layout property.
 */

import { Source, Layer } from 'react-map-gl';

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
        id="fire-hotspots-box"
        type="fill"
        source="fire-hotspots"
        layout={{ visibility: vis }}
        paint={{
          'fill-color': '#ff1a1a',
          'fill-opacity': 0.85,
        }}
      />
      <Layer
        id="fire-hotspots-box-outline"
        type="line"
        source="fire-hotspots"
        layout={{ visibility: vis }}
        paint={{
          'line-color': 'rgba(255,255,255,0.45)',
          'line-width': 0.8,
        }}
      />
    </Source>
  );
}
