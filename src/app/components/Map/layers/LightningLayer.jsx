/**
 * LightningLayer.jsx
 * Lightning layer (Weather and All Hazards tabs): GOES GLM flashes from the
 * last 15 minutes as small dots coloured by age, white for the newest through
 * yellow and orange to red (api/lightning.js LIGHTNING_AGES). The newest are a
 * little larger with a soft glow, so fresh lightning stands out.
 *
 * Ages are worked out on the map from each flash's time and a clock that ticks
 * every 10 s, so dots change colour and drop off at 15 minutes between the
 * once-a-minute refreshes, with no new data. Kept above the radar and alert
 * layers by layerStack.js.
 */

import { useEffect, useMemo, useState } from 'react';
import { Layer, Source } from 'react-map-gl';
import { useLightning } from '../../../hooks/useLightning';
import { LIGHTNING_AGES } from '../../../api/lightning';

export const LIGHTNING_SOURCE_ID = 'lightning';
const EMPTY = { type: 'FeatureCollection', features: [] };
const TICK_MS = 10 * 1000;
const MAX_AGE_S = LIGHTNING_AGES[LIGHTNING_AGES.length - 1].maxMin * 60;
const NEW_S = LIGHTNING_AGES[0].maxMin * 60;

function useNowSeconds(enabled) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    if (!enabled) return undefined;
    setNow(Date.now() / 1000);
    const id = setInterval(() => setNow(Date.now() / 1000), TICK_MS);
    return () => clearInterval(id);
  }, [enabled]);
  return Math.floor(now);
}

export default function LightningLayer({ visible }) {
  const { data } = useLightning(visible);
  const now = useNowSeconds(visible);

  const age = useMemo(() => ['-', now, ['get', 't']], [now]);
  const color = useMemo(() => [
    'step', age,
    LIGHTNING_AGES[0].color,
    ...LIGHTNING_AGES.slice(1).flatMap((band, i) => [LIGHTNING_AGES[i].maxMin * 60, band.color]),
  ], [age]);
  const filter = useMemo(() => ['<=', age, MAX_AGE_S], [age]);
  const isNew = useMemo(() => ['<', age, NEW_S], [age]);

  const vis = visible ? 'visible' : 'none';
  return (
    <Source id={LIGHTNING_SOURCE_ID} type="geojson" data={visible ? (data?.geojson ?? EMPTY) : EMPTY}>
      {/* Soft glow behind the newest flashes */}
      <Layer
        id="lightning-glow"
        type="circle"
        filter={['all', filter, isNew]}
        layout={{ visibility: vis }}
        paint={{
          'circle-color': '#ffffff',
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 6, 8, 11],
          'circle-blur': 1,
          'circle-opacity': 0.45,
        }}
      />
      <Layer
        id="lightning-flashes"
        type="circle"
        filter={filter}
        layout={{ visibility: vis, 'circle-sort-key': ['get', 't'] }}
        paint={{
          'circle-color': color,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, ['case', isNew, 2.6, 1.8], 8, ['case', isNew, 5, 3.5]],
          'circle-stroke-color': 'rgba(0, 0, 0, 0.55)',
          'circle-stroke-width': 0.6,
          'circle-opacity': 0.95,
        }}
      />
    </Source>
  );
}
