/**
 * NgfsDetectionsLayer.jsx
 * Renders NOAA NESDIS NGFS (GOES satellite) fire detections using each
 * detection's native satellite pixel footprint — an outlined quadrilateral,
 * as delivered by NOAA — rather than a synthetic circle marker.
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
      {/* Near-invisible fill purely as a click/hover hit target */}
      <Layer
        id="ngfs-detections-fill"
        type="fill"
        source="ngfs-detections"
        layout={{ visibility: vis }}
        paint={{
          'fill-color': '#ff8c00',
          'fill-opacity': 0.06,
        }}
      />
      <Layer
        id="ngfs-detections-line"
        type="line"
        source="ngfs-detections"
        layout={{ visibility: vis }}
        paint={{
          'line-color': '#ff8c00',
          'line-width': 2,
          'line-opacity': 0.95,
        }}
      />
    </Source>
  );
});
export default NgfsDetectionsLayer;
