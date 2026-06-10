/**
 * GOESLayer.jsx
 * GOES-East / GOES-West near real-time satellite imagery via Iowa Environmental Mesonet WMS.
 * Visible band (ch02) layers for weather tab; ABI-L2-MCMIP Day Land Cloud Fire RGB
 * composites for wildfire tab.
 *
 * Tile endpoints are configurable via Vite env vars so deployments can point
 * to a GOES-DL-backed tile service when desired.
 */

import { memo } from 'react';
import { Source, Layer } from 'react-map-gl';

// ── Weather-tab visible-band layers (Channel 02, 0.64µm) ─────────────────────
const DEFAULT_IEM_WMS_EAST_VISIBLE =
  'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_east.cgi' +
  '?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=conus_ch02' +
  '&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857' +
  '&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}';

const DEFAULT_IEM_WMS_WEST_VISIBLE =
  'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_west.cgi' +
  '?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=conus_ch02' +
  '&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857' +
  '&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}';

// ── Wildfire-tab ABI-L2-MCMIP Day Land Cloud Fire RGB composites ─────────────
// Source data: GOES-East/West ABI-L2-MCMIP.
// RGB recipe: Red=Band 6 (2.2µm), Green=Band 3 (0.86µm), Blue=Band 2 (0.64µm)
const DEFAULT_IEM_FIRE_RGB_EAST =
  'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_east.cgi' +
  '?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=conus_firetemp' +
  '&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857' +
  '&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}';

const DEFAULT_IEM_FIRE_RGB_WEST =
  'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_west.cgi' +
  '?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=conus_firetemp' +
  '&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857' +
  '&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}';

const envOr = (value, fallback) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
};

const GOES_EAST_VISIBLE_TILE_URL = envOr(
  import.meta.env.VITE_GOES_EAST_VISIBLE_TILE_URL,
  DEFAULT_IEM_WMS_EAST_VISIBLE
);
const GOES_WEST_VISIBLE_TILE_URL = envOr(
  import.meta.env.VITE_GOES_WEST_VISIBLE_TILE_URL,
  DEFAULT_IEM_WMS_WEST_VISIBLE
);
const GOES_EAST_FIRE_RGB_TILE_URL = envOr(
  import.meta.env.VITE_GOES_EAST_FIRE_RGB_TILE_URL,
  DEFAULT_IEM_FIRE_RGB_EAST
);
const GOES_WEST_FIRE_RGB_TILE_URL = envOr(
  import.meta.env.VITE_GOES_WEST_FIRE_RGB_TILE_URL,
  DEFAULT_IEM_FIRE_RGB_WEST
);

const GOES_EAST_ATTRIBUTION = envOr(
  import.meta.env.VITE_GOES_EAST_ATTRIBUTION,
  'NOAA GOES-East via Iowa Environmental Mesonet'
);
const GOES_WEST_ATTRIBUTION = envOr(
  import.meta.env.VITE_GOES_WEST_ATTRIBUTION,
  'NOAA GOES-West via Iowa Environmental Mesonet'
);
const GOES_EAST_FIRE_ATTRIBUTION = envOr(
  import.meta.env.VITE_GOES_EAST_FIRE_ATTRIBUTION,
  'NOAA GOES-East ABI-L2-MCMIP Day Land Cloud Fire RGB via Iowa Environmental Mesonet'
);
const GOES_WEST_FIRE_ATTRIBUTION = envOr(
  import.meta.env.VITE_GOES_WEST_FIRE_ATTRIBUTION,
  'NOAA GOES-West ABI-L2-MCMIP Day Land Cloud Fire RGB via Iowa Environmental Mesonet'
);

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
        tiles={[GOES_EAST_VISIBLE_TILE_URL]}
        tileSize={256}
        attribution={GOES_EAST_ATTRIBUTION}
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
        tiles={[GOES_WEST_VISIBLE_TILE_URL]}
        tileSize={256}
        attribution={GOES_WEST_ATTRIBUTION}
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
        tiles={[GOES_EAST_FIRE_RGB_TILE_URL]}
        tileSize={256}
        attribution={GOES_EAST_FIRE_ATTRIBUTION}
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
        tiles={[GOES_WEST_FIRE_RGB_TILE_URL]}
        tileSize={256}
        attribution={GOES_WEST_FIRE_ATTRIBUTION}
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
