/**
 * USGS National Map — colleges & universities (structures layer 56), point markers.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const NationalMapCollegesLayer = memo(function NationalMapCollegesLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="national-map-colleges" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      <Layer
        id="national-map-colleges-circle"
        type="circle"
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            5, 2.5,
            9, 4,
            14, 7,
          ],
          'circle-color': '#a78bfa',
          'circle-opacity': 0.9,
          'circle-stroke-width': 1.2,
          'circle-stroke-color': 'rgba(255,255,255,0.85)',
        }}
      />
    </Source>
  );
});

export default NationalMapCollegesLayer;
