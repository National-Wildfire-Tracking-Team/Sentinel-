/**
 * NexradSitesLayer.jsx
 * NWS NEXRAD (WSR-88D) Level 2 radar site locations, color-coded by live
 * operability status. Visible at all zoom levels; station ID label at
 * higher zoom.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';
import { NEXRAD_STATUS } from '../../../api/nexradSites';

const EMPTY = { type: 'FeatureCollection', features: [] };
const MIN_ZOOM = 0;

const STATUS_COLOR = [
  'match', ['get', 'status'],
  'offline', NEXRAD_STATUS.offline.color,
  'alarm',   NEXRAD_STATUS.alarm.color,
  'operate', NEXRAD_STATUS.operate.color,
  /* default (unknown) */ NEXRAD_STATUS.unknown.color,
];

const NexradSitesLayer = memo(function NexradSitesLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';
  const data = geoJSON || EMPTY;

  return (
    <Source id="nexrad-sites" type="geojson" data={data}>
      {/* Glow ring */}
      <Layer
        id="nexrad-sites-glow"
        type="circle"
        minzoom={MIN_ZOOM}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 5, 5, 9, 10, 20],
          'circle-color': STATUS_COLOR,
          'circle-opacity': 0.18,
          'circle-blur': 0.7,
          'circle-stroke-width': 0,
        }}
      />

      {/* Main station dot – interactive target */}
      <Layer
        id="nexrad-sites-circle"
        type="circle"
        minzoom={MIN_ZOOM}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 3, 5, 4, 8, 6, 12, 9],
          'circle-color': STATUS_COLOR,
          'circle-opacity': 0.95,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        }}
      />

      {/* Station ID label at higher zoom */}
      <Layer
        id="nexrad-sites-label"
        type="symbol"
        minzoom={6}
        layout={{
          visibility: vis,
          'text-field': ['get', 'id'],
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-size': 10,
          'text-anchor': 'top',
          'text-offset': [0, 0.9],
          'text-allow-overlap': false,
        }}
        paint={{
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.7)',
          'text-halo-width': 1.5,
        }}
      />
    </Source>
  );
});

export default NexradSitesLayer;
