/**
 * AQILayer.jsx
 * Renders AQI monitoring stations as colored circles.
 * Color follows the EPA AQI standard scale.
 */

import { Source, Layer } from 'react-map-gl/maplibre';
import { AQI_COLOR_EXPRESSION, AQI_RADIUS_EXPRESSION } from '../../../utils/colorUtils';

const aqiCircleLayer = {
  id: 'aqi-stations-circle',
  type: 'circle',
  source: 'aqi-stations',
  paint: {
    'circle-radius': AQI_RADIUS_EXPRESSION,
    'circle-color':  AQI_COLOR_EXPRESSION,
    'circle-opacity': 0.85,
    'circle-stroke-color': 'rgba(0,0,0,0.5)',
    'circle-stroke-width': 1.5,
  },
};

const aqiLabelLayer = {
  id: 'aqi-stations-label',
  type: 'symbol',
  source: 'aqi-stations',
  minzoom: 6,
  layout: {
    'text-field': ['to-string', ['get', 'aqi']],
    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
    'text-size': 10,
    'text-anchor': 'center',
  },
  paint: {
    'text-color': '#ffffff',
    'text-halo-color': 'rgba(0,0,0,0.6)',
    'text-halo-width': 1,
  },
};

export default function AQILayer({ geoJSON, visible }) {
  if (!visible || !geoJSON) return null;

  return (
    <Source id="aqi-stations" type="geojson" data={geoJSON}>
      <Layer {...aqiCircleLayer} />
      <Layer {...aqiLabelLayer} />
    </Source>
  );
}
