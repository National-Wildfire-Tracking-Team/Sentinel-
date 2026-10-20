/**
 * useFirstLabelLayerId.js
 * The basemap's first label layer id, kept current across style changes, so
 * raster overlays can sit beneath place names (see utils/mapLabels.js).
 */

import { useEffect, useState } from 'react';
import { useMap } from 'react-map-gl';
import { firstLabelLayer } from '../utils/mapLabels';

export function useFirstLabelLayerId() {
  const { current } = useMap();
  const [beforeId, setBeforeId] = useState(undefined);
  useEffect(() => {
    const map = current?.getMap();
    if (!map) return undefined;
    const update = () => setBeforeId(firstLabelLayer(map));
    if (map.isStyleLoaded()) update();
    map.on('styledata', update);
    return () => map.off('styledata', update);
  }, [current]);
  return beforeId;
}
