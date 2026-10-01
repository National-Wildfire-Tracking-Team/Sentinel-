/**
 * ModelFieldLayer.jsx
 * One model field drawn across the map: an image source (a Web Mercator
 * frame from the field builder) coloured in the GPU by `raster-color`.
 * Changing `url` swaps the texture in place (react-map-gl → updateImage), so
 * stepping through forecast hours never tears the layer down.
 *
 * The layer goes beneath the basemap's first label layer so place names stay
 * readable over the field.
 */

import { useEffect, useMemo, useState } from 'react';
import { Layer, Source, useMap } from 'react-map-gl';

function firstLabelLayer(map) {
  try {
    return map.getStyle()?.layers?.find((l) => l.type === 'symbol')?.id;
  } catch {
    return undefined;
  }
}

export default function ModelFieldLayer({ id, url, coordinates, paint }) {
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

  // Stable identity: a new coordinates array would make react-map-gl re-send it every render.
  const coordsKey = JSON.stringify(coordinates);
  const coords = useMemo(() => JSON.parse(coordsKey), [coordsKey]);

  if (!url) return null;
  return (
    <Source id={`${id}-src`} type="image" url={url} coordinates={coords}>
      <Layer id={id} type="raster" paint={paint} beforeId={beforeId} />
    </Source>
  );
}
