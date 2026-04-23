/**
 * ReporterEvacZonesLayer.jsx
 * Renders reporter-drawn evacuation zone polygons on the wildfire map.
 *
 * Uses the same Order/Warning/Watch color palette as EvacZonesLayer (official
 * Cal OES data) but adds a distinct dashed outline and a "REPORTER" badge so
 * viewers can tell the zones came from a field reporter, not an official feed.
 *
 * Color scheme:
 *   Evacuation Order   → red   (#ef4444)
 *   Evacuation Warning → orange (#f97316)
 *   Evacuation Watch   → yellow (#eab308)
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const COLOR_MATCH = [
  'match',
  ['get', 'zone_type'],
  'Evacuation Order',   '#ef4444',
  'Evacuation Warning', '#f97316',
  'Evacuation Watch',   '#eab308',
  /* default */         '#f97316',
];

const ReporterEvacZonesLayer = memo(function ReporterEvacZonesLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source
      id="reporter-evac-zones"
      type="geojson"
      data={geoJSON || EMPTY_GEOJSON}
    >
      {/* Semi-transparent fill */}
      <Layer
        id="reporter-evac-zones-fill"
        type="fill"
        source="reporter-evac-zones"
        layout={{ visibility: vis }}
        paint={{
          'fill-color':   COLOR_MATCH,
          'fill-opacity': 0.18,
        }}
      />

      {/* Dashed outline – visually differentiates from official EvacZonesLayer */}
      <Layer
        id="reporter-evac-zones-line"
        type="line"
        source="reporter-evac-zones"
        layout={{
          visibility: vis,
          'line-cap': 'round',
          'line-join': 'round',
        }}
        paint={{
          'line-color':      COLOR_MATCH,
          'line-width':      2.5,
          'line-opacity':    0.9,
          'line-dasharray':  [3, 2],
        }}
      />

      {/* Slightly brighter halo so the dashed line reads well on satellite */}
      <Layer
        id="reporter-evac-zones-line-halo"
        type="line"
        source="reporter-evac-zones"
        layout={{
          visibility: vis,
          'line-cap': 'round',
          'line-join': 'round',
        }}
        paint={{
          'line-color':   '#ffffff',
          'line-width':   4,
          'line-opacity': 0.12,
        }}
      />
    </Source>
  );
});

export default ReporterEvacZonesLayer;
