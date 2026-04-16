/**
 * FireHotspotsLayer.jsx
 * Renders NASA FIRMS CSV hotspot detections as circle markers using
 * the lat/lng coordinates directly from the CSV data.
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
        id="fire-hotspots-circle"
        type="circle"
        source="fire-hotspots"
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            3, 2,
            6, 4,
            10, 7,
            14, 12,
          ],
          'circle-color': '#ff1a1a',
          'circle-opacity': 0.85,
          'circle-stroke-color': 'rgba(255,255,255,0.45)',
          'circle-stroke-width': 0.8,
        }}
      />
    </Source>
  );
}
