/**
 * NhcModelTracksLayer.jsx
 * Spaghetti model tracks for one storm (from StormMapPopup's "Show Spaghetti
 * Models"): one line per model, the NHC official forecast drawn heavier,
 * each labeled with its model name at its last forecast point.
 */

import { memo, useMemo } from 'react';
import { Layer, Source } from 'react-map-gl';
import { modelTracksGeoJSON } from '../../../api/nhcModelTracks';

const NhcModelTracksLayer = memo(function NhcModelTracksLayer({ data, group }) {
  const geojson = useMemo(() => modelTracksGeoJSON(data, group), [data, group]);
  if (!geojson.features.length) return null;
  return (
    <Source id="nhc-model-tracks" type="geojson" data={geojson}>
      <Layer
        id="nhc-model-tracks-line"
        type="line"
        filter={['!', ['has', 'end']]}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': ['get', 'color'],
          'line-width': ['case', ['==', ['get', 'group'], 'official'], 3, 1.5],
          'line-opacity': ['case', ['==', ['get', 'group'], 'official'], 1, 0.85],
        }}
      />
      <Layer
        id="nhc-model-tracks-label"
        type="symbol"
        filter={['has', 'end']}
        layout={{
          'text-field': ['get', 'tech'],
          'text-size': 10,
          'text-offset': [0.6, 0],
          'text-anchor': 'left',
          'text-allow-overlap': false,
        }}
        paint={{ 'text-color': ['get', 'color'], 'text-halo-color': '#000000', 'text-halo-width': 1.2 }}
      />
    </Source>
  );
});

export default NhcModelTracksLayer;
