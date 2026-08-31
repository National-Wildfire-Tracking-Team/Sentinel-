/**
 * DroughtOutlookLayer.jsx
 * Renders NOAA CPC Monthly Drought Outlook polygons.
 * Source: https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/cpc_drought_outlk/FeatureServer
 *
 * Outlook categories (field: outlook):
 *   No_Drought        – no drought expected
 *   Drought_Removes   – drought expected to remove/end
 *   Drought_Improves  – drought expected to improve
 *   Drought_Persists  – drought expected to persist
 *   Drought_Develops  – drought expected to develop
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };

// Colors per CPC drought outlook category
const DROUGHT_FILL_COLOR = [
  'match',
  ['get', 'outlook'],
  'Drought_Develops',  '#d97706',
  'Drought_Persists',  '#dc2626',
  'Drought_Improves',  '#f59e0b',
  'Drought_Removes',   '#84cc16',
  'No_Drought',        '#22c55e',
  '#94a3b8',
];

const DroughtOutlookLayer = memo(function DroughtOutlookLayer({ geoJSON, visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="drought-outlook" type="geojson" data={geoJSON || EMPTY_GEOJSON}>
      <Layer
        id="drought-outlook-fill"
        type="fill"
        source="drought-outlook"
        layout={{ visibility: vis }}
        paint={{
          'fill-color': DROUGHT_FILL_COLOR,
          'fill-opacity': 0.35,
        }}
      />

      <Layer
        id="drought-outlook-line"
        type="line"
        source="drought-outlook"
        layout={{ visibility: vis }}
        paint={{
          'line-color': DROUGHT_FILL_COLOR,
          'line-opacity': 0.75,
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            3, 0.8,
            7, 1.4,
            10, 2,
          ],
        }}
      />
    </Source>
  );
});

export default DroughtOutlookLayer;
