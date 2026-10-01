/**
 * RunBadges.jsx
 * Identifies exactly which model data is on screen: model, run, valid time,
 * forecast hour and how old the run is. Shown wherever model values are, so
 * the numbers are never separated from where they came from.
 */

import { AlertTriangle, Clock } from 'lucide-react';
import { MODEL_STYLE, ageLabel, dayZulu, forecastHourLabel, localTime, zulu } from './modelTheme';

export function ModelChip({ model, size = 'md' }) {
  const style = MODEL_STYLE[model.id];
  const pad = size === 'sm' ? 'px-1.5 py-0 text-[11px]' : 'px-2 py-0.5 text-xs';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border border-dashed font-bold tracking-wide ${pad} ${style?.border ?? ''} ${style?.text ?? ''}`}
      title={`${model.fullName} (${model.operator}), ${model.resolution}. Numerical model forecast.`}
    >
      {model.name}
    </span>
  );
}

/** Warnings that change how much to trust what's shown. Never hidden. */
export function RunNotices({ data }) {
  const notices = [];
  const { run, modelSelection, model } = data;
  if (run.stale) {
    notices.push(`This ${model.name} run is ${ageLabel(run.ageMinutes)}, older than usual. Newer runs haven't arrived yet.`);
  }
  if (!run.complete) {
    notices.push(`The ${zulu(run.runTime)} run is still arriving: forecast hours available through ${forecastHourLabel(run.forecastHoursAvailable)}.`);
  }
  if (run.selection === 'newest-run-incomplete') {
    notices.push(`Showing the ${zulu(run.runTime)} run because the ${zulu(run.newestRunTime)} run doesn't cover these hours yet.`);
  }
  if (modelSelection?.fallbackFrom) {
    notices.push(`HRRR was unavailable for this location, so this is ${model.name}.`);
  }
  if (!notices.length) return null;
  return (
    <ul className="space-y-1">
      {notices.map((n) => (
        <li key={n} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" aria-hidden />
          {n}
        </li>
      ))}
    </ul>
  );
}

export default function RunBadges({ data, entry }) {
  const { model, run } = data;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sentinel-600 dark:text-sentinel-200">
        <ModelChip model={model} />
        <span title={run.runTime}>
          <span className="text-sentinel-400 dark:text-sentinel-300">Run</span> <strong className="font-semibold text-sentinel-900 dark:text-white">{dayZulu(run.runTime)}</strong>
        </span>
        {entry && (
          <>
            <span title={entry.validTime}>
              <span className="text-sentinel-400 dark:text-sentinel-300">Valid</span>{' '}
              <strong className="font-semibold text-sentinel-900 dark:text-white">{zulu(entry.validTime)}</strong>{' '}
              <span className="text-sentinel-400 dark:text-sentinel-300">({localTime(entry.validTime)})</span>
            </span>
            <span>
              <span className="text-sentinel-400 dark:text-sentinel-300">Forecast hour</span>{' '}
              <strong className="font-semibold text-sentinel-900 dark:text-white">{forecastHourLabel(entry.forecastHour)}</strong>
            </span>
          </>
        )}
        <span className="inline-flex items-center gap-1" title={`Retrieved ${data.retrievedAt}`}>
          <Clock size={11} aria-hidden />
          {ageLabel(run.ageMinutes)}
        </span>
      </div>
      <RunNotices data={data} />
    </div>
  );
}
