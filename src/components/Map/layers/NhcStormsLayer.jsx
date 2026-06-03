/**
 * NhcStormsLayer.jsx
 * NOAA NHC tropical cyclone layer: forecast cone, track line, and storm-centre symbols.
 * Colour-coded by Saffir–Simpson category derived from wind speed (knots).
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY = { type: 'FeatureCollection', features: [] };

// Interpolate circle fill colour from wind speed (knots) to NOAA-style category colours.
const CENTER_COLOR_EXPR = [
  'step', ['get', 'intensityKts'],
  '#64748b',  // < 34 kt  — depression / extratropical
  34, '#38bdf8', // 34–63 kt — tropical storm (sky blue)
  64, '#facc15', // 64–82 kt — Cat 1 (yellow)
  83, '#eab308', // 83–95 kt — Cat 2 (amber)
  96, '#f97316', // 96–112 kt — Cat 3 (orange)
  113, '#ef4444', // 113–136 kt — Cat 4 (red)
  137, '#c026d3', // ≥ 137 kt — Cat 5 (fuchsia)
];

const NhcStormsLayer = memo(function NhcStormsLayer({
  centersGeoJSON,
  conesGeoJSON,
  tracksGeoJSON,
  visible,
}) {
  const vis = visible ? 'visible' : 'none';

  return (
    <>
      {/* ── Forecast cone of uncertainty (polygon) ─────────────────────────── */}
      <Source id="nhc-cones" type="geojson" data={conesGeoJSON || EMPTY}>
        <Layer
          id="nhc-cones-fill"
          type="fill"
          source="nhc-cones"
          layout={{ visibility: vis }}
          paint={{
            'fill-color': '#38bdf8',
            'fill-opacity': 0.10,
          }}
        />
        <Layer
          id="nhc-cones-line"
          type="line"
          source="nhc-cones"
          layout={{ visibility: vis }}
          paint={{
            'line-color': '#38bdf8',
            'line-width': 1.5,
            'line-opacity': 0.45,
            'line-dasharray': [4, 3],
          }}
        />
      </Source>

      {/* ── Forecast track line ─────────────────────────────────────────────── */}
      <Source id="nhc-tracks" type="geojson" data={tracksGeoJSON || EMPTY}>
        <Layer
          id="nhc-tracks-line"
          type="line"
          source="nhc-tracks"
          layout={{ visibility: vis, 'line-cap': 'round', 'line-join': 'round' }}
          paint={{
            'line-color': '#38bdf8',
            'line-width': 2,
            'line-opacity': 0.75,
          }}
        />
      </Source>

      {/* ── Storm centre symbols ────────────────────────────────────────────── */}
      <Source id="nhc-centers" type="geojson" data={centersGeoJSON || EMPTY}>
        {/* Soft outer halo ring */}
        <Layer
          id="nhc-centers-halo"
          type="circle"
          source="nhc-centers"
          layout={{ visibility: vis }}
          paint={{
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              2, 16, 5, 20, 8, 26,
            ],
            'circle-color': CENTER_COLOR_EXPR,
            'circle-opacity': 0.18,
            'circle-stroke-color': CENTER_COLOR_EXPR,
            'circle-stroke-width': 1.5,
            'circle-stroke-opacity': 0.45,
          }}
        />
        {/* Solid inner dot */}
        <Layer
          id="nhc-centers-circle"
          type="circle"
          source="nhc-centers"
          layout={{ visibility: vis }}
          paint={{
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              2, 7, 5, 9, 8, 12,
            ],
            'circle-color': CENTER_COLOR_EXPR,
            'circle-opacity': 0.95,
            'circle-stroke-color': '#000000',
            'circle-stroke-width': 1.5,
          }}
        />
        {/* Storm name label */}
        <Layer
          id="nhc-centers-label"
          type="symbol"
          source="nhc-centers"
          layout={{
            visibility: vis,
            'text-field': ['get', 'name'],
            'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 6, 13],
            'text-anchor': 'top',
            'text-offset': [0, 1.2],
            'text-allow-overlap': false,
          }}
          paint={{
            'text-color': '#e2e8f0',
            'text-halo-color': '#000000',
            'text-halo-width': 1.5,
          }}
        />
      </Source>
    </>
  );
});

export default NhcStormsLayer;
