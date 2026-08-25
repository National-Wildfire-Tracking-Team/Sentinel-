/**
 * NexradScanLayer.jsx
 * Renders a live-rasterized NEXRAD Level II sweep (reflectivity or velocity)
 * as a georeferenced image on the map, for whichever radar site is currently
 * selected. The rasterization itself happens in src/utils/radarRaster.js.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const NexradScanLayer = memo(function NexradScanLayer({ dataUrl, coordinates, visible }) {
  if (!visible || !dataUrl || !coordinates) return null;

  return (
    <Source id="nexrad-scan" type="image" url={dataUrl} coordinates={coordinates}>
      <Layer
        id="nexrad-scan-raster"
        type="raster"
        paint={{
          'raster-opacity': 0.85,
          'raster-fade-duration': 300,
          'raster-resampling': 'linear',
        }}
      />
    </Source>
  );
});

export default NexradScanLayer;
