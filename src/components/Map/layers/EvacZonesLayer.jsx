/**
 * EvacZonesLayer.jsx
 * Renders California evacuation orders, warnings, and watches as
 * semi-transparent polygon overlays on the wildfire map tab.
 *
 * Color scheme mirrors standard Cal OES zone classification:
 *   Order   (mandatory evacuation) → red
 *   Warning (voluntary evacuation) → orange
 *   Watch   (preparedness)         → yellow
 */

import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

// Map WarningType string → fill color
const COLOR_MATCH = [
  'match',
  ['get', 'warningType'],
  'Evacuation Order',   '#ef4444',
  'Evacuation Warning', '#f97316',
  'Evacuation Watch',   '#eab308',
  /* default */         '#f97316',
];

export default function EvacZonesLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="evac-zones" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      {/* Polygon fill */}
      <Layer
        id="evac-zones-fill"
        type="fill"
        source="evac-zones"
        layout={{ visibility: vis }}
        paint={{
          'fill-color':   COLOR_MATCH,
          'fill-opacity': 0.25,
        }}
      />

      {/* Outline */}
      <Layer
        id="evac-zones-line"
        type="line"
        source="evac-zones"
        layout={{ visibility: vis }}
        paint={{
          'line-color':   COLOR_MATCH,
          'line-width':   2,
          'line-opacity': 0.85,
        }}
      />
    </Source>
  );
}
