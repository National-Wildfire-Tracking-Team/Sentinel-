/**
 * NHCTropicalWeatherLayer.jsx
 * Renders the full NHC tropical weather picture from the NOAA MapServer
 * (see src/api/nhcTropicalWeather.js), layered bottom to top:
 *   1. Tropical weather outlook — 7-day formation-potential areas + current
 *      disturbance locations (pre-named-storm)
 *   2. Forecast cone of uncertainty
 *   3. Past (observed) track: solid grey line + muted circles
 *   4. Forecast track: dashed line + SSHWS-category-colored circles
 *   5. Coastal watch/warning breakpoints
 *   6. Storm name + category labels at the current position
 * Every source is independent — empty data renders nothing with no error.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

// ─── Tropical weather outlook (disturbances) ─────────────────────────────────
const DIST_FILL_COLOR = ['coalesce', ['get', 'fillColor'], '#FFE566'];
const DIST_STROKE_COLOR = ['coalesce', ['get', 'strokeColor'], '#CCAA00'];
const DIST_AREA_FILL_PAINT   = { 'fill-color': DIST_FILL_COLOR,   'fill-opacity': 0.3 };
const DIST_AREA_STROKE_PAINT = { 'line-color': DIST_STROKE_COLOR, 'line-opacity': 0.8, 'line-width': 1.5, 'line-dasharray': [2, 2] };
const DIST_POINT_PAINT = {
  'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 5, 6, 8],
  'circle-color': DIST_FILL_COLOR,
  'circle-stroke-color': DIST_STROKE_COLOR,
  'circle-stroke-width': 1.5,
  'circle-opacity': 0.9,
};

// ─── Forecast cone ────────────────────────────────────────────────────────────
const CONE_FILL_PAINT = { 'fill-color': '#c0c0c0', 'fill-opacity': 0.2 };
const CONE_LINE_PAINT = { 'line-color': '#999999', 'line-opacity': 0.6, 'line-width': 1.5, 'line-dasharray': [3, 2] };

// ─── Past (observed) track ────────────────────────────────────────────────────
const PAST_TRACK_LINE_PAINT = { 'line-color': '#aaaaaa', 'line-opacity': 0.75, 'line-width': 2 };
const PAST_POINT_PAINT = {
  'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3, 7, 4, 10, 6],
  'circle-color': '#888888',
  'circle-stroke-color': '#444444',
  'circle-stroke-width': 1,
  'circle-opacity': 0.75,
};

// ─── Forecast track ───────────────────────────────────────────────────────────
const FORECAST_TRACK_LINE_PAINT = { 'line-color': '#ffffff', 'line-opacity': 0.6, 'line-width': 1.5, 'line-dasharray': [4, 3] };

const CAT_FILL = ['coalesce', ['get', 'fillColor'], '#5ebaff'];
const CAT_STROKE = ['coalesce', ['get', 'strokeColor'], '#2e8fbf'];
const FORECAST_POINT_PAINT = {
  'circle-radius': [
    'interpolate', ['linear'], ['zoom'],
    2, ['case', ['boolean', ['get', 'isCurrent'], false], 7, 4],
    6, ['case', ['boolean', ['get', 'isCurrent'], false], 11, 6],
    10, ['case', ['boolean', ['get', 'isCurrent'], false], 15, 9],
  ],
  'circle-color': CAT_FILL,
  'circle-stroke-color': CAT_STROKE,
  'circle-stroke-width': ['case', ['boolean', ['get', 'isCurrent'], false], 2.5, 1.5],
  'circle-opacity': 0.95,
};

// ─── Watch / warning breakpoints ──────────────────────────────────────────────
const WW_LINE_PAINT = {
  'line-color': ['coalesce', ['get', 'color'], '#94a3b8'],
  'line-width': 4,
  'line-opacity': 0.85,
};

// ─── Storm name labels ────────────────────────────────────────────────────────
const LABEL_LAYOUT = {
  'text-field':            ['concat', ['get', 'stormName'], '\n', ['get', 'category']],
  'text-font':             ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
  'text-size':             12,
  'text-anchor':           'top',
  'text-offset':           [0, 1.1],
  'text-allow-overlap':    false,
  'text-ignore-placement': false,
};
const LABEL_PAINT = {
  'text-color':      '#ffffff',
  'text-halo-color': '#000000',
  'text-halo-width': 1.5,
};

const NHCTropicalWeatherLayer = memo(function NHCTropicalWeatherLayer({
  forecastPointsGeoJSON,
  forecastTrackGeoJSON,
  coneGeoJSON,
  watchWarningGeoJSON,
  pastPointsGeoJSON,
  pastTrackGeoJSON,
  disturbancePointsGeoJSON,
  disturbanceAreasGeoJSON,
  stormLabelsGeoJSON,
  visible,
}) {
  const vis = visible ? 'visible' : 'none';

  return (
    <>
      {/* 1. Tropical weather outlook — 7-day areas + current disturbance points */}
      <Source id="nhc-disturbance-areas" type="geojson" data={disturbanceAreasGeoJSON || EMPTY_FC}>
        <Layer id="nhc-disturbance-fill"   type="fill" source="nhc-disturbance-areas" layout={{ visibility: vis }} paint={DIST_AREA_FILL_PAINT} />
        <Layer id="nhc-disturbance-stroke" type="line" source="nhc-disturbance-areas" layout={{ visibility: vis }} paint={DIST_AREA_STROKE_PAINT} />
      </Source>
      <Source id="nhc-disturbance-points" type="geojson" data={disturbancePointsGeoJSON || EMPTY_FC}>
        <Layer id="nhc-disturbance-circle" type="circle" source="nhc-disturbance-points" layout={{ visibility: vis }} paint={DIST_POINT_PAINT} />
      </Source>

      {/* 2. Forecast cone of uncertainty */}
      <Source id="nhc-cone" type="geojson" data={coneGeoJSON || EMPTY_FC}>
        <Layer id="nhc-cone-fill" type="fill" source="nhc-cone" layout={{ visibility: vis }} paint={CONE_FILL_PAINT} />
        <Layer id="nhc-cone-line" type="line" source="nhc-cone" layout={{ visibility: vis }} paint={CONE_LINE_PAINT} />
      </Source>

      {/* 3. Past (observed) track */}
      <Source id="nhc-past-track" type="geojson" data={pastTrackGeoJSON || EMPTY_FC}>
        <Layer id="nhc-past-track-line" type="line" source="nhc-past-track" layout={{ visibility: vis }} paint={PAST_TRACK_LINE_PAINT} />
      </Source>
      <Source id="nhc-past-points" type="geojson" data={pastPointsGeoJSON || EMPTY_FC}>
        <Layer id="nhc-obs-circle" type="circle" source="nhc-past-points" layout={{ visibility: vis }} paint={PAST_POINT_PAINT} />
      </Source>

      {/* 4. Forecast track */}
      <Source id="nhc-forecast-track" type="geojson" data={forecastTrackGeoJSON || EMPTY_FC}>
        <Layer id="nhc-forecast-track-line" type="line" source="nhc-forecast-track" layout={{ visibility: vis }} paint={FORECAST_TRACK_LINE_PAINT} />
      </Source>
      <Source id="nhc-forecast-points" type="geojson" data={forecastPointsGeoJSON || EMPTY_FC}>
        <Layer id="nhc-track-circle" type="circle" source="nhc-forecast-points" layout={{ visibility: vis }} paint={FORECAST_POINT_PAINT} />
      </Source>

      {/* 5. Coastal watch / warning breakpoints */}
      <Source id="nhc-watch-warning" type="geojson" data={watchWarningGeoJSON || EMPTY_FC}>
        <Layer id="nhc-watch-warning-line" type="line" source="nhc-watch-warning" layout={{ visibility: vis }} paint={WW_LINE_PAINT} />
      </Source>

      {/* 6. Storm name labels */}
      <Source id="nhc-labels" type="geojson" data={stormLabelsGeoJSON || EMPTY_FC}>
        <Layer id="nhc-storm-labels" type="symbol" source="nhc-labels" layout={{ ...LABEL_LAYOUT, visibility: vis }} paint={LABEL_PAINT} />
      </Source>
    </>
  );
});

export default NHCTropicalWeatherLayer;
