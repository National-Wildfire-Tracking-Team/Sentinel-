/**
 * GOESLayer.jsx
 * GOES-East / GOES-West near real-time satellite imagery via Iowa Environmental Mesonet WMS.
 * Visible band (ch02) layers for weather tab; ABI-L2-MCMIP Day Land Cloud Fire RGB
 * composites (sourced from s3://noaa-goes16 and s3://noaa-goes18) for wildfire tab.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

// ── Weather-tab visible-band layers (Channel 02, 0.64µm) ─────────────────────
const IEM_WMS_EAST =
  'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_east.cgi' +
  '?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=conus_ch02' +
  '&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857' +
  '&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}';

const IEM_WMS_WEST =
  'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_west.cgi' +
  '?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=conus_ch02' +
  '&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857' +
  '&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}';

// ── Wildfire-tab ABI-L2-MCMIP Day Land Cloud Fire RGB composites ─────────────
// Source data: s3://noaa-goes16/ABI-L2-MCMIPC and s3://noaa-goes18/ABI-L2-MCMIPC
// RGB recipe: Red=Band 6 (2.2µm), Green=Band 3 (0.86µm), Blue=Band 2 (0.64µm)
// Served via Iowa Environmental Mesonet which ingests from NOAA GOES S3 buckets.
const IEM_FIRE_RGB_GOES16 =
  'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_east.cgi' +
  '?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=conus_firetemp' +
  '&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857' +
  '&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}';

const IEM_FIRE_RGB_GOES18 =
  'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_west.cgi' +
  '?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=conus_firetemp' +
  '&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857' +
  '&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}';

const GOESLayer = memo(function GOESLayer({
  eastVisible,
  westVisible,
  fire16Visible,
  fire18Visible,
}) {
  const eastVis    = eastVisible    ? 'visible' : 'none';
  const westVis    = westVisible    ? 'visible' : 'none';
  const fire16Vis  = fire16Visible  ? 'visible' : 'none';
  const fire18Vis  = fire18Visible  ? 'visible' : 'none';

  return (
    <>
      {/* ── Weather tab: visible-band imagery ── */}
      <Source
        id="goes-east"
        type="raster"
        tiles={[IEM_WMS_EAST]}
        tileSize={256}
        attribution="NOAA GOES-East via Iowa Environmental Mesonet"
      >
        <Layer
          id="goes-east-raster"
          type="raster"
          source="goes-east"
          layout={{ visibility: eastVis }}
          paint={{
            'raster-opacity': 0.7,
            'raster-resampling': 'linear',
            'raster-fade-duration': 300,
          }}
        />
      </Source>

      <Source
        id="goes-west"
        type="raster"
        tiles={[IEM_WMS_WEST]}
        tileSize={256}
        attribution="NOAA GOES-West via Iowa Environmental Mesonet"
      >
        <Layer
          id="goes-west-raster"
          type="raster"
          source="goes-west"
          layout={{ visibility: westVis }}
          paint={{
            'raster-opacity': 0.7,
            'raster-resampling': 'linear',
            'raster-fade-duration': 300,
          }}
        />
      </Source>

      {/* ── Wildfire tab: ABI-L2-MCMIP Day Land Cloud Fire RGB ── */}
      <Source
        id="goes16-fire-rgb"
        type="raster"
        tiles={[IEM_FIRE_RGB_GOES16]}
        tileSize={256}
        attribution="NOAA GOES-16 ABI-L2-MCMIP (s3://noaa-goes16) via Iowa Environmental Mesonet"
      >
        <Layer
          id="goes16-fire-rgb-raster"
          type="raster"
          source="goes16-fire-rgb"
          layout={{ visibility: fire16Vis }}
          paint={{
            'raster-opacity': 0.75,
            'raster-resampling': 'linear',
            'raster-fade-duration': 300,
          }}
        />
      </Source>

      <Source
        id="goes18-fire-rgb"
        type="raster"
        tiles={[IEM_FIRE_RGB_GOES18]}
        tileSize={256}
        attribution="NOAA GOES-18 ABI-L2-MCMIP (s3://noaa-goes18) via Iowa Environmental Mesonet"
      >
        <Layer
          id="goes18-fire-rgb-raster"
          type="raster"
          source="goes18-fire-rgb"
          layout={{ visibility: fire18Vis }}
          paint={{
            'raster-opacity': 0.75,
            'raster-resampling': 'linear',
            'raster-fade-duration': 300,
          }}
        />
      </Source>
    </>
  );
});
export default GOESLayer;
