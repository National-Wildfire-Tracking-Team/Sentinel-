/**
 * SmokeLayer.jsx
 * Renders smoke/AQI forecast imagery from NOAA HRRR-Smoke via WMS.
 * Layer stays mounted; visibility is controlled via layout property.
 */

import { Source, Layer } from 'react-map-gl';

const SMOKE_WMS_URL =
  'https://mesonet.agron.iastate.edu/cgi-bin/wms/smoke/smoke.cgi';

export default function SmokeLayer({ visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source
      id="smoke-wms"
      type="raster"
      tiles={[
        `${SMOKE_WMS_URL}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap` +
        `&LAYERS=smoke_col_mass&FORMAT=image/png&TRANSPARENT=true` +
        `&SRS=EPSG:3857&WIDTH=256&HEIGHT=256` +
        `&BBOX={bbox-epsg-3857}`,
      ]}
      tileSize={256}
      attribution="NOAA HRRR-Smoke via Iowa Environmental Mesonet"
    >
      <Layer
        id="smoke-raster"
        type="raster"
        source="smoke-wms"
        layout={{ visibility: vis }}
        paint={{
          'raster-opacity': 0.6,
          'raster-resampling': 'linear',
          'raster-fade-duration': 300,
        }}
      />
    </Source>
  );
}
