/**
 * RadarLayer.jsx
 * NEXRAD Level 2 base reflectivity composite via Iowa Environmental Mesonet WMS.
 * Uses the national NEXRAD mosaic (N0Q product — 0.5 deg base reflectivity)
 * sourced from NEXRAD Level 2 radar data across all WSR-88D stations.
 * Layer stays mounted; visibility is controlled via layout property.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

// IEM NEXRAD composite reflectivity (N0Q) — all CONUS WSR-88D stations
const IEM_NEXRAD_WMS =
  'https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi' +
  '?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=nexrad-n0q-900913' +
  '&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857' +
  '&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}';

const RadarLayer = memo(function RadarLayer({ visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source
      id="nexrad-radar"
      type="raster"
      tiles={[IEM_NEXRAD_WMS]}
      tileSize={256}
      attribution="NEXRAD Level 2 via Iowa Environmental Mesonet"
    >
      <Layer
        id="nexrad-radar-raster"
        type="raster"
        source="nexrad-radar"
        layout={{ visibility: vis }}
        paint={{
          'raster-opacity': 0.75,
          'raster-resampling': 'linear',
          'raster-fade-duration': 300,
        }}
      />
    </Source>
  );
});
export default RadarLayer;
