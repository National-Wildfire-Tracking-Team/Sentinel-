/**
 * WeatherAlertsLayer.jsx
 * Renders NOAA weather alert zones (Red Flag Warnings, Fire Weather Watches)
 * as semi-transparent polygon overlays.
 * Layer stays mounted; visibility is controlled via layout property.
 */

import { Source, Layer } from 'react-map-gl/mapbox';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

export default function WeatherAlertsLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="weather-alerts" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      <Layer
        id="weather-alerts-fill"
        type="fill"
        source="weather-alerts"
        layout={{ visibility: vis }}
        paint={{
          'fill-color': [
            'match', ['get', 'type'],
            'Red Flag Warning', '#ef4444',
            'Fire Weather Watch', '#f59e0b',
            '#3b82f6',
          ],
          'fill-opacity': 0.12,
        }}
      />
      <Layer
        id="weather-alerts-line"
        type="line"
        source="weather-alerts"
        layout={{ visibility: vis }}
        paint={{
          'line-color': [
            'match', ['get', 'type'],
            'Red Flag Warning', '#ef4444',
            'Fire Weather Watch', '#f59e0b',
            '#3b82f6',
          ],
          'line-width': 1.5,
          'line-opacity': 0.7,
          'line-dasharray': [4, 3],
        }}
      />
    </Source>
  );
}
