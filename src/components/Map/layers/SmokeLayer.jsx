/**
 * SmokeLayer.jsx
 * Renders smoke/AQI forecast imagery from NOAA HRRR-Smoke via WMS.
 * The Iowa Environmental Mesonet provides a convenient proxy WMS.
 *
 * Note: WMS raster layers add latency – disabled by default.
 */

import { Source, Layer } from 'react-map-gl/maplibre';

// NOAA HRRR-Smoke near-surface smoke forecast WMS
// Provided via Iowa Environmental Mesonet
const SMOKE_WMS_URL =
  'https://mesonet.agron.iastate.edu/cgi-bin/wms/smoke/smoke.cgi';

const smokeRasterLayer = {
  id: 'smoke-raster',
  type: 'raster',
  source: 'smoke-wms',
  paint: {
    'raster-opacity': 0.6,
    'raster-resampling': 'linear',
    'raster-fade-duration': 300,
  },
};

export default function SmokeLayer({ visible }) {
  if (!visible) return null;

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
      <Layer {...smokeRasterLayer} />
    </Source>
  );
}
