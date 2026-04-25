/**
 * FireWeatherOutlookLayer.jsx
 * Renders SPC Fire Weather Outlook polygons (Day 1-8).
 *
 * Outlook types:
 *   - winds_low_humidity: ELEVATED (yellow) / CRITICAL (red) / EXTREME (magenta)
 *   - dry_thunderstorm:   ELEVATED (light blue) / CRITICAL (dark blue)
 *
 * Colors come from NOAA-supplied fill/stroke properties when present,
 * with risk-category-based fallbacks.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

// Fallback fill colors for Wind & RH outlook
const WINDS_FILL_FALLBACK = [
  'match', ['get', 'riskCategory'],
  'ELEVATED', '#FFE066',
  'CRITICAL', '#FF6666',
  'EXTREME',  '#FF00FF',
  '#FFE066',
];

const WINDS_STROKE_FALLBACK = [
  'match', ['get', 'riskCategory'],
  'ELEVATED', '#DDAA00',
  'CRITICAL', '#CC0000',
  'EXTREME',  '#990099',
  '#DDAA00',
];

// Fallback fill colors for Dry Thunderstorm outlook
const DRY_LTNG_FILL_FALLBACK = [
  'match', ['get', 'riskCategory'],
  'ELEVATED', '#8BD8F5',
  'CRITICAL', '#3C6FCD',
  'EXTREME',  '#1A1A8C',
  '#8BD8F5',
];

const DRY_LTNG_STROKE_FALLBACK = [
  'match', ['get', 'riskCategory'],
  'ELEVATED', '#2E86AB',
  'CRITICAL', '#1A3A8C',
  'EXTREME',  '#00008B',
  '#2E86AB',
];

// Use NOAA-supplied color when present, else fall back to risk-based colors
function buildFillColor(fallback) {
  return [
    'case',
    ['!=', ['get', 'fillColor'], null],
    ['get', 'fillColor'],
    fallback,
  ];
}

function buildStrokeColor(fallback) {
  return [
    'case',
    ['!=', ['get', 'strokeColor'], null],
    ['get', 'strokeColor'],
    fallback,
  ];
}

const DAY_FILL_OPACITY = [
  'match', ['get', 'day'],
  'day1', 0.55,
  'day2', 0.45,
  'day3', 0.38,
  'day4', 0.32,
  'day5', 0.27,
  'day6', 0.22,
  'day7', 0.18,
  'day8', 0.15,
  0.35,
];

const LINE_WIDTH = [
  'interpolate', ['linear'], ['zoom'],
  3, 1,
  7, 1.6,
  10, 2,
];

const FireWeatherOutlookLayer = memo(function FireWeatherOutlookLayer({
  geoJSON,
  visible,
  outlookType = 'winds_low_humidity',
}) {
  const vis = visible ? 'visible' : 'none';

  const isDryLightning = outlookType === 'dry_thunderstorm';
  const fillColor   = isDryLightning
    ? buildFillColor(DRY_LTNG_FILL_FALLBACK)
    : buildFillColor(WINDS_FILL_FALLBACK);
  const strokeColor = isDryLightning
    ? buildStrokeColor(DRY_LTNG_STROKE_FALLBACK)
    : buildStrokeColor(WINDS_STROKE_FALLBACK);

  return (
    <Source id="fire-weather-outlooks" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      <Layer
        id="fire-weather-outlook-fill"
        type="fill"
        source="fire-weather-outlooks"
        layout={{ visibility: vis }}
        paint={{
          'fill-color': fillColor,
          'fill-opacity': DAY_FILL_OPACITY,
        }}
      />

      <Layer
        id="fire-weather-outlook-line"
        type="line"
        source="fire-weather-outlooks"
        layout={{ visibility: vis }}
        paint={{
          'line-color': strokeColor,
          'line-opacity': 0.9,
          'line-width': LINE_WIDTH,
        }}
      />
    </Source>
  );
});

export default FireWeatherOutlookLayer;
