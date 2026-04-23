/**
 * EvacZonesLayer.jsx
 * Renders California evacuation orders, warnings, and watches as
 * semi-transparent polygon overlays on the wildfire map tab.
 *
 * Accepts data from the combined CalOES hosted-view + PROD feed
 * (see useCombinedEvacZones). Both sources are normalised to the
 * same flat schema before being passed here, so this component
 * only needs to handle:
 *
 *   warningType – "Evacuation Order" | "Evacuation Warning" | "Evacuation Watch"
 *   zoneName    – display label
 *   county      – county name
 *   agency      – responsible agency (may be empty)
 *   instructions
 *   comments
 *   effectiveDate / expirationDate
 *   externalURL
 *   source      – "hosted" | "prod"
 *
 * Color scheme mirrors standard Cal OES zone classification:
 *   Order   (mandatory evacuation) → red
 *   Warning (voluntary evacuation) → orange
 *   Watch / Advisory (preparedness) → yellow
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const COLOR_MATCH = [
  'match',
  ['get', 'warningType'],
  'Evacuation Order',   '#ef4444',
  'Evacuation Warning', '#f97316',
  'Evacuation Watch',   '#eab308',
  /* default */         '#f97316',
];

const OPACITY_MATCH = [
  'match',
  ['get', 'warningType'],
  'Evacuation Order',   0.32,
  'Evacuation Warning', 0.25,
  'Evacuation Watch',   0.18,
  /* default */         0.22,
];

const LINE_WIDTH_MATCH = [
  'match',
  ['get', 'warningType'],
  'Evacuation Order',   2.5,
  'Evacuation Warning', 2.0,
  /* default */         1.5,
];

const EvacZonesLayer = memo(function EvacZonesLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="evac-zones" type="geojson" data={geoJSON || EMPTY_GEOJSON} generateId>
      {/* Polygon fill */}
      <Layer
        id="evac-zones-fill"
        type="fill"
        source="evac-zones"
        layout={{ visibility: vis }}
        paint={{
          'fill-color':   COLOR_MATCH,
          'fill-opacity': OPACITY_MATCH,
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
          'line-width':   LINE_WIDTH_MATCH,
          'line-opacity': 0.9,
        }}
      />

      {/* Zone-name labels at higher zoom */}
      <Layer
        id="evac-zones-label"
        type="symbol"
        source="evac-zones"
        minzoom={8}
        layout={{
          visibility: vis,
          'text-field': ['coalesce', ['get', 'zoneName'], ''],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 11,
          'text-anchor': 'center',
          'text-max-width': 10,
        }}
        paint={{
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.85)',
          'text-halo-width': 2,
        }}
      />
    </Source>
  );
});
export default EvacZonesLayer;
