/**
 * HurricaneLayer.jsx
 * Map layers for NOAA NHC hurricane / tropical cyclone data.
 *
 * Renders:
 * - Forecast error cone (semi-transparent polygon)
 * - Observed track line
 * - Forecast track line (dashed)
 * - Current storm position points (category-colored)
 * - Storm name labels
 */

import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

// Saffir-Simpson color ramp based on wind speed in knots (matches nhcHurricane.js)
const CATEGORY_COLOR = [
  'interpolate', ['linear'], ['get', 'windKt'],
  0,   '#5b8def',  // TD – blue
  34,  '#00faf4',  // TS – cyan
  64,  '#fffb00',  // Cat 1 – yellow
  83,  '#ffc800',  // Cat 2 – orange-yellow
  96,  '#ff6600',  // Cat 3 – dark orange
  113, '#ff0000',  // Cat 4 – red
  137, '#cc00cc',  // Cat 5 – magenta
];

export default function HurricaneLayer({
  stormsGeoJSON,
  forecastConeGeoJSON,
  observedTrackGeoJSON,
  forecastTrackGeoJSON,
  visible,
}) {
  const vis = visible ? 'visible' : 'none';

  return (
    <>
      {/* ── Forecast error cone (rendered first / bottom) ── */}
      <Source
        id="nhc-forecast-cone"
        type="geojson"
        data={forecastConeGeoJSON || EMPTY_GEOJSON}
      >
        <Layer
          id="nhc-forecast-cone-fill"
          type="fill"
          layout={{ visibility: vis }}
          paint={{
            'fill-color': '#ffffff',
            'fill-opacity': 0.12,
          }}
        />
        <Layer
          id="nhc-forecast-cone-outline"
          type="line"
          layout={{ visibility: vis }}
          paint={{
            'line-color': '#94a3b8',
            'line-width': 1,
            'line-opacity': 0.5,
            'line-dasharray': [4, 3],
          }}
        />
      </Source>

      {/* ── Observed track line ── */}
      <Source
        id="nhc-observed-track"
        type="geojson"
        data={observedTrackGeoJSON || EMPTY_GEOJSON}
      >
        <Layer
          id="nhc-observed-track-line"
          type="line"
          layout={{ visibility: vis, 'line-cap': 'round', 'line-join': 'round' }}
          paint={{
            'line-color': '#f8fafc',
            'line-width': 2.5,
            'line-opacity': 0.8,
          }}
        />
      </Source>

      {/* ── Forecast track line (dashed) ── */}
      <Source
        id="nhc-forecast-track"
        type="geojson"
        data={forecastTrackGeoJSON || EMPTY_GEOJSON}
      >
        <Layer
          id="nhc-forecast-track-line"
          type="line"
          layout={{ visibility: vis, 'line-cap': 'round', 'line-join': 'round' }}
          paint={{
            'line-color': '#60a5fa',
            'line-width': 2,
            'line-opacity': 0.7,
            'line-dasharray': [6, 4],
          }}
        />
      </Source>

      {/* ── Current storm positions ── */}
      <Source
        id="nhc-storm-positions"
        type="geojson"
        data={stormsGeoJSON || EMPTY_GEOJSON}
      >
        {/* Outer glow ring */}
        <Layer
          id="nhc-storms-glow"
          type="circle"
          layout={{ visibility: vis }}
          paint={{
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              3, 18,
              7, 28,
              10, 36,
            ],
            'circle-color': CATEGORY_COLOR,
            'circle-opacity': 0.15,
            'circle-blur': 0.8,
          }}
        />

        {/* Main storm dot */}
        <Layer
          id="nhc-storms-circle"
          type="circle"
          layout={{ visibility: vis }}
          paint={{
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              3, 7,
              7, 11,
              10, 15,
            ],
            'circle-color': CATEGORY_COLOR,
            'circle-opacity': 0.95,
            'circle-stroke-color': '#111827',
            'circle-stroke-width': 2,
          }}
        />

        {/* Storm name label */}
        <Layer
          id="nhc-storms-label"
          type="symbol"
          layout={{
            visibility: vis,
            'text-field': ['get', 'name'],
            'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
            'text-size': [
              'interpolate', ['linear'], ['zoom'],
              3, 11,
              7, 13,
            ],
            'text-anchor': 'bottom',
            'text-offset': [0, -1.5],
            'text-allow-overlap': true,
          }}
          paint={{
            'text-color': '#ffffff',
            'text-halo-color': 'rgba(0,0,0,0.85)',
            'text-halo-width': 1.5,
          }}
        />

        {/* Category label below the dot */}
        <Layer
          id="nhc-storms-category"
          type="symbol"
          minzoom={5}
          layout={{
            visibility: vis,
            'text-field': ['get', 'category'],
            'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
            'text-size': 10,
            'text-anchor': 'top',
            'text-offset': [0, 1.5],
            'text-allow-overlap': true,
          }}
          paint={{
            'text-color': CATEGORY_COLOR,
            'text-halo-color': 'rgba(0,0,0,0.75)',
            'text-halo-width': 1,
          }}
        />
      </Source>
    </>
  );
}
