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

// NOMADS typically publishes a run ~1h40m-2h after its nominal hour, and
// `nowUtcHour - 1` alone isn't enough of a lag — right after each UTC hour
// rolls over (and especially right after UTC midnight, where a naive
// `max(0, hour - 1)` clamps to 0 instead of wrapping to the previous day's
// 23z run) it can point at a run that isn't published yet, producing a WMS
// 404. Lag by 2 hours and roll the date back when the hour goes negative.
const RUN_LAG_HOURS = 2;

function getLatestRunDateAndHour() {
  const lagged = new Date(Date.now() - RUN_LAG_HOURS * 60 * 60 * 1000);
  return {
    ymd: `${lagged.getUTCFullYear()}${pad(lagged.getUTCMonth() + 1)}${pad(lagged.getUTCDate())}`,
    runHour: lagged.getUTCHours(),
  };
}

function buildNomadsWmsUrl(ymd, runHour) {
  return `https://nomads.ncep.noaa.gov/dods/hrrr/hrrr${ymd}/hrrr_sfc.t${pad(runHour)}z/wms`;
}

const SmokeLayer = memo(function SmokeLayer({ visible }) {
  const vis = visible ? 'visible' : 'none';

  const tileUrl = useMemo(() => {
    const { ymd, runHour } = getLatestRunDateAndHour();
    const layerName = LAYER_MAP[DEFAULT_VARIABLE];
    const wmsUrl = buildNomadsWmsUrl(ymd, runHour);

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
      maxzoom={10}
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
