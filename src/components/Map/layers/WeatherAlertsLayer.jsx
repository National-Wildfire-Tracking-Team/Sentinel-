/**
 * WeatherAlertsLayer.jsx
 * Renders NOAA weather alert zones as semi-transparent polygon overlays
 * using the official NWS color palette (see utils/nwsColors).
 * Watches are drawn with tighter dashes and a more transparent fill to
 * approximate the hatched boxes used on the official NWS map.
 * Layer stays mounted; visibility is controlled via layout property.
 */

import { Source, Layer } from 'react-map-gl';
import { nwsColorMatchExpression } from '../../../utils/nwsColors';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };
const COLOR_EXPR = nwsColorMatchExpression();

// Feature is considered a "watch" if the alert type string contains "Watch".
const IS_WATCH = ['in', 'Watch', ['get', 'type']];
const IS_NOT_WATCH = ['!', IS_WATCH];

export default function WeatherAlertsLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="weather-alerts" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      {/* Polygon fill — lighter for Watches to hint at a hatched overlay */}
      <Layer
        id="weather-alerts-fill"
        type="fill"
        source="weather-alerts"
        layout={{ visibility: vis }}
        paint={{
          'fill-color': COLOR_EXPR,
          'fill-opacity': ['case', IS_WATCH, 0.08, 0.18],
        }}
      />

      {/* Warning / advisory / statement outline — loose dashes */}
      <Layer
        id="weather-alerts-line"
        type="line"
        source="weather-alerts"
        filter={IS_NOT_WATCH}
        layout={{ visibility: vis }}
        paint={{
          'line-color': COLOR_EXPR,
          'line-width': 1.5,
          'line-opacity': 0.85,
          'line-dasharray': [4, 3],
        }}
      />

      {/* Watch outline — tighter dashes, mimicking hatching */}
      <Layer
        id="weather-alerts-line-watch"
        type="line"
        source="weather-alerts"
        filter={IS_WATCH}
        layout={{ visibility: vis }}
        paint={{
          'line-color': COLOR_EXPR,
          'line-width': 1.2,
          'line-opacity': 0.85,
          'line-dasharray': [2, 2],
        }}
      />
    </Source>
  );
}
