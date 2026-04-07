/**
 * WeatherAlertsLayer.jsx
 * Renders NOAA weather alert zones (Red Flag Warnings, Fire Weather Watches)
 * as semi-transparent polygon overlays.
 */

import { Source, Layer } from 'react-map-gl/maplibre';

const alertFillLayer = {
  id: 'weather-alerts-fill',
  type: 'fill',
  source: 'weather-alerts',
  paint: {
    'fill-color': [
      'match', ['get', 'type'],
      'Red Flag Warning',   '#ef4444',
      'Fire Weather Watch', '#f59e0b',
      '#3b82f6',
    ],
    'fill-opacity': 0.12,
  },
};

const alertLineLayer = {
  id: 'weather-alerts-line',
  type: 'line',
  source: 'weather-alerts',
  paint: {
    'line-color': [
      'match', ['get', 'type'],
      'Red Flag Warning',   '#ef4444',
      'Fire Weather Watch', '#f59e0b',
      '#3b82f6',
    ],
    'line-width': 1.5,
    'line-opacity': 0.7,
    'line-dasharray': [4, 3],
  },
};

export default function WeatherAlertsLayer({ geoJSON, visible }) {
  if (!visible || !geoJSON) return null;

  return (
    <Source id="weather-alerts" type="geojson" data={geoJSON}>
      <Layer {...alertFillLayer} />
      <Layer {...alertLineLayer} />
    </Source>
  );
}
