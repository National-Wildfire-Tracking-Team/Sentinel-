/**
 * hafsSelection.js
 * What the Models tab can show in HAFS mode, from the HAFS catalog and one
 * run's detail: the storms (each with its runs per configuration), a valid
 * selection for whatever the user last chose, the forecast times to step
 * through, which fields this run has, and the frames to fetch next.
 *
 * Pure functions, so the rules are tested without a map.
 */

import { hafsFrameUrl } from '../api/hafs';

// NHC's basins first: Sentinel's users are in the U.S.
const BASIN_ORDER = ['AL', 'EP', 'CP', 'WP', 'IO', 'SH', 'SL'];
const BASIN_LABEL = { AL: 'Atlantic', EP: 'East Pacific', CP: 'Central Pacific', WP: 'West Pacific', IO: 'Indian Ocean', SH: 'Southern Hemisphere', SL: 'South Atlantic' };

export const DEFAULT_HAFS_FIELD = 'windSpeed10m';

export function basinLabel(basin) {
  return BASIN_LABEL[basin] ?? basin ?? '';
}

/** "Isaias (AL09)" or "Storm 09L" when NOAA hasn't named it. */
export function stormLabel(storm) {
  if (!storm) return '';
  const code = storm.atcfId ? `${storm.atcfId.slice(0, 2)}${storm.atcfId.slice(2, 4)}` : storm.id.toUpperCase();
  if (!storm.name) return `Storm ${storm.id.toUpperCase()}`;
  const name = storm.name.charAt(0) + storm.name.slice(1).toLowerCase();
  return `${name} (${code})`;
}

/**
 * Every storm with a run in the catalog, merged across HAFS configurations:
 * [{ key, id, atcfId, name, basin, runs: { hfsa: [run…newest first], hfsb: […] } }].
 * A run here is { cycle, initTime, status, latestHour, updatedAt, domains }.
 */
export function hafsStorms(catalog) {
  if (!catalog) return [];
  const byKey = new Map();
  for (const model of catalog.models) {
    for (const run of model.runs ?? []) {
      for (const s of run.storms ?? []) {
        const key = s.atcfId || s.id;
        let storm = byKey.get(key);
        if (!storm) {
          storm = { key, id: s.id, atcfId: s.atcfId, name: s.name ?? null, basin: s.basin, runs: {} };
          byKey.set(key, storm);
        }
        if (!storm.name && s.name) storm.name = s.name;
        (storm.runs[model.id] ??= []).push({
          cycle: run.cycle, initTime: run.initTime, status: s.status, latestHour: s.latestHour,
          updatedAt: s.updatedAt, domains: s.domains,
        });
      }
    }
  }
  const rank = (b) => { const i = BASIN_ORDER.indexOf(b); return i === -1 ? BASIN_ORDER.length : i; };
  return [...byKey.values()]
    .map((s) => {
      for (const runs of Object.values(s.runs)) runs.sort((a, b) => b.cycle.localeCompare(a.cycle));
      return s;
    })
    .sort((a, b) => rank(a.basin) - rank(b.basin) || a.id.localeCompare(b.id));
}

/** The newest complete run, or the newest at all if none has finished. */
export function defaultRun(runs) {
  if (!runs?.length) return null;
  return runs.find((r) => r.status === 'complete') ?? runs[0];
}

/** The live HAFS configurations in catalog order: [{ id, name }]. */
export function hafsModels(catalog) {
  return (catalog?.models ?? []).filter((m) => m.status !== 'legacy').map((m) => ({ id: m.id, name: m.name }));
}

/**
 * A selection the catalog can actually show, closest to `choice`
 * ({ storm: atcfId, model, cycle, domain }): an unknown storm, a configuration
 * that didn't run for it, a cycle that's gone or a missing domain falls back
 * to the first, the HAFS-A default, the default run and the storm nest.
 */
export function resolveHafsSelection(catalog, choice = {}) {
  const storms = hafsStorms(catalog);
  if (!storms.length) return null;
  const storm = storms.find((s) => s.key === choice.storm) ?? storms[0];
  const models = hafsModels(catalog).filter((m) => storm.runs[m.id]?.length);
  if (!models.length) return null;
  const model = models.find((m) => m.id === choice.model)?.id ?? models[0].id;
  const runs = storm.runs[model];
  const run = runs.find((r) => r.cycle === choice.cycle) ?? defaultRun(runs);
  const domains = Object.keys(run.domains ?? {});
  const domain = domains.includes(choice.domain) ? choice.domain : (domains.includes('storm') ? 'storm' : domains[0]);
  return { storms, storm, models, model, runs, run, cycle: run.cycle, domain, domains };
}

/** Forecast valid times of one domain of a run's detail, in forecast order. */
export function hafsTimeline(detail, domain) {
  const d = detail?.domains?.[domain];
  if (!d) return [];
  return [...d.hours].sort((a, b) => a - b).map((h) => d.frames[String(h)]?.validTime).filter(Boolean);
}

/** The forecast hour and frame (corners) at a valid time, or null. */
export function hafsFrameAt(detail, domain, validTime) {
  const d = detail?.domains?.[domain];
  if (!d || !validTime) return null;
  for (const h of d.hours) {
    const f = d.frames[String(h)];
    if (f?.validTime === validTime) return { hour: h, ...f };
  }
  return null;
}

/**
 * The catalog's fields with what this run offers:
 * available (some hour has it), hours, and a reason when it can't be shown.
 */
export function hafsFields(catalog, detail, domain) {
  const have = detail?.domains?.[domain]?.fields ?? {};
  return (catalog?.fields ?? []).map((f) => {
    const hours = have[f.id] ?? [];
    let reason = null;
    if (detail && !hours.length) reason = 'Not in this run';
    return { ...f, hours, available: Boolean(detail) && hours.length > 0, reason };
  });
}

/** The chosen field if this run has it, else the default, else the first available. */
export function effectiveHafsField(fields, choice) {
  const ok = (id) => fields.find((f) => f.id === id && f.available);
  return (ok(choice) ?? ok(DEFAULT_HAFS_FIELD) ?? fields.find((f) => f.available))?.id ?? choice;
}

/**
 * Frames to have in the HTTP cache before they're asked for, most likely
 * first. HAFS frames are rendered on demand (about a second each when no
 * one has asked before), so this stays small: the next steps (the loop while
 * playing), the step behind, and the same hour in the other fields the user
 * is likely to flip to.
 */
export function hafsPrefetchPlan({ base, sel, detail, field, fields, validTime, timeline, playing = false, ahead = 3 }) {
  if (!base || !sel || !detail || !validTime || !timeline?.length) return [];
  const i = timeline.indexOf(validTime);
  if (i === -1) return [];
  const url = (t, f = field) => {
    const frame = hafsFrameAt(detail, sel.domain, t);
    const spec = fields.find((x) => x.id === f);
    if (!frame || !spec?.hours.includes(frame.hour)) return null;
    return hafsFrameUrl(base, { model: sel.model, cycle: sel.cycle, storm: sel.storm.id, domain: sel.domain, field: f, hour: frame.hour });
  };
  const n = Math.min(playing ? 6 : ahead, timeline.length - 1);
  const urls = Array.from({ length: n }, (_, k) => url(timeline[(i + 1 + k) % timeline.length]));
  if (!playing) {
    if (i > 0) urls.push(url(timeline[i - 1]));
    for (const f of ['mslp', 'reflectivity', 'windSpeed10m', 'precipTotal']) if (f !== field) urls.push(url(validTime, f));
  }
  return [...new Set(urls.filter(Boolean))];
}
