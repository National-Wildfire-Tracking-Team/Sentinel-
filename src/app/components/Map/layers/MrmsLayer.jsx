/**
 * MrmsLayer.jsx
 * NOAA MRMS radar on the live map (Weather tab): the selected product's
 * frame, drawn the same way as the Models tab's fields: a Web Mercator image
 * source coloured on the GPU by `raster-color`, beneath the basemap labels
 * (ModelFieldLayer). Stepping frames swaps the image in place.
 *
 * Resolution: the light frames while animating or zoomed out, the ~1.7 km
 * ones when paused at zoom ≥ 5. The next frames are pre-fetched while playing.
 */

import { useEffect, useMemo, useState } from 'react';
import { useMap } from 'react-map-gl';
import { useMrmsContext } from '../../../context/MrmsContext';
import { mrmsBase, mrmsFrameUrl } from '../../../api/mrms';
import { rasterPaint } from '../../../api/modelFields';
import { usePreloadFrames } from '../../../hooks/usePreloadFrames';
import ModelFieldLayer from '../../WeatherModels/ModelFieldLayer';

const HI_RES_ZOOM = 5;
const PRELOAD_AHEAD = 4;

function useZoom() {
  const { current } = useMap();
  const [zoom, setZoom] = useState(() => current?.getZoom() ?? 3);
  useEffect(() => {
    const map = current?.getMap();
    if (!map) return undefined;
    const onZoom = () => setZoom(map.getZoom());
    map.on('zoomend', onZoom);
    return () => map.off('zoomend', onZoom);
  }, [current]);
  return zoom;
}

export default function MrmsLayer() {
  const mrms = useMrmsContext();
  const zoom = useZoom();
  const base = mrmsBase();
  const { active, manifest, product, spec, frames, frame, index, playing, opacity } = mrms ?? {};

  const paint = useMemo(() => (spec ? rasterPaint(spec, opacity) : null), [spec, opacity]);

  const upcoming = useMemo(() => {
    if (!active || !playing || !manifest || !base) return [];
    return Array.from({ length: Math.min(PRELOAD_AHEAD, frames.length - 1) }, (_, k) => frames[(index + 1 + k) % frames.length])
      .map((f) => mrmsFrameUrl(base, manifest, product, f.id, 'lo'));
  }, [active, playing, manifest, base, frames, index, product]);
  usePreloadFrames(upcoming);

  if (!active || !manifest || !spec || !frame || !paint || !base) return null;
  const res = !playing && zoom >= HI_RES_ZOOM ? 'hi' : 'lo';
  return (
    // key: remount on product change (react-map-gl can't swap a mounted source's identity cleanly)
    <ModelFieldLayer
      key={`mrms-${product}`}
      id="mrms-field"
      url={mrmsFrameUrl(base, manifest, product, frame.id, res)}
      coordinates={manifest.image.coordinates}
      paint={paint}
    />
  );
}
