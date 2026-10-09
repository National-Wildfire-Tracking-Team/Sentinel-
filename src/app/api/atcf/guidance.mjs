/**
 * guidance.mjs
 * A-deck text → Sentinel's normalized hurricane model response: one entry
 * per registry model (with its status, so a missing model is reported, not
 * dropped), the rest of the track guidance by group, and where the storm is
 * now.
 *
 * SHARED FILE: src/app/api/atcf/ and cloud/hurricane-models/ hold
 * byte-identical copies (Tests/Vitest/hurricaneModelsService.test.js pins
 * this). The service runs it once per a-deck change; the browser runs it
 * only as the fallback when the service isn't configured. Edit one, copy it
 * to the other.
 */

import { buildRuns, isoHour, parseAtcf, parseAtcfCycle } from './atcf.mjs';
import {
  HURRICANE_MODELS, MODEL_ORDER, guidanceInfo, isRegistryTechnique, isTrackTechnique,
} from './registry.mjs';

export const SCHEMA_VERSION = 1;

/** Other guidance older than this (vs the newest cycle) isn't drawn. */
export const GUIDANCE_MAX_RUN_AGE_H = 12;
/** A registry model's run may lag the newest guidance by cycleHours + this and still be current. */
export const MODEL_LATENCY_H = 12;
/** Past current, a run is shown flagged 'stale' until it's this old; then it's 'unavailable'. */
export const MODEL_MAX_STALE_H = 48;
/** Live data whose newest cycle is older than this is flagged stale (storm gone, or the feed stalled). */
export const DATASET_STALE_H = 18;

const BASINS = new Set(['AL', 'EP', 'CP']);

/**
 * "al092026" / "AL092026" → { stormId, basin, stormNumber, year, file }, or
 * null. Only NHC's basins (Atlantic, East and Central Pacific) have public
 * a-decks; storm numbers 01-49 are depressions and storms, 90-99 invests.
 */
export function parseStormId(value) {
  const m = String(value ?? '').trim().toUpperCase().match(/^([A-Z]{2})(\d{2})(\d{4})$/);
  if (!m || !BASINS.has(m[1])) return null;
  const stormNumber = Number(m[2]);
  const year = Number(m[3]);
  if (stormNumber < 1 || (stormNumber > 49 && stormNumber < 90) || year < 1990 || year > 2100) return null;
  const stormId = `${m[1]}${m[2]}${m[3]}`;
  return { stormId, basin: m[1], stormNumber, year, file: `a${stormId.toLowerCase()}.dat.gz` };
}

const cycleMs = (cycle) => parseAtcfCycle(cycle).getTime();
const hoursBetween = (later, earlier) => (cycleMs(later) - cycleMs(earlier)) / 3_600_000;
const cycleIso = (cycle) => isoHour(parseAtcfCycle(cycle));

/**
 * Parse once, query many times: a-deck text → the storm's runs and cycles.
 * Building a response from an index is cheap, so the service keeps the
 * index and answers any cycle (`asOf`) from it.
 */
export function indexADeck(text, storm) {
  const { records, stats } = parseAtcf(text, { basin: storm.basin, stormNumber: storm.stormNumber });
  const { runs, duplicates, conflicts } = buildRuns(records);
  const cycles = [...new Set(runs.map((r) => r.cycle))].sort().reverse();
  // The newest analysis's name: early lines still say INVEST after a system is named.
  const named = runs.filter((r) => r.stormName).sort((a, b) => b.cycle.localeCompare(a.cycle)
    || Number(b.technique === 'CARQ') - Number(a.technique === 'CARQ'));
  const stormName = named[0]?.stormName ?? null;
  return {
    storm,
    stormName,
    runs,
    cycles,
    latestCycle: cycles[0] ?? null,
    stats: { ...stats, duplicates, conflicts, runs: runs.length },
  };
}

/** A model's newest run with a track at or before `asOf`; on a tie, its preferred technique. */
function newestRun(runs, techniques, asOf) {
  let best = null;
  for (const run of runs) {
    const rank = techniques.indexOf(run.technique);
    if (rank === -1 || run.cycle > asOf || run.points.length < 2) continue;
    if (!best || run.cycle > best.run.cycle || (run.cycle === best.run.cycle && rank < best.rank)) best = { run, rank };
  }
  return best?.run ?? null;
}

function modelEntry(model, runs, asOf) {
  const base = {
    id: model.id,
    name: model.name,
    category: model.category,
    techniques: model.techniques,
    description: model.description,
  };
  const run = newestRun(runs, model.techniques, asOf);
  if (!run) {
    return {
      ...base,
      status: 'unavailable',
      technique: null,
      initTime: null,
      ageHours: null,
      points: [],
      error: model.availabilityNote ?? `No ${model.name} forecast track in NHC's ATCF data for this storm.`,
    };
  }
  const ageHours = hoursBetween(asOf, run.cycle);
  const status = ageHours <= model.cycleHours + MODEL_LATENCY_H ? 'available'
    : ageHours <= MODEL_MAX_STALE_H ? 'stale' : 'unavailable';
  return {
    ...base,
    status,
    technique: run.technique,
    initTime: cycleIso(run.cycle),
    ageHours,
    // An expired run keeps its init time (so the UI can say how old it is) but not its track.
    points: status === 'unavailable' ? [] : run.points,
    error: status === 'available' ? null : `Latest ${model.name} run is ${ageHours} h older than the newest guidance.`,
  };
}

/** Each non-registry track aid's newest run in the window, interpolated runs preferred within a family. */
function otherGuidance(runs, asOf) {
  const newest = new Map();
  for (const run of runs) {
    const tech = run.technique;
    if (!isTrackTechnique(tech) || isRegistryTechnique(tech) || run.cycle > asOf || run.points.length < 2) continue;
    if (hoursBetween(asOf, run.cycle) > GUIDANCE_MAX_RUN_AGE_H) continue;
    if (!newest.has(tech) || run.cycle > newest.get(tech).cycle) newest.set(tech, run);
  }
  const tracks = [...newest.values()].map((run) => ({ run, info: guidanceInfo(run.technique) }));
  const earlyFamilies = new Set(tracks.filter((t) => t.info.family && t.info.early).map((t) => t.info.family));
  return tracks
    .filter((t) => !t.info.family || t.info.early || !earlyFamilies.has(t.info.family))
    .sort((a, b) => a.run.technique.localeCompare(b.run.technique))
    .map(({ run, info }) => ({
      id: run.technique,
      name: info.name,
      group: info.group,
      initTime: cycleIso(run.cycle),
      points: run.points.map((p) => ({ tau: p.tau, latitude: p.latitude, longitude: p.longitude, maxWindKt: p.maxWindKt })),
    }));
}

/**
 * Where the storm is at the as-of cycle: NHC's own analysis (CARQ), else
 * the official forecast's hour 0, else any aid's hour 0 (every aid starts
 * from the same analysis position).
 */
function currentPosition(index, asOf) {
  const at = (tech) => {
    for (const run of index.runs) {
      if (run.cycle !== asOf || (tech && run.technique !== tech)) continue;
      const hour0 = run.points.find((p) => p.tau === 0);
      if (hour0) return hour0;
    }
    return undefined;
  };
  const p = at('CARQ') ?? at('OFCL') ?? at('OFCI') ?? at(null);
  if (!p) return null;
  return {
    time: cycleIso(asOf),
    latitude: p.latitude,
    longitude: p.longitude,
    maxWindKt: p.maxWindKt,
    minPressureMb: p.minPressureMb,
    stormType: p.stormType,
  };
}

/**
 * The normalized response for an indexed deck.
 *
 * @param {object} index      from indexADeck
 * @param {object} options
 * @param {string} [options.asOf]        cycle "YYYYMMDDHH" to answer as of (historical); default newest
 * @param {number} [options.now]         ms, for the staleness check
 * @param {number} [options.generatedAt] ms the deck was read; defaults to `now`
 * @param {object} [options.source]      { url, lastModified } of the a-deck
 * @param {boolean} [options.historical] archived season: never flagged stale for being old
 * @returns {object|null} null when `asOf` isn't one of the deck's cycles
 */
export function buildModelResponse(index, {
  asOf = null, now = Date.now(), generatedAt: readAt = now, source = {}, historical = false,
} = {}) {
  const { storm } = index;
  if (asOf && !index.cycles.includes(asOf)) return null;
  const cycle = asOf ?? index.latestCycle;
  const generatedAt = isoHour(new Date(Math.floor(readAt / 1000) * 1000));
  const pinned = Boolean(asOf) || historical;

  let stale = false;
  let staleReason = null;
  if (!cycle) {
    stale = true;
    staleReason = 'no-guidance';
  } else if (!pinned && (now - cycleMs(cycle)) / 3_600_000 > DATASET_STALE_H) {
    stale = true;
    staleReason = 'no-recent-guidance';
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    stormId: storm.stormId,
    basin: storm.basin,
    stormNumber: storm.stormNumber,
    year: storm.year,
    stormName: index.stormName,
    source: {
      provider: 'NOAA/NHC Automated Tropical Cyclone Forecasting (ATCF) system',
      file: storm.file,
      url: source.url ?? null,
      lastModified: source.lastModified ?? null,
    },
    generatedAt,
    updatedAt: source.lastModified ?? generatedAt,
    latestCycle: index.latestCycle ? cycleIso(index.latestCycle) : null,
    asOf: cycle ? cycleIso(cycle) : null,
    historical: pinned,
    stale,
    staleReason,
    currentPosition: cycle ? currentPosition(index, cycle) : null,
    models: MODEL_ORDER.map((id) => modelEntry(HURRICANE_MODELS[id], index.runs, cycle ?? '')),
    guidance: cycle ? otherGuidance(index.runs, cycle) : [],
    cycles: index.cycles.slice(0, 200).map(cycleIso),
    stats: {
      records: index.stats.records,
      malformed: index.stats.malformed,
      duplicates: index.stats.duplicates,
      conflicts: index.stats.conflicts,
    },
  };
}

/** One-shot: a-deck text → normalized response (the browser fallback path). */
export function buildStormModels(text, storm, options = {}) {
  return buildModelResponse(indexADeck(text, storm), options);
}

/** "2026-10-08T06:00:00Z" or "2026100806" → "2026100806", or null. */
export function toCycle(value) {
  const s = String(value ?? '').trim();
  if (/^\d{10}$/.test(s)) return parseAtcfCycle(s) ? s : null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):00(?::00)?Z$/);
  if (!m) return null;
  const cycle = `${m[1]}${m[2]}${m[3]}${m[4]}`;
  return parseAtcfCycle(cycle) ? cycle : null;
}
