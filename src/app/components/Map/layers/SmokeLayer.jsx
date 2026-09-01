/**
 * SmokeLayer.jsx
 * Renders smoke forecast imagery from NOAA NOMADS HRRR-Smoke via WMS.
 * Layer stays mounted; visibility is controlled via layout property.
 */

import { useMemo, memo } from 'react';
import { Source, Layer } from 'react-map-gl';

const pad = (value) => String(value).padStart(2, '0');

const LAYER_MAP = {
  MASSDEN: 'massden8maboveground',
  COLMD: 'colmdentirelayer',
  EXTCOF55: 'extcof558maboveground',
};

const DEFAULT_VARIABLE = 'COLMD';
const DEFAULT_FORECAST_HOUR = 0;

function getLatestRunHour() {
  const nowUtcHour = new Date().getUTCHours();
  return Math.max(0, nowUtcHour - 1);
}

function getTodayUtcYmd() {
  const date = new Date();
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

function buildNomadsWmsUrl(runHour) {
  const ymd = getTodayUtcYmd();
  return `https://nomads.ncep.noaa.gov/dods/hrrr/hrrr${ymd}/hrrr_sfc.t${pad(runHour)}z/wms`;
}

const SmokeLayer = memo(function SmokeLayer({ visible }) {
  const vis = visible ? 'visible' : 'none';

  const tileUrl = useMemo(() => {
    const runHour = getLatestRunHour();
    const layerName = LAYER_MAP[DEFAULT_VARIABLE];
    const wmsUrl = buildNomadsWmsUrl(runHour);

    return `${wmsUrl}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap`
      + `&LAYERS=${layerName}`
      + '&STYLES=boxfill/rainbow'
      + '&COLORSCALERANGE=0,200'
      + '&BELOWMINCOLOR=transparent'
      + '&ABOVEMAXCOLOR=extend'
      + '&CRS=EPSG:3857'
      + '&BBOX={bbox-epsg-3857}'
      + '&WIDTH=256&HEIGHT=256'
      + '&FORMAT=image/png'
      + '&TRANSPARENT=true'
      + '&ELEVATION=0'
      + `&TIME=${pad(DEFAULT_FORECAST_HOUR)}`;
  }, []);

  return (
    <Source
      id="smoke-wms"
      type="raster"
      tiles={[tileUrl]}
      tileSize={256}
      attribution="NOAA NOMADS HRRR"
    >
      <Layer
        id="smoke-raster"
        type="raster"
        source="smoke-wms"
        layout={{ visibility: vis }}
        paint={{
          'raster-opacity': 0.7,
          'raster-resampling': 'linear',
          'raster-fade-duration': 300,
        }}
      />
    </Source>
  );
});
export default SmokeLayer;
