/**
 * WpcQpfLayer.jsx
 * Renders the WPC 24-hour QPF isopleth polygons (Day 1-3) using the
 * standard NWS/GEMPAK QPF color table (see QPF_RAMP_STOPS in wpcQpf.js).
 * Continuous ['interpolate'] on the numeric `qpf` field rather than a fixed
 * category palette, since the source data is a nested contour band, not a
 * discrete class.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';
import { QPF_RAMP_STOPS } from '../../../api/wpcQpf';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const FILL_COLOR = [
  'interpolate', ['linear'], ['coalesce', ['get', 'qpf'], 0],
  ...QPF_RAMP_STOPS.flat(),
];

const LINE_WIDTH = ['interpolate', ['linear'], ['zoom'], 3, 0.5, 7, 1, 10, 1.4];

const WpcQpfLayer = memo(function WpcQpfLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="wpc-qpf" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      <Layer
        id="wpc-qpf-fill"
        type="fill"
        source="wpc-qpf"
        layout={{ visibility: vis }}
        paint={{ 'fill-color': FILL_COLOR, 'fill-opacity': 0.55 }}
      />
      <Layer
        id="wpc-qpf-line"
        type="line"
        source="wpc-qpf"
        layout={{ visibility: vis }}
        paint={{ 'line-color': FILL_COLOR, 'line-opacity': 0.5, 'line-width': LINE_WIDTH }}
      />
    </Source>
  );
});

export default WpcQpfLayer;
