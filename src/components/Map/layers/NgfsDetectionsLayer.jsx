/**
 * NgfsDetectionsLayer.jsx
 * Renders NOAA NESDIS NGFS (GOES satellite) fire detections as circle
 * markers, using each pixel's centroid coordinates.
 * Layer stays mounted; visibility is controlled via layout property.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const NgfsDetectionsLayer = memo(function NgfsDetectionsLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source
      id="ngfs-detections"
      type="geojson"
      data={geoJSON || EMPTY_GEOJSON}
    >
      <Layer
        id="ngfs-detections-circle"
        type="circle"
        source="ngfs-detections"
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            3, 2,
            6, 4,
            10, 6,
            14, 10,
          ],
          'circle-color': '#ffa500',
          'circle-opacity': 0.75,
          'circle-stroke-color': 'rgba(255,255,255,0.45)',
          'circle-stroke-width': 0.8,
        }}
      />
    </Source>
  );
});
export default NgfsDetectionsLayer;
