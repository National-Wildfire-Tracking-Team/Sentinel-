/**
 * WeatherRadarStationsLayer.jsx
 * NOAA NEXRAD and TDWR weather radar station locations.
 *
 * Renders as a cyan/teal radar-dish icon with a subtle glow.
 * NEXRAD stations use a solid teal circle; TDWR stations use a slightly
 * smaller violet circle so the two types are visually distinct.
 *
 * All sub-layers are always visible at any zoom level since radar stations
 * are sparse enough to never crowd the map.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const NEXRAD_COLOR = '#06b6d4'; // cyan-500
const TDWR_COLOR   = '#a78bfa'; // violet-400
const GLOW_COLOR   = '#06b6d4';

const WeatherRadarStationsLayer = memo(function WeatherRadarStationsLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="weather-radar-stations" type="geojson" data={geoJSON || EMPTY_GEOJSON}>

      {/* Soft glow behind each station circle */}
      <Layer
        id="radar-stations-glow"
        type="circle"
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            3, 8,
            6, 12,
            10, 18,
          ],
          'circle-color': GLOW_COLOR,
          'circle-opacity': 0.12,
          'circle-blur': 0.8,
          'circle-stroke-width': 0,
        }}
      />

      {/* Main station circle – color-coded by radar type */}
      <Layer
        id="radar-stations-circle"
        type="circle"
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            3, 4,
            6, 6,
            10, 9,
            14, 13,
          ],
          'circle-color': [
            'match', ['get', 'radarType'],
            'NEXRAD', NEXRAD_COLOR,
            'TDWR',   TDWR_COLOR,
            NEXRAD_COLOR,
          ],
          'circle-opacity': 0.95,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        }}
      />

      {/* Site identifier label (e.g. KABR) – shown at zoom ≥ 6 */}
      <Layer
        id="radar-stations-label"
        type="symbol"
        minzoom={6}
        layout={{
          visibility: vis,
          'text-field': ['get', 'siteId'],
          'text-anchor': 'top',
          'text-offset': [0, 1.2],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            6, 9,
            10, 11,
            14, 13,
          ],
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        }}
        paint={{
          'text-color': '#e0f2fe',
          'text-halo-color': 'rgba(0,0,0,0.85)',
          'text-halo-width': 1.5,
        }}
      />

    </Source>
  );
});

export default WeatherRadarStationsLayer;
