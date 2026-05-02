/**
 * AQILayer.jsx
 * Renders AQI data as an Apple Weather–style continuous heatmap gradient.
 * At low zoom the map shows a smooth, painted wash that interpolates
 * between station readings. As the user zooms in, individual station
 * dots and numeric labels fade in on top of the gradient.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';
import {
  AQI_COLOR_EXPRESSION,
  AQI_HEATMAP_COLOR_EXPRESSION,
} from '../../../utils/colorUtils';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const AQILayer = memo(function AQILayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="aqi-stations" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      {/* ── Continuous gradient wash (Apple Weather style) ──
          Very large radii produce overlapping kernels that blend
          neighbouring station values into a smooth painted surface. */}
      <Layer
        id="aqi-heatmap"
        type="heatmap"
        source="aqi-stations"
        maxzoom={10}
        layout={{ visibility: vis }}
        paint={{
          'heatmap-weight': [
            'interpolate', ['linear'], ['get', 'aqi'],
            0,   0,
            25,  0.15,
            50,  0.30,
            75,  0.45,
            100, 0.55,
            150, 0.70,
            200, 0.85,
            300, 1,
          ],
          'heatmap-intensity': [
            'interpolate', ['linear'], ['zoom'],
            0,  0.6,
            4,  0.8,
            6,  1.0,
            8,  1.2,
            10, 1.4,
          ],
          'heatmap-radius': [
            'interpolate', ['exponential', 1.8], ['zoom'],
            0,  18,
            3,  40,
            5,  70,
            7,  100,
            9,  140,
            10, 160,
          ],
          'heatmap-color': AQI_HEATMAP_COLOR_EXPRESSION,
          'heatmap-opacity': [
            'interpolate', ['linear'], ['zoom'],
            0,  0.75,
            7,  0.65,
            9,  0.45,
            10, 0,
          ],
        }}
      />

      {/* ── Station dots — fade in as the heatmap fades out ── */}
      <Layer
        id="aqi-stations-circle"
        type="circle"
        source="aqi-stations"
        minzoom={7}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            7,  4,
            10, 7,
            13, 10,
            16, 14,
          ],
          'circle-color': AQI_COLOR_EXPRESSION,
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            7,  0,
            8,  0.4,
            10, 0.85,
          ],
          'circle-stroke-color': 'rgba(0,0,0,0.45)',
          'circle-stroke-width': 1.2,
        }}
      />

      {/* ── Numeric AQI label ── */}
      <Layer
        id="aqi-stations-label"
        type="symbol"
        source="aqi-stations"
        minzoom={9}
        layout={{
          visibility: vis,
          'text-field': ['to-string', ['get', 'aqi']],
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            9,  9,
            13, 12,
          ],
          'text-anchor': 'center',
          'text-allow-overlap': false,
          'text-ignore-placement': false,
        }}
        paint={{
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.7)',
          'text-halo-width': 1.2,
          'text-opacity': [
            'interpolate', ['linear'], ['zoom'],
            9,  0,
            10, 1,
          ],
        }}
      />
    </Source>
  );
});
export default AQILayer;
