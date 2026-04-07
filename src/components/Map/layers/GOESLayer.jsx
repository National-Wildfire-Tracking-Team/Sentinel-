/**
 * GOESLayer.jsx
 * GOES-East / GOES-West near real-time satellite imagery.
 * Provided by Iowa Environmental Mesonet (IEM) GOES WMS – no key required.
 */

import { Source, Layer } from 'react-map-gl/maplibre';

// GOES-West visible channel via Iowa Mesonet WMS
const GOES_WMS_BASE =
  'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes/conus_ir.cgi';

const goesRasterLayer = {
  id: 'goes-raster',
  type: 'raster',
  source: 'goes-wms',
  paint: {
    'raster-opacity': 0.55,
    'raster-resampling': 'linear',
    'raster-fade-duration': 300,
  },
};

export default function GOESLayer({ visible }) {
  if (!visible) return null;

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
      <Layer {...goesRasterLayer} />
    </Source>
  );
}
