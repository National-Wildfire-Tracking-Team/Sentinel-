/**
 * ModelForecastSummary.jsx
 * A compact model-forecast entry point for other parts of Sentinel (the
 * incident panel today). It shows the current hour from one model and
 * opens the live map's Models tab on this location; it is deliberately not
 * the full experience.
 *
 * Renders nothing when the service isn't configured or has no data, so a
 * missing forecast never gets in the way of incident information.
 */

import { Link } from 'react-router-dom';
import { CloudSun, Navigation2 } from 'lucide-react';
import { WEATHER_MODEL_SERVICE_URL } from '../../api/weatherModels';
import { useModelForecast } from '../../hooks/useModelForecast';
import { useWeatherModelsContext } from '../../context/WeatherModelsContext';
import { modelsHref } from '../../utils/weatherModelsLink';
import { compassPoint, localTime, nowIndex, zulu } from './modelTheme';
import { ModelChip } from './RunBadges';

export default function ModelForecastSummary({ lat, lon, place }) {
  const enabled = Boolean(WEATHER_MODEL_SERVICE_URL) && Number.isFinite(lat) && Number.isFinite(lon);
  // auto: HRRR inside CONUS, GFS elsewhere. The chip shows which one answered.
  const { data } = useModelForecast({ model: enabled ? 'auto' : null, lat, lon });
  const models = useWeatherModelsContext();
  if (!enabled || !data?.forecast?.length) return null;

  const entry = data.forecast[nowIndex(data.forecast)];
  const u = data.units;
  const target = { lat, lon, place, model: data.model.id };

  return (
    <div className="mb-4 rounded-lg border border-dashed border-sentinel-600 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="flex items-center gap-1.5 text-xs text-sentinel-300">
          <CloudSun size={13} className="text-sky-400" aria-hidden />
          Model forecast <ModelChip model={data.model} size="sm" />
        </span>
        <span className="text-[11px] text-sentinel-400 tabular-nums" title={`Run ${data.run.runTime}, valid ${entry.validTime}`}>
          Run {zulu(data.run.runTime)} · valid {localTime(entry.validTime)}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums text-white">
        {entry.windSpeed != null && (
          <span className="inline-flex items-center gap-1">
            {entry.windDirection != null && <Navigation2 size={12} aria-hidden style={{ transform: `rotate(${entry.windDirection + 180}deg)` }} />}
            {Math.round(entry.windSpeed)} {u.windSpeed}
            {compassPoint(entry.windDirection) && <span className="text-sentinel-400">{compassPoint(entry.windDirection)}</span>}
            {entry.windGust != null && <span className="text-sentinel-400">gusts {Math.round(entry.windGust)}</span>}
          </span>
        )}
        {entry.relativeHumidity != null && <span>RH {entry.relativeHumidity}{u.relativeHumidity}</span>}
        {entry.temperature != null && <span>{Math.round(entry.temperature)}{u.temperature}</span>}
      </div>
      {data.run.stale && <p className="mt-1 text-[11px] text-amber-300">This run is older than usual.</p>}
      <Link
        to={modelsHref(target)}
        onClick={(e) => {
          // On the live map, switch to the Models tab in place.
          if (models) {
            e.preventDefault();
            models.open(target);
          }
        }}
        className="mt-2 inline-block text-xs font-semibold text-sky-400 hover:text-sky-300 underline-offset-2 hover:underline"
      >
        Open in Models
      </Link>
    </div>
  );
}
