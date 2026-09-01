/**
 * CalFirePerimetersLayer.jsx
 * Renders historical CAL FIRE FRAP fire perimeter polygons as muted,
 * dashed-outline scars for context (distinct from the active NIFC layer).
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

const CalFirePerimetersLayer = memo(function CalFirePerimetersLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="calfire-historical-perimeters" type="geojson" data={geoJSON || EMPTY_GEOJSON} generateId>
      <Layer
        id="calfire-historical-perimeters-fill"
        type="fill"
        source="calfire-historical-perimeters"
        layout={{ visibility: vis }}
        paint={{
          'fill-color': '#92400e',
          'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.28, 0.14],
        }}
      />
      {/* Dark casing beneath the dashed line so the scar stays legible over
          satellite imagery, whose brightness/color varies too much for the
          amber line alone to read reliably (mirrors fire-perimeters-line-casing) */}
      <Layer
        id="calfire-historical-perimeters-line-casing"
        type="line"
        source="calfire-historical-perimeters"
        layout={{ visibility: vis }}
        paint={{
          'line-color': '#000000',
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 4, 2.4],
          'line-opacity': 0.55,
        }}
      />
      <Layer
        id="calfire-historical-perimeters-line"
        type="line"
        source="calfire-historical-perimeters"
        layout={{ visibility: vis }}
        paint={{
          'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#fbbf24', '#f59e0b'],
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 1.4],
          'line-dasharray': [2, 1.5],
          'line-opacity': 1,
        }}
      />
      <Layer
        id="calfire-historical-perimeters-label"
        type="symbol"
        source="calfire-historical-perimeters"
        minzoom={8}
        layout={{
          visibility: vis,
          'text-field': [
            'format',
            ['get', 'FireName'], {},
            ' (', {},
            ['to-string', ['get', 'FireYear']], {},
            ')', {},
          ],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 10,
          'text-anchor': 'top',
          'text-offset': [0, 1],
          'text-max-width': 10,
        }}
        paint={{
          'text-color': '#fcd34d',
          'text-halo-color': 'rgba(0,0,0,0.85)',
          'text-halo-width': 1.8,
        }}
      />
    </Source>
  );
});

export default CalFirePerimetersLayer;
