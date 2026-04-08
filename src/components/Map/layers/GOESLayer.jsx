/**
 * GOESLayer.jsx
 * GOES-East near real-time satellite imagery.
 * Layer stays mounted; visibility is controlled via layout property.
 */

import { Source, Layer } from 'react-map-gl';

const GOES_EAST_TILE =
  'https://services9.arcgis.com/RHVPKKiFTONKtxq3/ArcGIS/rest/services/GOES_East_GeoColor/MapServer/tile/{z}/{y}/{x}';

export default function GOESLayer({ visible }) {
  const vis = visible ? 'visible' : 'none';

  return (
    <Source
      id="goes-east"
      type="raster"
      tiles={[GOES_EAST_TILE]}
      tileSize={256}
      attribution="NOAA GOES-East via Esri"
    >
      <Layer
        id="goes-east-raster"
        type="raster"
        source="goes-east"
        layout={{ visibility: vis }}
        paint={{
          'raster-opacity': 0.5,
          'raster-resampling': 'linear',
          'raster-fade-duration': 300,
        }}
      />
    </Source>
  );
}
