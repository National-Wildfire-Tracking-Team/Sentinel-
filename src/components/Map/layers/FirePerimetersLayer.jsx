/**
 * FirePerimetersLayer.jsx
 * Renders NIFC fire perimeter polygons with fill and outline.
 * Layer stays mounted; visibility is controlled via layout property.
 */

import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

export default function FirePerimetersLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="fire-perimeters" type="geojson" data={geoJSON || EMPTY_GEOJSON} generateId>
      <Layer
        id="fire-perimeters-fill"
        type="fill"
        source="fire-perimeters"
        layout={{ visibility: vis }}
        paint={{
          'fill-color': '#ff6600',
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            0.35,
            0.14,
          ],
        }}
      />
      <Layer
        id="fire-perimeters-line"
        type="line"
        source="fire-perimeters"
        layout={{ visibility: vis }}
        paint={{
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            '#ffaa00',
            '#ff6600',
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            3,
            1.8,
          ],
          'line-opacity': 0.9,
        }}
      />
      <Layer
        id="fire-perimeters-label"
        type="symbol"
        source="fire-perimeters"
        minzoom={7}
        layout={{
          visibility: vis,
          'text-field': ['get', 'IncidentName'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12,
          'text-anchor': 'center',
          'text-max-width': 10,
        }}
        paint={{
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.8)',
          'text-halo-width': 2,
        }}
      />
    </Source>
  );
}
