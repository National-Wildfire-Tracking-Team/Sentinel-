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
 *
 * HAFS has no point forecast here: for it, the panel describes the storm
 * run on the map and where it comes from.
 */

import { Info, Loader2 } from 'lucide-react';
import { WEATHER_MODEL_SERVICE_URL } from '../../api/weatherModels';
import { useWeatherModelsContext } from '../../context/WeatherModelsContext';
import { usePreferences } from '../../context/PreferencesContext';
import LocationPanel from './LocationPanel';
import Meteogram from './Meteogram';
import ModelComparison from './ModelComparison';
import ModelReadout from './ModelReadout';
import RunBadges, { RunNotices } from './RunBadges';
import { ROOT_VARS, entryAt, localTime, zulu } from './modelTheme';
import { basinLabel, stormLabel } from '../../utils/hafsSelection';

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

const RUN_STATUS = {
  complete: 'Complete',
  'in-progress': 'Still arriving: new forecast hours appear as NOAA publishes them',
  incomplete: 'Incomplete: NOAA published only part of this run',
};

function HafsPanel({ hafs }) {
  const { sel, detail, catalog, catalogError, detailError, loading } = hafs;
  const problems = detail ? Object.values(detail.domains).flatMap((d) => d.problems.map((p) => ({ ...p, domain: d.label }))) : [];
  return (
    <div className={`dark flex-1 overflow-y-auto ${ROOT_VARS}`}>
      <Section title={sel ? stormLabel(sel.storm) : 'HAFS hurricane model'}>
        {loading && !sel && (
          <p className="flex items-center gap-2 text-sm text-sentinel-300"><Loader2 size={14} className="animate-spin" aria-hidden /> Loading HAFS runs…</p>
        )}
        {catalogError && <p role="alert" className="text-sm text-red-300">{catalogError.message}</p>}
        {catalog && !sel && <p className="text-sm text-sentinel-200">No HAFS runs in the last {catalog.days} days.</p>}
        {sel && (
          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-sentinel-400">Basin</dt><dd className="text-sentinel-100">{basinLabel(sel.storm.basin)}</dd>
            {sel.storm.atcfId && (<><dt className="text-sentinel-400">ATCF id</dt><dd className="text-sentinel-100">{sel.storm.atcfId}</dd></>)}
            <dt className="text-sentinel-400">Model</dt><dd className="text-sentinel-100">{sel.models.find((m) => m.id === sel.model)?.name}</dd>
            <dt className="text-sentinel-400">Run</dt>
            <dd className="text-sentinel-100">{localTime(sel.run.initTime, { month: 'short', day: 'numeric' })} ({zulu(sel.run.initTime)}), to +{sel.run.latestHour} h</dd>
            <dt className="text-sentinel-400">Status</dt><dd className="text-sentinel-100">{RUN_STATUS[sel.run.status] ?? sel.run.status}</dd>
          </dl>
        )}
        {detailError && <p role="alert" className="mt-2 text-sm text-red-300">{detailError.message}</p>}
        {problems.length > 0 && (
          <p className="mt-2 text-xs text-amber-200">
            {problems.length} forecast hour{problems.length === 1 ? '' : 's'} couldn&apos;t be read from NOAA and {problems.length === 1 ? 'is' : 'are'} skipped.
          </p>
        )}
        <p className="mt-2 text-xs text-sentinel-300">Choose the storm, configuration, run and domain from the map&apos;s Variables button.</p>
      </Section>
      <Section title="About this data">
        <div className="space-y-2 text-xs text-sentinel-200">
          <p>
            <strong>HAFS</strong> (Hurricane Analysis and Forecast System) is NOAA&apos;s operational hurricane model, run every
            6 hours for each active tropical cyclone. HAFS-A and HAFS-B are two configurations of it. The storm nest is a
            ~2 km grid that follows the storm; the parent domain is a larger ~6 km grid.
          </p>
          {catalog && <p>{catalog.notice}</p>}
          <p>
            These are <strong>numerical model forecasts</strong>, not observations or official forecasts. For NHC&apos;s official
            track, cone and warnings, use the Weather tab.
          </p>
          {catalog && <p>{catalog.attribution}</p>}
        </div>
      </Section>
    </div>
  );
}

export default function WeatherModelsPanel() {
  const wm = useWeatherModelsContext();
  const { prefs } = usePreferences();
  if (!wm) return null;
  if (wm.mode === 'hafs') return <HafsPanel hafs={wm.hafs} />;
  const pickAtCenter = prefs.dataPickerAnchor !== 'mouse';
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
          <p className="mt-2 text-xs text-sentinel-300">
            {pickAtCenter
              ? 'Click the map to inspect the center of the screen, then pan to move the point; its full forecast appears here.'
              : 'Click the map to inspect a point; its full forecast appears here.'}
          </p>
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
