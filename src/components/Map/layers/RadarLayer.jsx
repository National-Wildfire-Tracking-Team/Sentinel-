/**
 * RadarLayer.jsx
 * NEXRAD Level II base reflectivity tiles.
 *
 * Primary source: local Python radar service processing NOAA NEXRAD Level II
 * AWS dataset (s3://noaa-nexrad-level2) — 256×256 RGBA PNG tiles.
 * Fallback: Iowa Environmental Mesonet WMS mosaic (n0q 900913).
 *
 * The tile URL contains a cache-bust token derived from the latest scan
 * timestamp so MapLibre GL automatically re-fetches tiles when new data
 * arrives without requiring a page reload.
 */

import { memo, useEffect, useRef } from 'react';
import { Source, Layer, useMap } from 'react-map-gl';
import { useNexradRadar } from '../../../hooks/useNexradRadar';

const RadarLayer = memo(function RadarLayer({ visible, opacity = 75, onStatusChange }) {
  const { tileUrl, scanTime, isServiceAvailable, isLoading, error } = useNexradRadar(visible);
  const { current: map } = useMap();
  const prevTileUrlRef = useRef(null);

  // Notify parent of status changes (scan time, availability)
  useEffect(() => {
    onStatusChange?.({ scanTime, isServiceAvailable, isLoading, error });
  }, [scanTime, isServiceAvailable, isLoading, error, onStatusChange]);

  // When the tile URL changes (new scan arrived), tell MapLibre to reload tiles.
  // We swap the source tiles array which triggers a re-fetch without unmounting.
  useEffect(() => {
    if (!map || !visible) return;
    if (prevTileUrlRef.current === tileUrl) return;
    prevTileUrlRef.current = tileUrl;

    const source = map.getSource('nexrad-radar');
    if (source && typeof source.setTiles === 'function') {
      source.setTiles([tileUrl]);
    }
  }, [map, tileUrl, visible]);

  const vis = visible ? 'visible' : 'none';
  const paintOpacity = Math.max(0, Math.min(100, opacity)) / 100;

  return (
    <Source
      id="nexrad-radar"
      type="raster"
      tiles={[tileUrl]}
      tileSize={256}
      attribution={
        isServiceAvailable
          ? 'NOAA NEXRAD Level II via Sentinel Radar Service'
          : 'NEXRAD Level 2 composite via Iowa Environmental Mesonet'
      }
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
