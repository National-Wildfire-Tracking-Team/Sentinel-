/**
 * FireHotspotsLayer.jsx
 * Renders NASA FIRMS fire hotspot detections as FIRMS-like pixel footprints.
 * Uses polygon fills to mimic satellite fire-pixel grid cells.
 * Layer stays mounted; visibility is controlled via layout property.
 */

import { Source, Layer } from 'react-map-gl';
import { FRP_COLOR_EXPRESSION } from '../../../utils/colorUtils';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

export default function FireHotspotsLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source
      id="fire-hotspots"
      type="geojson"
      data={geoJSON || EMPTY_GEOJSON}
    >
      {/* FIRMS-style hotspot footprint fill */}
      <Layer
        id="fire-hotspots-fill"
        type="fill"
        source="fire-hotspots"
        layout={{ visibility: vis }}
        paint={{
          'fill-color': FRP_COLOR_EXPRESSION,
          'fill-opacity': 0.85,
        }}
      />
      <Layer
        id="fire-hotspots-outline"
        type="line"
        source="fire-hotspots"
        layout={{ visibility: vis }}
        paint={{
          'line-color': 'rgba(255,255,255,0.35)',
          'line-width': 0.7,
        }}
      />
    </Source>
  );
}
