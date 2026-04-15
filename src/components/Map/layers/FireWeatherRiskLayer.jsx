/**
 * FireWeatherRiskLayer.jsx
 * Heuristic fire-weather risk overlay composed from HRRR RH + wind WMS tiles.
 * Uses a same-origin proxy endpoint to avoid NOAA NOMADS CORS failures.
 */

import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl';

const pad = (value) => String(value).padStart(2, '0');

function getLatestRunHour() {
  const nowUtcHour = new Date().getUTCHours();
  return Math.max(0, nowUtcHour - 1);
}

function getTodayUtcYmd() {
  const date = new Date();
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

function buildBaseProxyPath() {
  const runHour = getLatestRunHour();
  const ymd = getTodayUtcYmd();
  return `/api/noaa-wms/dods/hrrr/hrrr${ymd}/hrrr_sfc.t${pad(runHour)}z/wms`;
}

function buildWmsTileUrl({ layerName, colorScaleRange, style = 'boxfill/rainbow', alpha = true }) {
  const base = buildBaseProxyPath();
  return `${base}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap`
    + `&LAYERS=${layerName}`
    + `&STYLES=${encodeURIComponent(style)}`
    + `&COLORSCALERANGE=${colorScaleRange}`
    + '&BELOWMINCOLOR=transparent'
    + '&ABOVEMAXCOLOR=extend'
    + '&CRS=EPSG:3857'
    + '&BBOX={bbox-epsg-3857}'
    + '&WIDTH=256&HEIGHT=256'
    + '&FORMAT=image/png'
    + `&TRANSPARENT=${alpha ? 'true' : 'false'}`
    + '&ELEVATION=0'
    + '&TIME=00';
}

export default function FireWeatherRiskLayer({ visible }) {
  const vis = visible ? 'visible' : 'none';

  const rhTileUrl = useMemo(
    () => buildWmsTileUrl({
      layerName: 'rh2maboveground',
      colorScaleRange: '10,50',
      style: 'boxfill/wgrryr',
    }),
    []
  );

  const windTileUrl = useMemo(
    () => buildWmsTileUrl({
      layerName: 'wind10maboveground',
      colorScaleRange: '10,45',
      style: 'boxfill/occam',
    }),
    []
  );

  return (
    <>
      <Source
        id="fire-weather-risk-rh"
        type="raster"
        tiles={[rhTileUrl]}
        tileSize={256}
        attribution="NOAA HRRR via Sentinel NOAA proxy"
      >
        <Layer
          id="fire-weather-risk-rh-raster"
          type="raster"
          source="fire-weather-risk-rh"
          layout={{ visibility: vis }}
          paint={{
            'raster-opacity': 0.62,
            'raster-resampling': 'linear',
            'raster-fade-duration': 300,
          }}
        />
      </Source>

      <Source
        id="fire-weather-risk-wind"
        type="raster"
        tiles={[windTileUrl]}
        tileSize={256}
        attribution="NOAA HRRR via Sentinel NOAA proxy"
      >
        <Layer
          id="fire-weather-risk-wind-raster"
          type="raster"
          source="fire-weather-risk-wind"
          layout={{ visibility: vis }}
          paint={{
            'raster-opacity': 0.38,
            'raster-resampling': 'linear',
            'raster-fade-duration': 300,
          }}
        />
      </Source>
    </>
  );
}
