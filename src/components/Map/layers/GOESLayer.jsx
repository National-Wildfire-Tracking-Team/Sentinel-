/**
 * GOESLayer.jsx
 * GOES-East / GOES-West near real-time satellite imagery.
 * Layer stays mounted; visibility is controlled via layout property.
 */

import { Source, Layer } from 'react-map-gl';

const GOES_WMS_BASE =
  'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes/conus_ir.cgi';

export default function GOESLayer({ visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source
      id="goes-wms"
      type="raster"
      tiles={[
        `${GOES_WMS_BASE}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap` +
        `&LAYERS=goes_conus_ir&FORMAT=image/png&TRANSPARENT=true` +
        `&SRS=EPSG:3857&WIDTH=256&HEIGHT=256` +
        `&BBOX={bbox-epsg-3857}`,
      ]}
      tileSize={256}
      attribution="NOAA GOES via Iowa Environmental Mesonet"
    >
      <Layer
        id="goes-raster"
        type="raster"
        source="goes-wms"
        layout={{ visibility: vis }}
        paint={{
          'raster-opacity': 0.55,
          'raster-resampling': 'linear',
          'raster-fade-duration': 300,
        }}
      />
    </Source>
  );
}
