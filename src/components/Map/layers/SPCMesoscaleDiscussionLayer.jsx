/**
 * SPCMesoscaleDiscussionLayer.jsx
 * Renders active SPC Mesoscale Discussions (MDs) as the classic
 * red-dash / white-gap outlined polygon with no fill, matching the
 * official SPC map style.
 *
 * Also renders a label showing the MD number (e.g. "MD 519") at the
 * polygon centroid, visible at zoom ≥ 4.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const SPCMesoscaleDiscussionLayer = memo(function SPCMesoscaleDiscussionLayer({
  geoJSON,
  visible,
}) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source
      id="spc-md"
      type="geojson"
      data={geoJSON || EMPTY_GEOJSON}
      // Generate a label point at the centroid of each polygon
      generateId
    >
      {/* Transparent fill – needed so the polygon is hit-testable for hover/click */}
      <Layer
        id="spc-md-fill"
        type="fill"
        source="spc-md"
        layout={{ visibility: vis }}
        paint={{
          'fill-color': '#ff0000',
          'fill-opacity': 0.04,
        }}
      />

      {/* White backing line – drawn first so the red dash sits on top */}
      <Layer
        id="spc-md-line-white"
        type="line"
        source="spc-md"
        layout={{ visibility: vis }}
        paint={{
          'line-color': '#ffffff',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            3, 2.5,
            7, 3.5,
            10, 4.5,
          ],
          'line-opacity': 0.95,
        }}
      />

      {/* Red dashed line on top */}
      <Layer
        id="spc-md-line-red"
        type="line"
        source="spc-md"
        layout={{
          visibility: vis,
          'line-cap': 'butt',
          'line-join': 'miter',
        }}
        paint={{
          'line-color': '#e3000f',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            3, 2,
            7, 3,
            10, 4,
          ],
          'line-dasharray': [4, 3],
          'line-opacity': 1,
        }}
      />

      {/* MD number label */}
      <Layer
        id="spc-md-label"
        type="symbol"
        source="spc-md"
        minzoom={3.5}
        layout={{
          visibility: vis,
          'text-field': [
            'case',
            ['!=', ['get', 'mdNumber'], null],
            ['concat', 'MD ', ['to-string', ['get', 'mdNumber']]],
            ['get', 'name'],
          ],
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            4, 11,
            7, 13,
            10, 15,
          ],
          'text-anchor': 'center',
          'text-allow-overlap': false,
          'text-ignore-placement': false,
          'symbol-placement': 'point',
        }}
        paint={{
          'text-color': '#ffffff',
          'text-halo-color': '#cc0000',
          'text-halo-width': 2,
        }}
      />
    </Source>
  );
});
export default SPCMesoscaleDiscussionLayer;
