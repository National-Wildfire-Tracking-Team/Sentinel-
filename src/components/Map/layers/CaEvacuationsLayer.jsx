/**
 * CaEvacuationsLayer.jsx
 * Renders California active evacuation zones from CalOES.
 *
 * Color coding:
 *   Evacuation Order   → Red    (#dc2626) – mandatory evacuation
 *   Evacuation Warning → Orange (#ea580c) – voluntary evacuation recommended
 *   Evacuation Advisory→ Yellow (#ca8a04) – be prepared to evacuate
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

// Match on lowercase for resilience to label variation
const STATUS_COLOR = [
  'match',
  ['downcase', ['coalesce', ['get', 'Zone_Status'], '']],
  'evacuation order',   '#dc2626',
  'evacuation warning', '#ea580c',
  'evacuation advisory','#ca8a04',
  /* default */         '#6b7280',
];

const STATUS_OPACITY = [
  'match',
  ['downcase', ['coalesce', ['get', 'Zone_Status'], '']],
  'evacuation order',   0.10,
  'evacuation warning', 0.08,
  'evacuation advisory',0.06,
  /* default */         0.07,
];

const CaEvacuationsLayer = memo(function CaEvacuationsLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="ca-evacuations" type="geojson" data={geoJSON || EMPTY_GEOJSON} generateId>
      {/* Fill */}
      <Layer
        id="ca-evacuations-fill"
        type="fill"
        source="ca-evacuations"
        layout={{ visibility: vis }}
        paint={{
          'fill-color': STATUS_COLOR,
          'fill-opacity': STATUS_OPACITY,
        }}
      />

      {/* Outline */}
      <Layer
        id="ca-evacuations-line"
        type="line"
        source="ca-evacuations"
        layout={{ visibility: vis }}
        paint={{
          'line-color': STATUS_COLOR,
          'line-width': [
            'match',
            ['downcase', ['coalesce', ['get', 'Zone_Status'], '']],
            'evacuation order',   2.5,
            'evacuation warning', 2.0,
            /* default */         1.5,
          ],
          'line-opacity': 0.9,
        }}
      />

      {/* Label at higher zoom */}
      <Layer
        id="ca-evacuations-label"
        type="symbol"
        source="ca-evacuations"
        minzoom={8}
        layout={{
          visibility: vis,
          'text-field': ['coalesce', ['get', 'Zone_Name'], ['get', 'IncidentName'], ''],
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
export default CaEvacuationsLayer;
