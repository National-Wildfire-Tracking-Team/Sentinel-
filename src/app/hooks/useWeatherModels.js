/**
 * useWeatherModels.js
 * Everything the Models tab shows for one location and mode, derived in one
 * place: the catalog (HRRR coverage), which mode actually applies (outside
 * CONUS only GFS has data), each model's forecast, and the timeline's axis.
 */

import { useMemo } from 'react';
import { useModelCatalog, useModelForecast } from './useModelForecast';
import { insidePolygon } from '../components/WeatherModels/modelTheme';

export const MODEL_MODES = ['hrrr', 'gfs', 'compare'];

/** Everything the point API offers, so inspection can show any map variable. */
export const POINT_VARIABLES = [
  'temperature', 'dewPoint', 'relativeHumidity', 'windSpeed', 'windDirection', 'windGust',
  'precipitationRate', 'precipitationAmount', 'pressureSurface', 'pressureMsl', 'cloudCover', 'compositeReflectivity',
];

/**
 * @param {{ location: {lat:number, lon:number}|null, requestedMode: string, active: boolean }} args
 */
export function useWeatherModels({ location, requestedMode, active }) {
  const { catalog, error: catalogError } = useModelCatalog(active);
  const hrrrCoverage = catalog?.models?.find((m) => m.id === 'hrrr')?.coverage ?? null;
  // Wait for HRRR's coverage before asking HRRR, so a point outside CONUS
  // goes straight to GFS instead of costing a request that can only fail.
  const coverageKnown = Boolean(catalog || catalogError);
  const inHrrr = location ? insidePolygon(hrrrCoverage, location.lat, location.lon) : true;
  const mode = inHrrr ? requestedMode : 'gfs';

  const want = (id) => active && location && (mode === id || mode === 'compare');
  const hrrr = useModelForecast({
    model: want('hrrr') && coverageKnown ? 'hrrr' : null, lat: location?.lat, lon: location?.lon, variables: POINT_VARIABLES,
  });
  const gfs = useModelForecast({ model: want('gfs') ? 'gfs' : null, lat: location?.lat, lon: location?.lon, variables: POINT_VARIABLES });
  const primary = mode === 'gfs' ? gfs : hrrr;

  const shown = useMemo(
    () => [mode !== 'gfs' && hrrr.data, mode !== 'hrrr' && gfs.data].filter(Boolean),
    [mode, hrrr.data, gfs.data],
  );

  const forecast = primary.data?.forecast;
  return useMemo(() => ({
    catalog, hrrrCoverage, inHrrr, mode, hrrr, gfs, primary, forecast: forecast ?? [], shown,
  }), [catalog, hrrrCoverage, inHrrr, mode, hrrr, gfs, primary, forecast, shown]);
}
