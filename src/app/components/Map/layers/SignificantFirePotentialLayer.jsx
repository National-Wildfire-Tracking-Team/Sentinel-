/**
 * SignificantFirePotentialLayer.jsx
 * NWCG 7-day Significant Fire Potential by Predictive Service Area
 * (Wildfire and All Hazards tabs), in NIFC's legend colours. Areas whose
 * forecast isn't issued for the chosen date are drawn as a faint dashed
 * outline with no rating colour, as on NIFC's own map, rather than carried
 * over from an earlier day.
 */

import { Layer, Source } from 'react-map-gl';
import { useFireDangerContext } from '../../../context/FireDangerContext';

export const SFP_SOURCE_ID = 'fire-potential';
export const SFP_FILL_ID = 'fire-potential-fill';

const IS_RATED = ['!=', ['get', 'sfpClass'], null];

const LINE_WIDTH = ['interpolate', ['linear'], ['zoom'], 3, 0.6, 7, 1.2, 10, 1.6];

export default function SignificantFirePotentialLayer() {
  const fd = useFireDangerContext();
  const data = fd?.sfp?.data;
  if (!fd?.sfpOn || !data) return null;
  const opacity = fd.opacity.sfp;

  return (
    <Source id={SFP_SOURCE_ID} type="geojson" data={data}>
      <Layer
        id={SFP_FILL_ID}
        type="fill"
        paint={{
          'fill-color': ['get', 'sfpColor'],
          'fill-opacity': ['case', IS_RATED, opacity, opacity * 0.25],
        }}
      />
      <Layer
        id="fire-potential-line"
        type="line"
        filter={IS_RATED}
        paint={{ 'line-color': '#3f3f46', 'line-opacity': 0.7, 'line-width': LINE_WIDTH }}
      />
      <Layer
        id="fire-potential-line-unrated"
        type="line"
        filter={['!', IS_RATED]}
        paint={{ 'line-color': '#a1a1aa', 'line-opacity': 0.8, 'line-width': LINE_WIDTH, 'line-dasharray': [2, 2] }}
      />
    </Source>
  );
}
