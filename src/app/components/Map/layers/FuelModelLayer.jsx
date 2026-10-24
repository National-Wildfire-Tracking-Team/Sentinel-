/**
 * FuelModelLayer.jsx
 * LANDFIRE FBFM40 fuel models (Wildfire and All Hazards tabs): one raster
 * tile source per region (CONUS, Alaska, Hawaii), drawn by the LANDFIRE
 * ImageServer in its own legend colours. NoData is transparent. `bounds`
 * keeps each source from requesting tiles outside its region, and the map's
 * tile cache means panning back never re-requests a tile.
 *
 * Mounted only while the layer is on, beneath the basemap labels so place
 * names stay readable.
 */

import { Layer, Source } from 'react-map-gl';
import { useFireDangerContext } from '../../../context/FireDangerContext';
import { LANDFIRE_FBFM40_SERVICES, landfireTileUrl } from '../../../api/fireDanger/landfireFuels';
import { useFirstLabelLayerId } from '../../../hooks/useFirstLabelLayerId';

export const FUEL_MODEL_LAYER_PREFIX = 'landfire-fbfm40-';


export default function FuelModelLayer() {
  const fd = useFireDangerContext();
  const beforeId = useFirstLabelLayerId();
  if (!fd?.fuelsOn) return null;

  return LANDFIRE_FBFM40_SERVICES.map((service) => (
    <Source
      key={service.id}
      id={`${FUEL_MODEL_LAYER_PREFIX}${service.id}`}
      type="raster"
      tiles={[landfireTileUrl(service)]}
      tileSize={256}
      bounds={service.bounds}
      minzoom={3}
      maxzoom={16}
    >
      <Layer
        id={`${FUEL_MODEL_LAYER_PREFIX}${service.id}-raster`}
        type="raster"
        beforeId={beforeId}
        paint={{
          'raster-opacity': fd.opacity.fuels,
          // Categorical data: never blend neighbouring fuel models into a colour that isn't in the legend.
          'raster-resampling': 'nearest',
          'raster-fade-duration': 0,
        }}
      />
    </Source>
  ));
}
