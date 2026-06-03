/**
 * NHCTropicalWeatherLayer.jsx
 * Renders NHC active hurricane forecast data:
 *   - Error cone polygon (grey fill)
 *   - Forecast track line connecting positions
 *   - Track position points color-coded by SSHWS category
 *
 * Data from vannizhang/hurricane: Active_Hurricanes_v1 FeatureServer/0 + /4
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

// Cone: subtle grey polygon with dashed outline (standard NHC cone styling)
const CONE_FILL_PAINT = {
  'fill-color': '#c0c0c0',
  'fill-opacity': 0.25,
};

const CONE_LINE_PAINT = {
  'line-color': '#888888',
  'line-opacity': 0.7,
  'line-width': 1.5,
  'line-dasharray': [3, 2],
};

// Track: line through forecast positions
const TRACK_LINE_PAINT = {
  'line-color': '#ffffff',
  'line-opacity': 0.6,
  'line-width': 1.5,
  'line-dasharray': [4, 3],
};

// Track points: circles color-coded by SSHWS category
const CATEGORY_FILL = [
  'match', ['get', 'category'],
  'Tropical Depression', '#5ebaff',
  'Tropical Storm',      '#00faf4',
  'Category 1',          '#ffffcc',
  'Category 2',          '#ffe775',
  'Category 3',          '#ffc140',
  'Category 4',          '#ff8f20',
  'Category 5',          '#ff6060',
  '#5ebaff',
];

const CATEGORY_STROKE = [
  'match', ['get', 'category'],
  'Tropical Depression', '#2e8fbf',
  'Tropical Storm',      '#00b8b3',
  'Category 1',          '#cccc66',
  'Category 2',          '#ccaa00',
  'Category 3',          '#cc8800',
  'Category 4',          '#cc5500',
  'Category 5',          '#cc0000',
  '#2e8fbf',
];

const TRACK_CIRCLE_PAINT = {
  'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 4, 7, 6, 10, 9],
  'circle-color': CATEGORY_FILL,
  'circle-stroke-color': CATEGORY_STROKE,
  'circle-stroke-width': 1.5,
  'circle-opacity': 0.95,
};

// Build a line GeoJSON from point features to draw the forecast track
function buildTrackLine(trackFC) {
  if (!trackFC?.features?.length) return EMPTY_FC;

  // Group by storm name and connect positions in order
  const storms = {};
  for (const f of trackFC.features) {
    const name = f.properties?.stormName || 'unknown';
    if (!storms[name]) storms[name] = [];
    if (f.geometry?.type === 'Point') storms[name].push(f.geometry.coordinates);
  }

  const lineFeatures = Object.entries(storms).map(([name, coords]) => ({
    type: 'Feature',
    properties: { stormName: name },
    geometry: { type: 'LineString', coordinates: coords },
  }));

  return { type: 'FeatureCollection', features: lineFeatures };
}

const NHCTropicalWeatherLayer = memo(function NHCTropicalWeatherLayer({
  trackGeoJSON,
  coneGeoJSON,
  visible,
}) {
  const vis = visible ? 'visible' : 'none';
  const trackLine = buildTrackLine(trackGeoJSON);

  return (
    <>
      {/* Error cone polygon */}
      <Source id="nhc-cone" type="geojson" data={coneGeoJSON || EMPTY_FC}>
        <Layer
          id="nhc-cone-fill"
          type="fill"
          source="nhc-cone"
          layout={{ visibility: vis }}
          paint={CONE_FILL_PAINT}
        />
        <Layer
          id="nhc-cone-line"
          type="line"
          source="nhc-cone"
          layout={{ visibility: vis }}
          paint={CONE_LINE_PAINT}
        />
      </Source>

      {/* Forecast track line */}
      <Source id="nhc-track-line" type="geojson" data={trackLine}>
        <Layer
          id="nhc-track-line-layer"
          type="line"
          source="nhc-track-line"
          layout={{ visibility: vis }}
          paint={TRACK_LINE_PAINT}
        />
      </Source>

      {/* Forecast track position points */}
      <Source id="nhc-track" type="geojson" data={trackGeoJSON || EMPTY_FC}>
        <Layer
          id="nhc-track-circle"
          type="circle"
          source="nhc-track"
          layout={{ visibility: vis }}
          paint={TRACK_CIRCLE_PAINT}
        />
      </Source>
    </>
  );
});

export default NHCTropicalWeatherLayer;
