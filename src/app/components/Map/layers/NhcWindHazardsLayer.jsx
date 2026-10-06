/**
 * NhcWindHazardsLayer.jsx
 * Opt-in NHC hazard layers drawn beneath the storm track and cone
 * (see useNhcWindHazards), bottom to top:
 *   1. Potential storm surge flooding — NOAA raster, only for storms NHC has
 *      run it for (U.S. landfall threats)
 *   2. Wind-speed probabilities — chance of 34/50/64-kt winds over 5 days,
 *      in NHC's own 10% bands
 *   3. Wind radii — current extent of 34/50/64-kt winds filled, forecast
 *      extents as dashed outlines
 *   4. Most likely arrival time of tropical-storm-force winds — labeled lines
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';
import { nhcSurgeTileUrl, WIND_PROB_BANDS, WIND_RADII_COLORS } from '../../../api/nhcTropicalWeather';

const EMPTY_FC = { type: 'FeatureCollection', features: [] };
const NHC_ATTRIBUTION = 'NOAA National Hurricane Center';

const PROB_COLOR = [
  'match', ['get', 'percentage'],
  ...WIND_PROB_BANDS.filter((b) => b.color).flatMap((b) => [b.value, b.color]),
  'rgba(0,0,0,0)',
];
const PROB_FILL_PAINT = { 'fill-color': PROB_COLOR, 'fill-opacity': 0.45, 'fill-antialias': false };

const RADII_COLOR = [
  'match', ['get', 'radiiKt'],
  64, WIND_RADII_COLORS[64],
  50, WIND_RADII_COLORS[50],
  WIND_RADII_COLORS[34],
];
const CURRENT_RADII = ['==', ['get', 'tau'], 0];
const FORECAST_RADII = ['>', ['get', 'tau'], 0];
// Larger radii first so 64-kt winds sit on top of 34-kt.
const RADII_SORT = ['-', 100, ['get', 'radiiKt']];
const RADII_FILL_PAINT = { 'fill-color': RADII_COLOR, 'fill-opacity': 0.28 };
const RADII_LINE_PAINT = { 'line-color': RADII_COLOR, 'line-width': 2, 'line-opacity': 0.95 };
const RADII_FORECAST_PAINT = {
  'line-color': RADII_COLOR, 'line-width': 1, 'line-opacity': 0.55, 'line-dasharray': [2, 2],
};

const ARRIVAL_CASING_PAINT = { 'line-color': '#000000', 'line-width': 3.5, 'line-opacity': 0.5, 'line-blur': 1 };
const ARRIVAL_LINE_PAINT = { 'line-color': '#ffffff', 'line-width': 1.5, 'line-opacity': 0.9 };
const ARRIVAL_LABEL_LAYOUT = {
  'symbol-placement': 'line',
  'text-field': ['get', 'arrivalTime'],
  'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
  'text-size': 11,
  'symbol-spacing': 300,
};
const ARRIVAL_LABEL_PAINT = { 'text-color': '#ffffff', 'text-halo-color': '#000000', 'text-halo-width': 1.5 };

const NhcWindHazardsLayer = memo(function NhcWindHazardsLayer({ data, show = {}, visible }) {
  const vis = (on) => (visible && on ? 'visible' : 'none');
  const surgeTiles = show.surge ? nhcSurgeTileUrl(data?.surgeImageLayerIds) : null;

  return (
    <>
      {surgeTiles && visible && (
        <Source
          key={surgeTiles}
          id="nhc-surge"
          type="raster"
          tiles={[surgeTiles]}
          tileSize={256}
          attribution={NHC_ATTRIBUTION}
        >
          <Layer id="nhc-surge-raster" type="raster" source="nhc-surge" paint={{ 'raster-opacity': 0.8 }} />
        </Source>
      )}

      <Source id="nhc-wind-prob" type="geojson" data={data?.windProbGeoJSON || EMPTY_FC} attribution={NHC_ATTRIBUTION}>
        <Layer id="nhc-wind-prob-fill" type="fill" source="nhc-wind-prob" layout={{ visibility: vis(show.prob) }} paint={PROB_FILL_PAINT} />
      </Source>

      <Source id="nhc-wind-radii" type="geojson" data={data?.windRadiiGeoJSON || EMPTY_FC} attribution={NHC_ATTRIBUTION}>
        <Layer id="nhc-wind-radii-fill" type="fill" source="nhc-wind-radii" filter={CURRENT_RADII} layout={{ visibility: vis(show.radii), 'fill-sort-key': RADII_SORT }} paint={RADII_FILL_PAINT} />
        <Layer id="nhc-wind-radii-line" type="line" source="nhc-wind-radii" filter={CURRENT_RADII} layout={{ visibility: vis(show.radii) }} paint={RADII_LINE_PAINT} />
        <Layer id="nhc-wind-radii-forecast" type="line" source="nhc-wind-radii" filter={FORECAST_RADII} layout={{ visibility: vis(show.radii) }} paint={RADII_FORECAST_PAINT} />
      </Source>

      <Source id="nhc-arrival" type="geojson" data={data?.arrivalGeoJSON || EMPTY_FC} attribution={NHC_ATTRIBUTION}>
        <Layer id="nhc-arrival-casing" type="line" source="nhc-arrival" layout={{ visibility: vis(show.arrival) }} paint={ARRIVAL_CASING_PAINT} />
        <Layer id="nhc-arrival-line" type="line" source="nhc-arrival" layout={{ visibility: vis(show.arrival) }} paint={ARRIVAL_LINE_PAINT} />
        <Layer id="nhc-arrival-label" type="symbol" source="nhc-arrival" layout={{ ...ARRIVAL_LABEL_LAYOUT, visibility: vis(show.arrival) }} paint={ARRIVAL_LABEL_PAINT} />
      </Source>
    </>
  );
});

export default NhcWindHazardsLayer;
