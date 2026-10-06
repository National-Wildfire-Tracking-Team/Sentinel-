/**
 * SatelliteStormFocus.jsx
 * While the Satellite layer is on, selecting an NHC storm or outlook system
 * points the imagery at it: the satellite that sees it best, a full-disk
 * view containing it, GeoColor (works day and night) — see
 * stormSatelliteView. Fires once per selection, and again if the layer is
 * switched back on with a system still selected. Renders nothing.
 */

import { useEffect, useRef } from 'react';
import { useSatelliteContext } from '../../context/SatelliteContext';

const TROPICAL_TYPES = new Set(['nhc-storm', 'nhc-invest']);

export default function SatelliteStormFocus({ selected }) {
  const sat = useSatelliteContext();
  const active = Boolean(sat?.active);
  const focusOnStorm = sat?.focusOnStorm;
  const doneRef = useRef(null);

  const target = selected && TROPICAL_TYPES.has(selected.type)
    && Number.isFinite(selected.lng) && Number.isFinite(selected.lat) ? selected : null;
  const key = target ? `${target.id}|${target.lng}|${target.lat}` : null;

  useEffect(() => {
    if (!active) { doneRef.current = null; return; }
    if (!key || !focusOnStorm || doneRef.current === key) return;
    doneRef.current = key;
    focusOnStorm({ lng: target.lng, lat: target.lat });
  }, [active, key, focusOnStorm]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
