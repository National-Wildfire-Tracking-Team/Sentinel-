/**
 * WeatherAlertsLayer.jsx
 * Renders NOAA weather alert zones (Red Flag Warnings, Fire Weather Watches)
 * as semi-transparent polygon overlays.
 * Layer stays mounted; visibility is controlled via layout property.
 */

import { Source, Layer } from 'react-map-gl';
import { ALERT_TYPE_COLORS, WATCH_ALERT_TYPES } from '../../../utils/colorUtils';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };
const DEFAULT_ALERT_COLOR = '#3b82f6';

const alertColorExpression = [
  'match',
  ['get', 'type'],
  ...Object.entries(ALERT_TYPE_COLORS).flat(),
  DEFAULT_ALERT_COLOR,
];

const watchDashExpression = [
  'match',
  ['get', 'type'],
  ...WATCH_ALERT_TYPES.flatMap((type) => [type, ['literal', [4, 3]]]),
  ['literal', [1, 0]],
];

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
          'fill-color': alertColorExpression,
          'fill-opacity': 0.12,
        }}
      />
      <Layer
        id="weather-alerts-line"
        type="line"
        source="weather-alerts"
        layout={{ visibility: vis }}
        paint={{
          'line-color': alertColorExpression,
          'line-width': 1.5,
          'line-opacity': 0.7,
          'line-dasharray': watchDashExpression,
        }}
      />
    </Source>
  );
}
