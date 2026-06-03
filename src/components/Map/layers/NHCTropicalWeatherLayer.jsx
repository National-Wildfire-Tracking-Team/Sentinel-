/**
 * NHCTropicalWeatherLayer.jsx
 * Renders NHC active hurricane data with four visual sub-layers:
 *   1. Forecast error cone (grey polygon)
 *   2. Observed (past) track line + muted points
 *   3. Forecast track line + SSHWS category-colored circles
 *   4. Storm name labels at the current position
 *
 * Data: Active_Hurricanes_v1 FeatureServer (vannizhang/hurricane pattern)
 */

import { memo, useMemo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

// ─── Error cone ───────────────────────────────────────────────────────────────
const CONE_FILL_PAINT = {
  'fill-color': '#c0c0c0',
  'fill-opacity': 0.2,
};
const CONE_LINE_PAINT = {
  'line-color': '#999999',
  'line-opacity': 0.6,
  'line-width': 1.5,
  'line-dasharray': [3, 2],
};

// ─── Observed (past) track ────────────────────────────────────────────────────
const OBS_LINE_PAINT = {
  'line-color': '#aaaaaa',
  'line-opacity': 0.7,
  'line-width': 2,
};
const OBS_CIRCLE_PAINT = {
  'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3, 7, 4, 10, 6],
  'circle-color': '#888888',
  'circle-stroke-color': '#555555',
  'circle-stroke-width': 1,
  'circle-opacity': 0.7,
};

// ─── Forecast track ───────────────────────────────────────────────────────────
const FORECAST_LINE_PAINT = {
  'line-color': '#ffffff',
  'line-opacity': 0.55,
  'line-width': 1.5,
  'line-dasharray': [4, 3],
};

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
const FORECAST_CIRCLE_PAINT = {
  'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 4, 7, 6, 10, 9],
  'circle-color': CATEGORY_FILL,
  'circle-stroke-color': CATEGORY_STROKE,
  'circle-stroke-width': 1.5,
  'circle-opacity': 0.95,
};

// ─── Storm name labels ────────────────────────────────────────────────────────
const LABEL_LAYOUT = {
  'text-field': ['concat', ['get', 'stormName'], '\n', ['get', 'category']],
  'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
  'text-size': 12,
  'text-anchor': 'top',
  'text-offset': [0, 0.8],
  'text-allow-overlap': false,
  'text-ignore-placement': false,
};
const LABEL_PAINT = {
  'text-color': '#ffffff',
  'text-halo-color': '#000000',
  'text-halo-width': 1.5,
};

// Build a LineString GeoJSON connecting points for each storm
function buildLine(fc) {
  if (!fc?.features?.length) return EMPTY_FC;
  const storms = {};
  for (const f of fc.features) {
    const name = f.properties?.stormName || 'unknown';
    if (f.geometry?.type === 'Point') {
      if (!storms[name]) storms[name] = [];
      storms[name].push(f.geometry.coordinates);
    }
  }
  return {
    type: 'FeatureCollection',
    features: Object.entries(storms)
      .filter(([, coords]) => coords.length > 1)
      .map(([name, coords]) => ({
        type: 'Feature',
        properties: { stormName: name },
        geometry: { type: 'LineString', coordinates: coords },
      })),
  };
}

const NHCTropicalWeatherLayer = memo(function NHCTropicalWeatherLayer({
  trackGeoJSON,
  observedTrackGeoJSON,
  coneGeoJSON,
  stormLabelsGeoJSON,
  visible,
}) {
  const vis = visible ? 'visible' : 'none';

  const forecastLine  = useMemo(() => buildLine(trackGeoJSON),         [trackGeoJSON]);
  const observedLine  = useMemo(() => buildLine(observedTrackGeoJSON), [observedTrackGeoJSON]);

  return (
    <>
      {/* 1. Error cone */}
      <Source id="nhc-cone" type="geojson" data={coneGeoJSON || EMPTY_FC}>
        <Layer id="nhc-cone-fill" type="fill"   source="nhc-cone" layout={{ visibility: vis }} paint={CONE_FILL_PAINT} />
        <Layer id="nhc-cone-line" type="line"   source="nhc-cone" layout={{ visibility: vis }} paint={CONE_LINE_PAINT} />
      </Source>

      {/* 2. Observed (past) track */}
      <Source id="nhc-obs-line" type="geojson" data={observedLine}>
        <Layer id="nhc-obs-track-line" type="line" source="nhc-obs-line" layout={{ visibility: vis }} paint={OBS_LINE_PAINT} />
      </Source>
      <Source id="nhc-obs" type="geojson" data={observedTrackGeoJSON || EMPTY_FC}>
        <Layer id="nhc-obs-circle" type="circle" source="nhc-obs" layout={{ visibility: vis }} paint={OBS_CIRCLE_PAINT} />
      </Source>

      {/* 3. Forecast track */}
      <Source id="nhc-forecast-line" type="geojson" data={forecastLine}>
        <Layer id="nhc-forecast-track-line" type="line" source="nhc-forecast-line" layout={{ visibility: vis }} paint={FORECAST_LINE_PAINT} />
      </Source>
      <Source id="nhc-track" type="geojson" data={trackGeoJSON || EMPTY_FC}>
        <Layer id="nhc-track-circle" type="circle" source="nhc-track" layout={{ visibility: vis }} paint={FORECAST_CIRCLE_PAINT} />
      </Source>

      {/* 4. Storm name labels */}
      <Source id="nhc-labels" type="geojson" data={stormLabelsGeoJSON || EMPTY_FC}>
        <Layer
          id="nhc-storm-labels"
          type="symbol"
          source="nhc-labels"
          layout={{ ...LABEL_LAYOUT, visibility: vis }}
          paint={LABEL_PAINT}
        />
      </Source>
    </>
  );
});

export default NHCTropicalWeatherLayer;
