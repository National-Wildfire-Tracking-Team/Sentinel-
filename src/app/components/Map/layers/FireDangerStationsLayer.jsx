/**
 * FireDangerStationsLayer.jsx
 * FEMS NFDRS station values (Wildfire and All Hazards tabs): one circle per
 * weather station, coloured by the field chosen in the layer panel (ERC, BI,
 * SC, or a dead / live fuel moisture class). Stations with no current
 * observed day, or no value for the field, are drawn as hollow grey rings:
 * shown, but never given a colour. Values are labelled from zoom 7.
 */

import { Layer, Source } from 'react-map-gl';
import { useFireDangerContext } from '../../../context/FireDangerContext';
import { STATION_FIELDS, rampStops } from '../../../api/fireDanger/stations';

export const STATIONS_SOURCE_ID = 'fire-danger-stations';
export const STATIONS_CIRCLE_ID = 'fire-danger-stations-circle';

const RADIUS = ['interpolate', ['linear'], ['zoom'], 3, 3, 7, 6, 11, 9];

export default function FireDangerStationsLayer() {
  const fd = useFireDangerContext();
  const st = fd?.stations;
  if (!fd?.stationsOn || !st?.data || !st.field) return null;
  const field = st.field;
  const hasValue = ['all', ['!', ['get', 'stale']], ['!=', ['get', field], null]];
  const opacity = fd.opacity.stations;
  const unit = STATION_FIELDS[field].unit;

  return (
    <Source id={STATIONS_SOURCE_ID} type="geojson" data={st.data}>
      <Layer
        id={STATIONS_CIRCLE_ID}
        type="circle"
        paint={{
          'circle-radius': RADIUS,
          'circle-color': ['case', hasValue, ['interpolate', ['linear'], ['get', field], ...rampStops(field)], 'rgba(0,0,0,0)'],
          'circle-opacity': opacity,
          'circle-stroke-color': ['case', hasValue, '#18181b', '#a1a1aa'],
          'circle-stroke-width': ['case', hasValue, 0.8, 1.4],
          'circle-stroke-opacity': opacity,
        }}
      />
      <Layer
        id="fire-danger-stations-label"
        type="symbol"
        minzoom={7}
        filter={hasValue}
        layout={{
          'text-field': ['concat', ['to-string', ['round', ['get', field]]], unit],
          'text-size': 11,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-allow-overlap': false,
        }}
        paint={{ 'text-color': '#ffffff', 'text-halo-color': '#18181b', 'text-halo-width': 1.2 }}
      />
    </Source>
  );
}
