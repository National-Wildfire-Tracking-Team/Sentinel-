/**
 * NhcModelTracksLayer.jsx
 * Spaghetti model tracks for one storm (from the "Spaghetti Models" control
 * in StormMapPopup and the detail panel): one line per selected model from
 * its own forecast points, each in its registry color and labeled with its
 * name at its last point. The NHC official forecast is drawn heavier and on
 * top; legacy models (HWRF, HMON) and stale runs are dashed, so neither
 * reads as current guidance. Where the storm is now is a separate ring.
 */

import { memo, useMemo } from 'react';
import { Layer, Source } from 'react-map-gl';
import { modelTracksGeoJSON } from '../../../api/nhcModelTracks';

const IS_LINE = ['==', ['geometry-type'], 'LineString'];
const LINE_LAYOUT = { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'sortKey'] };
const LINE_WIDTH = ['match', ['get', 'kind'], 'official', 3.5, 'model', 2, 1.25];
const LINE_OPACITY = ['match', ['get', 'kind'], 'official', 1, 'model', 0.95, 0.7];

const NhcModelTracksLayer = memo(function NhcModelTracksLayer({ data, selection }) {
  const geojson = useMemo(() => modelTracksGeoJSON(data, selection), [data, selection]);
  if (!geojson.features.length) return null;
  return (
    <Source id="nhc-model-tracks" type="geojson" data={geojson}>
      <Layer
        id="nhc-model-tracks-line"
        type="line"
        filter={['all', IS_LINE, ['!=', ['get', 'dashed'], true]]}
        layout={LINE_LAYOUT}
        paint={{ 'line-color': ['get', 'color'], 'line-width': LINE_WIDTH, 'line-opacity': LINE_OPACITY }}
      />
      <Layer
        id="nhc-model-tracks-line-dashed"
        type="line"
        filter={['all', IS_LINE, ['==', ['get', 'dashed'], true]]}
        layout={LINE_LAYOUT}
        paint={{
          'line-color': ['get', 'color'],
          'line-width': LINE_WIDTH,
          'line-opacity': 0.8,
          'line-dasharray': [2, 1.5],
        }}
      />
      <Layer
        id="nhc-model-tracks-now"
        type="circle"
        filter={['==', ['get', 'kind'], 'current']}
        paint={{
          'circle-radius': 6,
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        }}
      />
      <Layer
        id="nhc-model-tracks-label"
        type="symbol"
        filter={['has', 'end']}
        layout={{
          'text-field': ['get', 'label'],
          'text-size': ['match', ['get', 'kind'], 'official', 11, 10],
          'text-offset': [0.6, 0],
          'text-anchor': 'left',
          'text-allow-overlap': false,
          'symbol-sort-key': ['-', 0, ['get', 'sortKey']],
        }}
        paint={{ 'text-color': ['get', 'color'], 'text-halo-color': '#000000', 'text-halo-width': 1.2 }}
      />
    </Source>
  );
});

export default NhcModelTracksLayer;
