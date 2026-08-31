/**
 * AirNowMonitorsLayer.jsx
 * Renders individual AirNow air quality monitor stations as color-coded circles.
 * Color follows the EPA AQI standard scale (green → maroon).
 * Shows AQI value label on zoom-in; tooltip detail on hover (via MapView).
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

/**
 * EPA AQI color ramp by breakpoint:
 *   0-50   Good            #00e400
 *   51-100 Moderate        #ffff00
 *  101-150 Unhealthy (SG)  #ff7e00
 *  151-200 Unhealthy       #ff0000
 *  201-300 Very Unhealthy  #8f3f97
 *  301+   Hazardous        #7e0023
 */
const AQI_COLOR_STOPS = [
  'step',
  ['coalesce', ['get', 'aqi'], 0],
  '#00e400',   // default / 0-50 Good
  51,  '#ffff00',
  101, '#ff7e00',
  151, '#ff0000',
  201, '#8f3f97',
  301, '#7e0023',
];

const AirNowMonitorsLayer = memo(function AirNowMonitorsLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="airnow-monitors" type="geojson" data={geoJSON || EMPTY_GEOJSON}>

      {/* Soft glow ring – intensity scales with AQI severity */}
      <Layer
        id="airnow-monitors-glow"
        type="circle"
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            4, 6,
            8, 10,
            12, 18,
          ],
          'circle-color': AQI_COLOR_STOPS,
          'circle-opacity': [
            'interpolate', ['linear'],
            ['coalesce', ['get', 'aqi'], 0],
            0, 0.08,
            100, 0.15,
            200, 0.25,
            300, 0.35,
          ],
          'circle-blur': 0.7,
          'circle-stroke-width': 0,
        }}
      />

      {/* Main station dot */}
      <Layer
        id="airnow-monitors-circle"
        type="circle"
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            4, 3,
            8, 5,
            12, 8,
            15, 11,
          ],
          'circle-color': AQI_COLOR_STOPS,
          'circle-opacity': 0.92,
          'circle-stroke-color': 'rgba(255,255,255,0.75)',
          'circle-stroke-width': 1.5,
        }}
      />

      {/* AQI value label – appears when zoomed in */}
      <Layer
        id="airnow-monitors-label"
        type="symbol"
        minzoom={7}
        layout={{
          visibility: vis,
          'text-field': [
            'case',
            ['==', ['get', 'aqiLabel'], 'ND'], '',
            ['get', 'aqiLabel'],
          ],
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            7, 9,
            12, 12,
          ],
          'text-anchor': 'center',
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        }}
        paint={{
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.8)',
          'text-halo-width': 1.5,
        }}
      />

      {/* Site name label below the dot – only at high zoom */}
      <Layer
        id="airnow-monitors-name"
        type="symbol"
        minzoom={10}
        layout={{
          visibility: vis,
          'text-field': ['get', 'siteName'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': 10,
          'text-anchor': 'top',
          'text-offset': [0, 1.2],
          'text-allow-overlap': false,
        }}
        paint={{
          'text-color': '#e2e8f0',
          'text-halo-color': 'rgba(0,0,0,0.85)',
          'text-halo-width': 1.5,
        }}
      />

    </Source>
  );
});

export default AirNowMonitorsLayer;
