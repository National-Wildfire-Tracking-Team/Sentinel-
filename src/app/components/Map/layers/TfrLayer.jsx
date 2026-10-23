/**
 * TfrLayer.jsx
 * FAA Temporary Flight Restrictions: each active TFR's area, tinted and
 * outlined in red (TFR_COLOR), labelled with its NOTAM number once
 * zoomed in. Loads its own data (useTfrs) while visible; a click opens
 * TfrDetail (tfrRecords buildTfrRecord).
 */

import { memo } from 'react';
import { Layer, Source } from 'react-map-gl';
import { useTfrs } from '../../../hooks/useTfrs';
import { TFR_COLOR } from '../../../api/tfr';
import { TFR_FILL_ID } from './tfrRecords';

const TfrLayer = memo(function TfrLayer({ visible }) {
  const { geoJSON } = useTfrs(visible);
  const vis = visible ? 'visible' : 'none';

  return (
    <Source id="faa-tfr" type="geojson" data={geoJSON}>
      <Layer
        id={TFR_FILL_ID}
        type="fill"
        layout={{ visibility: vis }}
        paint={{ 'fill-color': TFR_COLOR, 'fill-opacity': 0.18 }}
      />
      <Layer
        id="faa-tfr-outline"
        type="line"
        layout={{ visibility: vis, 'line-join': 'round' }}
        paint={{
          'line-color': TFR_COLOR,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.25, 9, 2.5],
          'line-dasharray': [3, 1.5],
        }}
      />
      <Layer
        id="faa-tfr-label"
        type="symbol"
        minzoom={7}
        layout={{
          visibility: vis,
          'text-field': ['concat', 'TFR ', ['get', 'notam']],
          'text-size': 11,
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
        }}
        paint={{ 'text-color': '#ffffff', 'text-halo-color': 'rgba(9,9,11,0.85)', 'text-halo-width': 1.2 }}
      />
    </Source>
  );
});

export default TfrLayer;
