/**
 * GOESLayer.jsx
 * NOAA GOES-East / GOES-West imagery for the live map's Satellite layer.
 * What is drawn comes from SatelliteContext (satellite, region, product,
 * latest scan or loop frame); see api/goesSatellite.js for the sources.
 *
 * - Latest image: one raster source. Its key changes with the selection, so
 *   switching products unmounts the old source and Mapbox cancels its
 *   in-flight tiles. A new IEM scan changes only the tile URL's version, so
 *   the source reloads in place.
 * - Loop: one raster source per frame, mounted as playback reaches it (plus a
 *   few ahead) and kept while the loop is on, so later passes are instant.
 *   Frames not on screen draw at opacity 0, which still loads their tiles.
 */

import { memo, useEffect, useMemo, useState } from 'react';
import { Layer, Source, useMap } from 'react-map-gl';
import { useSatelliteContext } from '../../../context/SatelliteContext';
import { attributionFor, gibsTileUrl, iemTileUrl } from '../../../api/goesSatellite';

const PRELOAD_AHEAD = 3;
const SOURCE_PREFIX = 'goes-sat';

function liveTiles(source, version, satelliteId) {
  return source.kind === 'iem'
    ? iemTileUrl(source, version, satelliteId)
    : gibsTileUrl(source.layer, source.level, source.time);
}

function RasterSource({ id, tiles, maxzoom, attribution, opacity, fade }) {
  return (
    <Source id={id} type="raster" tiles={[tiles]} tileSize={256} maxzoom={maxzoom} attribution={attribution}>
      <Layer
        id={`${id}-raster`}
        type="raster"
        source={id}
        paint={{ 'raster-opacity': opacity, 'raster-resampling': 'linear', 'raster-fade-duration': fade }}
      />
    </Source>
  );
}

/** Map events for this layer's sources: tile failures, loading, and zooming to a picked region. */
function useSatelliteMapEvents(sat) {
  const { current } = useMap();
  const map = current?.getMap?.();
  const reportTileError = sat?.reportTileError;
  const setTilesLoading = sat?.setTilesLoading;

  useEffect(() => {
    if (!map || !reportTileError || !setTilesLoading) return undefined;
    const ours = (e) => typeof e?.sourceId === 'string' && e.sourceId.startsWith(SOURCE_PREFIX);
    const onError = (e) => { if (ours(e)) reportTileError(); };
    const onLoading = (e) => { if (ours(e)) setTilesLoading(true); };
    const onIdle = () => setTilesLoading(false);
    map.on('error', onError);
    map.on('sourcedataloading', onLoading);
    map.on('idle', onIdle);
    return () => {
      map.off('error', onError);
      map.off('sourcedataloading', onLoading);
      map.off('idle', onIdle);
      setTilesLoading(false);
    };
  }, [map, reportTileError, setTilesLoading]);

  const focusSeq = sat?.focus?.seq;
  useEffect(() => {
    const bounds = sat?.focus?.bounds;
    if (!map || !bounds) return;
    map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 40, duration: 800 });
  }, [map, focusSeq]); // eslint-disable-line react-hooks/exhaustive-deps
}

const GOESLayer = memo(function GOESLayer() {
  const sat = useSatelliteContext();
  useSatelliteMapEvents(sat);

  const { active, source, imageTime, frames = [], index = 0, live = true, opacity = 0.7, reloadKey = 0 } = sat ?? {};
  const satelliteId = sat?.satellite?.id;
  const looping = Boolean(active && source && !live && source.kind === 'gibs');

  // Loop frames to keep mounted: everything already shown this loop, plus the next few.
  const loopKey = looping ? `${source.layer}|${frames[0]?.id}|${frames.length}|${reloadKey}` : null;
  const [kept, setKept] = useState({ key: null, ids: [] });
  const mountedIds = useMemo(() => {
    if (!loopKey) return [];
    const ids = new Set(kept.key === loopKey ? kept.ids : []);
    for (let k = 0; k <= PRELOAD_AHEAD && k < frames.length; k += 1) ids.add(frames[(index + k) % frames.length].id);
    return [...ids];
  }, [loopKey, kept, frames, index]);
  useEffect(() => {
    if (!loopKey) return;
    if (kept.key !== loopKey || mountedIds.length !== kept.ids.length) setKept({ key: loopKey, ids: mountedIds });
  }, [loopKey, mountedIds, kept]);

  if (!active || !source) return null;
  const attribution = attributionFor(source);

  if (looping) {
    const current = frames[index]?.id;
    return frames
      .filter((f) => mountedIds.includes(f.id))
      .map((f) => (
        <RasterSource
          key={`${source.layer}-${f.id}-${reloadKey}`}
          id={`${SOURCE_PREFIX}-frame-${f.id}`}
          tiles={gibsTileUrl(source.layer, source.level, f.id)}
          maxzoom={source.level}
          attribution={attribution}
          opacity={f.id === current ? opacity : 0}
          fade={0}
        />
      ));
  }

  return (
    <RasterSource
      key={`${source.kind}-${source.service ?? ''}-${source.layer}-${reloadKey}`}
      id={`${SOURCE_PREFIX}-live`}
      tiles={liveTiles(source, imageTime, satelliteId)}
      maxzoom={source.kind === 'iem' ? 10 : source.level}
      attribution={attribution}
      opacity={opacity}
      fade={300}
    />
  );
});

export default GOESLayer;
