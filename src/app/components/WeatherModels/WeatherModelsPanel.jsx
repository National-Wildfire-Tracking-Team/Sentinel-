/**
 * WeatherModelsPanel.jsx
 * The sidebar body for the live map's Models tab: the point forecast for the
 * point the user clicked (or searched), following the map's model and valid
 * time. The map is the primary product; this is the detail for one place —
 * values at the selected hour, the HRRR/GFS comparison, the meteogram, and
 * where the data comes from.
 *
 * Everything here is model output. Observations (RAWS) and alerts (NWS/SPC)
 * live in the other tabs and are never blended in.
 */

import { Info, Loader2 } from 'lucide-react';
import { WEATHER_MODEL_SERVICE_URL } from '../../api/weatherModels';
import { useWeatherModelsContext } from '../../context/WeatherModelsContext';
import LocationPanel from './LocationPanel';
import Meteogram from './Meteogram';
import ModelComparison from './ModelComparison';
import ModelReadout from './ModelReadout';
import RunBadges, { RunNotices } from './RunBadges';
import { ROOT_VARS, entryAt } from './modelTheme';

function Section({ title, children }) {
  return (
    <section className="px-3 py-3 border-b border-sentinel-700">
      {title && <h3 className="mb-2 text-sm font-semibold text-white">{title}</h3>}
      {children}
    </section>
  );
}

function Status({ state, label }) {
  if (state.loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-sentinel-300">
        <Loader2 size={14} className="animate-spin" aria-hidden /> Loading the latest {label} run…
      </p>
    );
  }
  if (state.error) return <p role="alert" className="text-sm text-red-300">{label}: {state.error.message}</p>;
  return null;
}

export default function WeatherModelsPanel() {
  const wm = useWeatherModelsContext();
  if (!wm) return null;
  const { location, setLocation, mode: requestedMode, validTime, setValidTime, point } = wm;
  const { mode, inHrrr, hrrr, gfs, primary, forecast, shown } = point;
  const entry = entryAt(forecast, validTime);
  const series = shown.map((data) => ({ model: data.model.id, data }));

  return (
    // The sidebar is always dark, so its contents use the dark steps.
    <div className={`dark flex-1 overflow-y-auto ${ROOT_VARS}`}>
      <Section>
        <LocationPanel location={location} onChange={setLocation} />
        {!location && (
          <p className="mt-2 text-xs text-sentinel-300">Click the map to inspect a point; its full forecast appears here.</p>
        )}
        {location && !inHrrr && requestedMode !== 'gfs' && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-sentinel-200">
            <Info size={13} className="shrink-0 mt-0.5" aria-hidden />
            HRRR covers the continental U.S. only, so this location uses GFS.
          </p>
        )}
      </Section>

      {!WEATHER_MODEL_SERVICE_URL && (
        <Section title="Model forecasts aren't available here">
          <p className="text-sm text-sentinel-200">
            This build isn&apos;t connected to the Weather Models service (VITE_WEATHER_MODEL_SERVICE_URL).
          </p>
        </Section>
      )}

      {location && WEATHER_MODEL_SERVICE_URL && (
        <>
          <Section>
            {mode !== 'gfs' && <Status state={hrrr} label="HRRR" />}
            {mode !== 'hrrr' && <Status state={gfs} label="GFS" />}
            {mode === 'compare' && hrrr.data && gfs.data && validTime && (
              <div className="space-y-3">
                <RunNotices data={hrrr.data} />
                <RunNotices data={gfs.data} />
                <ModelComparison hrrr={hrrr.data} gfs={gfs.data} validTime={validTime} />
              </div>
            )}
            {mode !== 'compare' && primary.data && validTime && (
              <div className="space-y-4">
                <RunBadges data={primary.data} entry={entry} />
                <ModelReadout data={primary.data} entry={entry} />
              </div>
            )}
          </Section>

          {series.length > 0 && validTime && (mode !== 'compare' || series.length === 2) && (
            <Section title="Forecast">
              <Meteogram series={series} validTime={validTime} onSelect={setValidTime} />
            </Section>
          )}

          {shown.length > 0 && (
            <Section title="About this data">
              <div className="space-y-2 text-xs text-sentinel-200">
                <p>
                  These are <strong>numerical model forecasts</strong>, not observed conditions. For observations, use
                  RAWS stations; for official warnings, use NWS alerts in the Weather tab.
                </p>
                {shown.map((d) => (
                  <p key={d.model.id}>
                    <strong>{d.model.name}</strong> ({d.model.fullName}, {d.model.operator}), {d.model.resolution}.
                    Values are for the nearest grid cell, {d.gridPoint.distanceKm} km from this point.{' '}
                    {d.source.attribution} License {d.source.license}.
                  </p>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
