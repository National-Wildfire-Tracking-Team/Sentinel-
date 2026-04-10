/**
 * GOESLayer.jsx
 * GOES-East / GOES-West near real-time satellite imagery via Iowa Environmental Mesonet WMS.
 * Uses GOES visible band (channel 02, 0.64µm) for each satellite independently.
 * Layers stay mounted; visibility is controlled via layout property.
 */

import { Source, Layer } from 'react-map-gl';

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

export default function GOESLayer({ eastVisible, westVisible }) {
  const eastVis = eastVisible ? 'visible' : 'none';
  const westVis = westVisible ? 'visible' : 'none';

  return (
    <>
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
    </>
  );
}
