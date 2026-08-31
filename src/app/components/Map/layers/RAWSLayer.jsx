/**
 * RAWSLayer.jsx
 * RAWS weather stations rendered as a purple circle with a wind direction
 * arrow and speed / humidity labels – matches the compact station badge design.
 *
 * All sub-layers use minzoom 9 so they appear at county/regional scale,
 * which is useful for monitoring wind patterns around a fire complex.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };
const MIN_ZOOM = 9;

const RAWSLayer = memo(function RAWSLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="raws-stations" type="geojson" data={geoJSON || EMPTY_GEOJSON}>

      {/* Soft purple glow behind the circle */}
      <Layer
        id="raws-glow"
        type="circle"
        minzoom={MIN_ZOOM}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            9, 6,
            12, 14,
            15, 22,
          ],
          'circle-color': '#a855f7',
          'circle-opacity': 0.18,
          'circle-blur': 0.6,
          'circle-stroke-width': 0,
        }}
      />

      {/* Main purple station circle – interactive target */}
      <Layer
        id="raws-stations-circle"
        type="circle"
        minzoom={MIN_ZOOM}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            9, 3,
            12, 8,
            14, 12,
            17, 16,
          ],
          'circle-color': '#a855f7',
          'circle-opacity': 0.95,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        }}
      />

      {/* Wind direction arrow – rotated ↑ centered on the circle */}
      <Layer
        id="raws-wind-arrow"
        type="symbol"
        minzoom={MIN_ZOOM}
        layout={{
          visibility: vis,
          'text-field': '↑',
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            9, 7,
            12, 11,
            14, 15,
          ],
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-rotate': ['coalesce', ['get', 'windDir'], 0],
          'text-rotation-alignment': 'map',
          'text-anchor': 'center',
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        }}
        paint={{
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0)',
          'text-halo-width': 0,
        }}
      />

      {/* Speed + humidity label below the circle */}
      <Layer
        id="raws-label"
        type="symbol"
        minzoom={MIN_ZOOM}
        layout={{
          visibility: vis,
          'text-field': [
            'format',
            ['concat',
              ['to-string', ['round', ['coalesce', ['get', 'windSpeed'], 0]]],
              ' mph',
            ],
            { 'font-scale': 0.85 },
            '\n',
            {},
            ['concat',
              ['to-string', ['round', ['coalesce', ['get', 'relHumidity'], 0]]],
              '% RH',
            ],
            { 'font-scale': 0.75 },
          ],
          'text-anchor': 'top',
          'text-offset': [0, 1.5],
          'text-size': 11,
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        }}
        paint={{
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.85)',
          'text-halo-width': 1.5,
        }}
      />

    </Source>
  );
});
export default RAWSLayer;
