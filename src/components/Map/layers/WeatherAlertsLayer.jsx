/**
 * WeatherAlertsLayer.jsx
 * Renders NOAA/NWS alert zones as semi-transparent polygon overlays
 * using the official NWS color palette (see utils/nwsColors).
 * Watches use a more transparent fill to distinguish them from warnings.
 * Layer stays mounted; visibility is controlled via layout property.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';
import { nwsColorMatchExpression } from '../../../utils/nwsColors';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };
const COLOR_EXPR = nwsColorMatchExpression();

// Feature is considered a "watch" if the alert type string contains "Watch".
const IS_WATCH = ['in', 'Watch', ['get', 'type']];
const IS_NOT_WATCH = ['!', IS_WATCH];

const WeatherAlertsLayer = memo(function WeatherAlertsLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="weather-alerts" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      {/* Polygon fill — Watches are lighter than Warnings */}
      <Layer
        id="weather-alerts-fill"
        type="fill"
        source="weather-alerts"
        layout={{ visibility: vis }}
        paint={{
          'fill-color': COLOR_EXPR,
          'fill-opacity': ['case', IS_WATCH, 0.2, 0.35],
        }}
      />

      {/* Solid outline for Warning-type alert polygons */}
      <Layer
        id="weather-alerts-line"
        type="line"
        source="weather-alerts"
        filter={IS_NOT_WATCH}
        layout={{ visibility: vis }}
        paint={{
          'line-color': COLOR_EXPR,
          'line-width': 2,
          'line-opacity': 0.9,
        }}
      />

      {/* Watch outline — slightly thinner to differentiate from warnings */}
      <Layer
        id="weather-alerts-line-watch"
        type="line"
        source="weather-alerts"
        filter={IS_WATCH}
        layout={{ visibility: vis }}
        paint={{
          'line-color': COLOR_EXPR,
          'line-width': 1.5,
          'line-opacity': 0.9,
        }}
      />
    </Source>
  );
});
export default WeatherAlertsLayer;
