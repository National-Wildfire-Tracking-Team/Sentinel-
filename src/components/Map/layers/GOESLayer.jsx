/**
 * GOESLayer.jsx
 * GOES-East / GOES-West near real-time satellite imagery.
 * Layers stay mounted; visibility is controlled via layout property.
 */

import { Source, Layer } from 'react-map-gl';

const GOES_EAST_TILE =
  'https://services9.arcgis.com/RHVPKKiFTONKtxq3/ArcGIS/rest/services/GOES_East_GeoColor/MapServer/tile/{z}/{y}/{x}';
const GOES_WEST_TILE =
  'https://services9.arcgis.com/RHVPKKiFTONKtxq3/ArcGIS/rest/services/GOES_West_GeoColor/MapServer/tile/{z}/{y}/{x}';

export default function GOESLayer({ eastVisible, westVisible }) {
  const eastVis = eastVisible ? 'visible' : 'none';
  const westVis = westVisible ? 'visible' : 'none';

  return (
    <>
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
          layout={{ visibility: eastVis }}
          paint={{
            'raster-opacity': 0.5,
            'raster-resampling': 'linear',
            'raster-fade-duration': 300,
          }}
        />
      </Source>

      <Source
        id="goes-west"
        type="raster"
        tiles={[GOES_WEST_TILE]}
        tileSize={256}
        attribution="NOAA GOES-West via Esri"
      >
        <Layer
          id="goes-west-raster"
          type="raster"
          source="goes-west"
          layout={{ visibility: westVis }}
          paint={{
            'raster-opacity': 0.5,
            'raster-resampling': 'linear',
            'raster-fade-duration': 300,
          }}
        />
      </Source>
    </>
  );
}
