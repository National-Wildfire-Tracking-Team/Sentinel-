/**
 * modelFieldSelection.js
 * What the Models tab can show for a given mode: selectable variables (and
 * why others aren't), the valid times the timeline steps through, and the
 * point-API value that matches a map variable for click inspection.
 */

import { entryAt } from '../components/WeatherModels/modelTheme';

export const COMPARE_VIEWS = ['swipe', 'difference'];

/** Valid times the timeline steps through for the current mode. */
export function timelineFor(manifest, mode, compareView) {
  if (!manifest) return [];
  if (mode === 'compare') {
    if (compareView === 'difference') return manifest.difference?.validTimes ?? [];
    const g = new Set(manifest.models.gfs.current.validTimes);
    return manifest.models.hrrr.current.validTimes.filter((t) => g.has(t));
  }
  return manifest.models[mode]?.current.validTimes ?? [];
}

/** Variables selectable in the current mode, with why others aren't. */
export function variablesFor(manifest, mode, compareView) {
  if (!manifest) return [];
  return Object.entries(manifest.variables).map(([id, v]) => {
    let reason = null;
    if (mode === 'compare' && compareView === 'difference') {
      if (!manifest.difference?.variables.includes(id)) {
        reason = v.models.length < 2 ? `Not in ${v.models.includes('hrrr') ? 'GFS' : 'HRRR'}` : 'Not comparable between models';
      }
    } else if (mode === 'compare') {
      if (v.models.length < 2) reason = `Not in ${v.models.includes('hrrr') ? 'GFS' : 'HRRR'}`;
    } else if (!v.models.includes(mode)) {
      reason = `Not in ${mode.toUpperCase()}`;
    }
    return { id, ...v, available: !reason, reason };
  });
}

/** The point-API value matching a map field variable, in the API's (US) units. */
export function pointValue(data, variable, validTime) {
  if (!data) return { value: null };
  const entry = entryAt(data.forecast, validTime);
  if (!entry) return { value: null, missing: 'no-time' };
  if (variable === 'precipitationTotal') {
    // Same semantics as the map: total since this run's start.
    let total = 0;
    for (const e of data.forecast) {
      if (e.validTime > validTime) break;
      total += e.precipitationAmount ?? 0;
    }
    return { value: total, unit: data.units.precipitationAmount, entry };
  }
  if (!(variable in entry)) return { value: null, missing: 'not-provided' };
  return { value: entry[variable], unit: data.units[variable], entry };
}
