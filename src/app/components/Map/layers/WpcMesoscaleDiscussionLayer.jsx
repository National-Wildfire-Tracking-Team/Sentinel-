/**
 * WpcMesoscaleDiscussionLayer.jsx
 * Renders active WPC Mesoscale Precipitation Discussion (MPD) polygons.
 * Same dashed-outline treatment as the SPC Mesoscale Discussion sublayer
 * (see WeatherAlertsLayer.jsx) so the two "discussion" products read as one
 * family on the map, recolored green to stay visually distinct from SPC's
 * red MDs when both are on at once.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const WpcMesoscaleDiscussionLayer = memo(function WpcMesoscaleDiscussionLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="wpc-mpd" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      <Layer
        id="wpc-mpd-fill"
        type="fill"
        source="wpc-mpd"
        layout={{ visibility: vis }}
        paint={{
          'fill-color': '#00b300',
          'fill-opacity': 0.04,
        }}
      />
      <Layer
        id="wpc-mpd-line-white"
        type="line"
        source="wpc-mpd"
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
      <Layer
        id="wpc-mpd-line-green"
        type="line"
        source="wpc-mpd"
        layout={{
          visibility: vis,
          'line-cap': 'butt',
          'line-join': 'miter',
        }}
        paint={{
          'line-color': '#00b300',
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
      <Layer
        id="wpc-mpd-label"
        type="symbol"
        source="wpc-mpd"
        minzoom={3.5}
        layout={{
          visibility: vis,
          'text-field': [
            'case',
            ['!=', ['get', 'mpdNumber'], null],
            ['concat', 'MPD ', ['to-string', ['get', 'mpdNumber']]],
            'MPD',
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
          'text-halo-color': '#007a00',
          'text-halo-width': 2,
        }}
      />
    </Source>
  );
});
export default WpcMesoscaleDiscussionLayer;
