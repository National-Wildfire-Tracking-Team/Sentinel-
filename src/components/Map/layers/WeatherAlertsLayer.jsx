/**
 * WeatherAlertsLayer.jsx
 * Combined NOAA/NWS active alerts and SPC Mesoscale Discussion polygons
 * in one control: NWS zones use WWA-aware styles where defined (see getNWSWWAStyle),
 * then the official NWS palette for color; SPC MDs use
 * the classic red-dash / white outline with no fill, matching the SPC map.
 */

import { memo, Fragment } from 'react';
import { Source, Layer } from 'react-map-gl';
import {
  nwsWwaAwareColorMatchExpression,
  nwsWwaStyleMatchExpression,
} from '../../../utils/nwsColors';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };
const COLOR_EXPR = nwsWwaAwareColorMatchExpression();
const FILL_OPACITY_EXPR = nwsWwaStyleMatchExpression('fill');
const LINE_OPACITY_EXPR = nwsWwaStyleMatchExpression('stroke');
const LINE_WIDTH_EXPR = nwsWwaStyleMatchExpression('width');

const WeatherAlertsLayer = memo(function WeatherAlertsLayer({
  geoJSON,
  spcMdGeoJSON,
  visible,
}) {
  const vis = visible ? 'visible' : 'none';
  const md = spcMdGeoJSON || EMPTY_GEOJSON;

  return (
    <Fragment>
      <Source id="weather-alerts" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
        <Layer
          id="weather-alerts-fill"
          type="fill"
          source="weather-alerts"
          layout={{ visibility: vis }}
          paint={{
            'fill-color': COLOR_EXPR,
            'fill-opacity': FILL_OPACITY_EXPR,
          }}
        />
        <Layer
          id="weather-alerts-line"
          type="line"
          source="weather-alerts"
          layout={{ visibility: vis }}
          paint={{
            'line-color': COLOR_EXPR,
            'line-width': LINE_WIDTH_EXPR,
            'line-opacity': LINE_OPACITY_EXPR,
          }}
        />
      </Source>

      <Source
        id="spc-md"
        type="geojson"
        data={md}
        generateId
      >
        <Layer
          id="spc-md-fill"
          type="fill"
          source="spc-md"
          layout={{ visibility: vis }}
          paint={{
            'fill-color': '#ff0000',
            'fill-opacity': 0.04,
          }}
        />
        <Layer
          id="spc-md-line-white"
          type="line"
          source="spc-md"
          layout={{ visibility: vis }}
          paint={{
            'line-color': '#ffffff',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              3, 2.5,
              7, 3.5,
              10, 4.5,
            ],
            'line-opacity': 0.95,
          }}
        />
        <Layer
          id="spc-md-line-red"
          type="line"
          source="spc-md"
          layout={{
            visibility: vis,
            'line-cap': 'butt',
            'line-join': 'miter',
          }}
          paint={{
            'line-color': '#e3000f',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              3, 2,
              7, 3,
              10, 4,
            ],
            'line-dasharray': [4, 3],
            'line-opacity': 1,
          }}
        />
        <Layer
          id="spc-md-label"
          type="symbol"
          source="spc-md"
          minzoom={3.5}
          layout={{
            visibility: vis,
            'text-field': [
              'case',
              ['!=', ['get', 'mdNumber'], null],
              ['concat', 'MD ', ['to-string', ['get', 'mdNumber']]],
              ['get', 'name'],
            ],
            'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
            'text-size': [
              'interpolate', ['linear'], ['zoom'],
              4, 11,
              7, 13,
              10, 15,
            ],
            'text-anchor': 'center',
            'text-allow-overlap': false,
            'text-ignore-placement': false,
            'symbol-placement': 'point',
          }}
          paint={{
            'text-color': '#ffffff',
            'text-halo-color': '#cc0000',
            'text-halo-width': 2,
          }}
        />
      </Source>
    </Fragment>
  );
});
export default WeatherAlertsLayer;
