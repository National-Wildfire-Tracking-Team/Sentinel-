/**
 * WUILayer.jsx
 * Renders CAL FIRE Wildland-Urban Interface (2025) cells, colored by WUI
 * class with the same palette CAL FIRE's own service renderer uses.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const WUILayer = memo(function WUILayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="calfire-wui" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      <Layer
        id="calfire-wui-fill"
        type="fill"
        source="calfire-wui"
        layout={{ visibility: vis }}
        paint={{
          'fill-color': [
            'match', ['get', 'WUI_DESC'],
            'Interface', '#c29ed7',
            'Intermix', '#448970',
            'Influence Zone', '#98e600',
            '#9a7885',
          ],
          'fill-opacity': 0.45,
          // The cells are a 30 m grid; antialiasing draws hairline seams between them.
          'fill-antialias': false,
        }}
      />
    </Source>
  );
});

export default WUILayer;
