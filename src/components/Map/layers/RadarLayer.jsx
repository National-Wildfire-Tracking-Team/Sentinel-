/**
 * RadarLayer.jsx
 * NEXRAD Level II base reflectivity tiles.
 *
 * Source: https://registry.opendata.aws/noaa-nexrad/
 * Data processed by the Python radar service from NOAA NEXRAD Level II
 * AWS dataset (s3://noaa-nexrad-level2) — 256×256 RGBA PNG tiles.
 *
 * The tile URL contains a cache-bust token derived from the latest scan
 * timestamp so MapLibre GL automatically re-fetches tiles when new data
 * arrives without requiring a page reload.
 * When the radar service is unavailable the layer is hidden (no fallback).
 */

import { memo, useEffect, useRef } from 'react';
import { Source, Layer, useMap } from 'react-map-gl';
import { useNexradRadar } from '../../../hooks/useNexradRadar';

const ATTRIBUTION = 'NOAA NEXRAD Level II — registry.opendata.aws/noaa-nexrad';

const RadarLayer = memo(function RadarLayer({ visible, opacity = 75, onStatusChange }) {
  const { tileUrl, scanTime, isServiceAvailable, isLoading, error } = useNexradRadar(visible);
  const { current: map } = useMap();
  const prevTileUrlRef = useRef(null);

  // Notify parent of status changes (scan time, availability)
  useEffect(() => {
    onStatusChange?.({ scanTime, isServiceAvailable, isLoading, error });
  }, [scanTime, isServiceAvailable, isLoading, error, onStatusChange]);

  // When the tile URL changes (new scan arrived), tell MapLibre to reload tiles.
  useEffect(() => {
    if (!map || !visible || !tileUrl) return;
    if (prevTileUrlRef.current === tileUrl) return;
    prevTileUrlRef.current = tileUrl;

    const source = map.getSource('nexrad-radar');
    if (source && typeof source.setTiles === 'function') {
      source.setTiles([tileUrl]);
    }
  }, [map, tileUrl, visible]);

  // Hide the layer when the service is unavailable — no IEM fallback
  const vis = (visible && isServiceAvailable && tileUrl) ? 'visible' : 'none';
  const paintOpacity = Math.max(0, Math.min(100, opacity)) / 100;

  // Render a placeholder source when tileUrl is null so the source/layer IDs
  // remain stable in the MapLibre style; tiles simply won't load.
  const tiles = tileUrl ? [tileUrl] : ['about:blank'];

  return (
    <Source
      id="nexrad-radar"
      type="raster"
      tiles={tiles}
      tileSize={256}
      attribution={ATTRIBUTION}
      minzoom={2}
      maxzoom={12}
    >
      <Layer
        id="nexrad-radar-raster"
        type="raster"
        source="nexrad-radar"
        layout={{ visibility: vis }}
        paint={{
          'raster-opacity': paintOpacity,
          'raster-resampling': 'linear',
          'raster-fade-duration': 400,
        }}
      />
    </Source>
  );
});

export default RadarLayer;
