/**
 * WfpiLayer.jsx
 * USGS Wildland Fire Potential Index forecast (Wildfire and All Hazards
 * tabs): USGS's own rendering of the chosen forecast day as WMS tiles through
 * the edge proxy, beneath the basemap labels. Day changes remount the source
 * (react-map-gl can't swap a raster source's tiles in place).
 */

import { Layer, Source } from 'react-map-gl';
import { useFireDangerContext } from '../../../context/FireDangerContext';
import { WFPI_BOUNDS, wfpiTileUrl } from '../../../api/fireDanger/wfpi';
import { useFirstLabelLayerId } from '../../../hooks/useFirstLabelLayerId';

export default function WfpiLayer() {
  const fd = useFireDangerContext();
  const beforeId = useFirstLabelLayerId();

  if (!fd?.wfpiOn) return null;
  const { day } = fd.wfpi;
  return (
    <Source key={`wfpi-${day}`} id={`usgs-wfpi-${day}`} type="raster" tiles={[wfpiTileUrl(day)]} tileSize={256} bounds={WFPI_BOUNDS} minzoom={3} maxzoom={12}>
      <Layer
        id={`usgs-wfpi-${day}-raster`}
        type="raster"
        beforeId={beforeId}
        paint={{ 'raster-opacity': fd.opacity.wfpi, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 }}
      />
    </Source>
  );
}
