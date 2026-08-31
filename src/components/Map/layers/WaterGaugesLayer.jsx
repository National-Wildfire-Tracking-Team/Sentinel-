/**
 * WaterGaugesLayer.jsx
 * NOAA NWPS water gauges rendered as color-coded circles by flood category.
 *
 * Gauges whose forecast is above action stage (properties.forecastAboveAction,
 * from the NWPS forecast layer — see noaaWaterGauge.js) are shown at every
 * zoom level. All other gauges stay hidden until the user zooms in to about a
 * 4-mile view (ZOOM_SHOW_ALL), keeping the overview map decluttered while
 * still surfacing every gauge on closer inspection.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';
import { FLOOD_CATEGORY_META, FLOOD_CATEGORY_DEFAULT } from '../../../api/noaaWaterGauge';

const EMPTY = { type: 'FeatureCollection', features: [] };
const MIN_ZOOM = 0;
const ZOOM_SHOW_ALL = 11; // ~4mi map extent

const PRIORITY_FILTER = ['==', ['get', 'forecastAboveAction'], true];
const OTHER_FILTER = ['!=', ['get', 'forecastAboveAction'], true];

// Color by flood category (matches NOAA color conventions) — built from the
// shared FLOOD_CATEGORY_META so it can't drift from the popup/detail panel.
const CATEGORY_COLOR = [
  'match', ['get', 'floodCategory'],
  ...Object.entries(FLOOD_CATEGORY_META)
    .filter(([key]) => key !== FLOOD_CATEGORY_DEFAULT)
    .flatMap(([key, meta]) => [key, meta.mapColor]),
  /* default (normal / no data) */ FLOOD_CATEGORY_META[FLOOD_CATEGORY_DEFAULT].mapColor,
];

const WaterGaugesLayer = memo(function WaterGaugesLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';
  const data = geoJSON || EMPTY;

  return (
    <Source id="water-gauges" type="geojson" data={data}>
      {/* Glow ring */}
      <Layer
        id="water-gauges-glow-priority"
        type="circle"
        minzoom={MIN_ZOOM}
        filter={PRIORITY_FILTER}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 4, 5, 8, 10, 18],
          'circle-color': CATEGORY_COLOR,
          'circle-opacity': 0.18,
          'circle-blur': 0.7,
          'circle-stroke-width': 0,
        }}
      />
      <Layer
        id="water-gauges-glow-other"
        type="circle"
        minzoom={ZOOM_SHOW_ALL}
        filter={OTHER_FILTER}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 4, 5, 8, 10, 18],
          'circle-color': CATEGORY_COLOR,
          'circle-opacity': 0.18,
          'circle-blur': 0.7,
          'circle-stroke-width': 0,
        }}
      />

      {/* Main station dot – interactive target */}
      <Layer
        id="water-gauges-circle-priority"
        type="circle"
        minzoom={MIN_ZOOM}
        filter={PRIORITY_FILTER}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 5, 3, 8, 5, 12, 8],
          'circle-color': CATEGORY_COLOR,
          'circle-opacity': 0.95,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        }}
      />
      <Layer
        id="water-gauges-circle-other"
        type="circle"
        minzoom={ZOOM_SHOW_ALL}
        filter={OTHER_FILTER}
        layout={{ visibility: vis }}
        paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 5, 3, 8, 5, 12, 8],
          'circle-color': CATEGORY_COLOR,
          'circle-opacity': 0.95,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        }}
      />

      {/* Stage label at higher zoom */}
      <Layer
        id="water-gauges-label-priority"
        type="symbol"
        minzoom={9}
        filter={PRIORITY_FILTER}
        layout={{
          visibility: vis,
          'text-field': [
            'case',
            ['!=', ['get', 'currentStage'], null],
            ['concat', ['to-string', ['round', ['get', 'currentStage']]], ' ft'],
            '',
          ],
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-size': 10,
          'text-anchor': 'top',
          'text-offset': [0, 0.8],
          'text-allow-overlap': false,
        }}
        paint={{
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.7)',
          'text-halo-width': 1.5,
        }}
      />
      <Layer
        id="water-gauges-label-other"
        type="symbol"
        minzoom={ZOOM_SHOW_ALL}
        filter={OTHER_FILTER}
        layout={{
          visibility: vis,
          'text-field': [
            'case',
            ['!=', ['get', 'currentStage'], null],
            ['concat', ['to-string', ['round', ['get', 'currentStage']]], ' ft'],
            '',
          ],
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-size': 10,
          'text-anchor': 'top',
          'text-offset': [0, 0.8],
          'text-allow-overlap': false,
        }}
        paint={{
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.7)',
          'text-halo-width': 1.5,
        }}
      />
    </Source>
  );
});

export default WaterGaugesLayer;
