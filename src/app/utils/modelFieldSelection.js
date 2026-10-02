/**
 * modelFieldSelection.js
 * What the Models tab can show for a given mode: selectable variables (and
 * why others aren't), the valid times the timeline steps through, and the
 * point-API value that matches a map variable for click inspection.
 */

import { entryAt, nowIndex } from '../components/WeatherModels/modelTheme';
import { differenceUrl, fieldUrl, hourAt, windUrl } from '../api/modelFields';

export const COMPARE_VIEWS = ['swipe', 'difference'];

/** Forecast-hour jumps the timeline offers (from now), where the timeline has them. */
export const JUMP_HOURS = [1, 3, 6, 12, 24, 48, 72, 120, 168, 240, 384];

/** The timeline's jump buttons: Now, then each JUMP_HOURS step that exists. Indexes into `timeline`. */
export function jumpTargets(timeline, nowMs = Date.now()) {
  if (!timeline?.length) return [];
  const now = nowIndex(timeline.map((t) => ({ validTime: t })), nowMs);
  const base = Date.parse(timeline[now]);
  return [{ label: 'Now', i: now }, ...JUMP_HOURS
    .map((h) => ({ label: `+${h}h`, i: timeline.findIndex((t) => Date.parse(t) === base + h * 3_600_000) }))
    .filter((j) => j.i !== -1)];
}

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

/**
 * Frames worth having in the HTTP cache before the user asks for them, most
 * likely first: the next steps of playback, the frame behind, the jump
 * buttons, the same moment in the other variables and the other model, and
 * (with `whole`) the rest of the timeline for scrubbing. The frame on screen
 * isn't listed; the map is already loading it.
 *
 * @param {{ base: string, manifest: object, mode: string, compareView: string, variable: string,
 *   validTime: string, timeline: string[], playing?: boolean, particles?: boolean, hiRes?: boolean,
 *   shownRes?: 'lo'|'hi', whole?: boolean, ahead?: number, nowMs?: number }} p
 *   hiRes: warm the 3 km frames (zoomed in, or about to be); shownRes: what the map is drawing now
 */
export function prefetchPlan({
  base, manifest, mode, compareView, variable, validTime, timeline,
  playing = false, particles = false, hiRes = false, shownRes = 'lo', whole = false, ahead = 6, nowMs,
}) {
  if (!base || !manifest || !validTime || !timeline?.length) return [];
  const i = timeline.indexOf(validTime);
  if (i === -1) return [];
  const diff = mode === 'compare' && compareView === 'difference';
  const models = mode === 'compare' ? ['hrrr', 'gfs'] : [mode];

  // While playing, the whole loop from the playhead on (it wraps).
  const loop = (n) => Array.from({ length: Math.min(n, timeline.length - 1) }, (_, k) => timeline[(i + 1 + k) % timeline.length]);
  const framesAt = (t, { res = 'lo', wind = false, vars = [variable], ms = models } = {}) => {
    if (diff) return vars.map((v) => (manifest.difference?.variables.includes(v) ? differenceUrl(base, manifest, v, t) : null));
    return ms.flatMap((m) => {
      const h = hourAt(manifest, m, t);
      if (h == null) return [];
      return [
        ...vars.filter((v) => manifest.variables[v]?.models.includes(m)).map((v) => fieldUrl(base, manifest, m, v, h, res)),
        ...(wind && mode !== 'compare' ? [windUrl(base, manifest, m, h)] : []),
      ];
    });
  };

  const urls = [];
  const next = playing ? loop(timeline.length) : loop(ahead);
  // Paused and zoomed in: the 3 km frames here and either side, so a step stays sharp.
  if (hiRes && !playing) {
    for (const t of [validTime, next[0], timeline[i - 1]].filter(Boolean)) urls.push(...framesAt(t, { res: 'hi' }));
  }
  for (const t of next) urls.push(...framesAt(t, { wind: particles }));
  if (!playing) {
    if (i > 0) urls.push(...framesAt(timeline[i - 1], { wind: particles }));
    for (const j of jumpTargets(timeline, nowMs)) urls.push(...framesAt(timeline[j.i]));
    const others = Object.keys(manifest.variables).filter((v) => v !== variable);
    urls.push(...framesAt(validTime, { vars: others }));
    if (mode === 'hrrr' || mode === 'gfs') urls.push(...framesAt(validTime, { ms: [mode === 'hrrr' ? 'gfs' : 'hrrr'] }));
    if (whole) {
      for (let k = i + ahead + 1; k < timeline.length; k += 1) urls.push(...framesAt(timeline[k]));
      for (let k = i - 2; k >= 0; k -= 1) urls.push(...framesAt(timeline[k]));
    }
  }
  const current = new Set(framesAt(validTime, { res: shownRes, wind: particles }));
  return [...new Set(urls.filter(Boolean))].filter((u) => !current.has(u));
}
