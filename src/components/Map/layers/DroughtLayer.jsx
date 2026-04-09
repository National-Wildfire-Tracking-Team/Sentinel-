/**
 * DroughtLayer.jsx
 * Renders US Drought Monitor intensity zones.
 * Uses the official USDM color palette.
 * Layer stays mounted; visibility is controlled via layout property.
 */

import { Source, Layer } from 'react-map-gl/mapbox';
import { DROUGHT_COLOR_EXPRESSION } from '../../../utils/colorUtils';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

export default function DroughtLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="drought" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      <Layer
        id="drought-fill"
        type="fill"
        source="drought"
        layout={{ visibility: vis }}
        paint={{
          'fill-color': DROUGHT_COLOR_EXPRESSION,
          'fill-opacity': 0.45,
        }}
      />
      <Layer
        id="drought-line"
        type="line"
        source="drought"
        layout={{ visibility: vis }}
        paint={{
          'line-color': DROUGHT_COLOR_EXPRESSION,
          'line-width': 0.8,
          'line-opacity': 0.6,
        }}
      />
    </Source>
  );
}
