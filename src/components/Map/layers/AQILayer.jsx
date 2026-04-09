/**
 * AQILayer.jsx
 * Renders AQI monitoring stations as colored circles.
 * Color follows the EPA AQI standard scale.
 * Layer stays mounted; visibility is controlled via layout property.
 */

import { Source, Layer } from 'react-map-gl/mapbox';
import {
  AQI_COLOR_EXPRESSION,
  AQI_HEATMAP_COLOR_EXPRESSION,
  AQI_RADIUS_EXPRESSION,
} from '../../../utils/colorUtils';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

export default function AQILayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="aqi-stations" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      <Layer
        id="aqi-heatmap"
        type="heatmap"
        source="aqi-stations"
        maxzoom={8}
        layout={{ visibility: vis }}
        paint={{
          'heatmap-weight': [
            'interpolate', ['linear'], ['get', 'aqi'],
            0, 0,
            50, 0.2,
            100, 0.45,
            150, 0.65,
            200, 0.85,
            300, 1,
          ],
          'heatmap-intensity': [
            'interpolate', ['linear'], ['zoom'],
            0, 0.5,
            8, 1.2,
          ],
          'heatmap-radius': [
            'interpolate', ['linear'], ['zoom'],
            0, 8,
            6, 18,
            8, 28,
          ],
          'heatmap-color': AQI_HEATMAP_COLOR_EXPRESSION,
          'heatmap-opacity': 0.7,
        }}
      />

      <Layer
        id="aqi-stations-circle"
        type="circle"
        source="aqi-stations"
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': AQI_RADIUS_EXPRESSION,
          'circle-color': AQI_COLOR_EXPRESSION,
          'circle-opacity': 0.85,
          'circle-stroke-color': 'rgba(0,0,0,0.5)',
          'circle-stroke-width': 1.5,
        }}
      />
      <Layer
        id="aqi-stations-label"
        type="symbol"
        source="aqi-stations"
        minzoom={6}
        layout={{
          visibility: vis,
          'text-field': ['to-string', ['get', 'aqi']],
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-size': 10,
          'text-anchor': 'center',
        }}
        paint={{
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.6)',
          'text-halo-width': 1,
        }}
      />
    </Source>
  );
}
