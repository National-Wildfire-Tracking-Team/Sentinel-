/**
 * FieldSamplesLayer.jsx
 * Measured live fuel moisture sample sites (NWCC mirror of FEMS). One point
 * per site; brighter when sampled in the last two weeks, faded when older.
 * The values themselves are in the inspection panel: a site samples several
 * plant species, so no single colour could stand for it.
 */

import { Layer, Source } from 'react-map-gl';
import { useFireDangerContext } from '../../../context/FireDangerContext';
import { productDate } from '../../../api/fireDanger/freshness';

export const SAMPLES_CIRCLE_ID = 'lfm-samples-circle';

export default function FieldSamplesLayer() {
  const fd = useFireDangerContext();
  const data = fd?.samples?.data;
  if (!fd?.samplesOn || !data) return null;
  // Sites sampled within 14 days of today are drawn solid.
  const cutoff = productDate(new Date(), -14);
  const recent = ['>=', ['get', 'latestDate'], cutoff];
  const opacity = fd.opacity.samples;
  return (
    <Source id="lfm-samples" type="geojson" data={data}>
      <Layer
        id={SAMPLES_CIRCLE_ID}
        type="circle"
        paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 4, 8, 7, 12, 9],
          'circle-color': '#a855f7',
          'circle-opacity': ['case', recent, 0.95 * opacity, 0.35 * opacity],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': ['case', recent, 1.5, 0.8],
          'circle-stroke-opacity': opacity,
        }}
      />
    </Source>
  );
}
