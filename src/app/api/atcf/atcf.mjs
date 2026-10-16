/**
 * atcf.mjs
 * Parser for NHC's ATCF "a-deck" guidance files (ftp.nhc.noaa.gov/atcf/
 * aid_public/a<bb><nn><yyyy>.dat.gz, older seasons under atcf/archive/<yyyy>/).
 *
 * SHARED FILE: src/app/api/atcf/ and cloud/hurricane-models/ hold
 * byte-identical copies (Tests/Vitest/hurricaneModelsService.test.js pins
 * this). Edit one, copy it to the other.
 *
 * An a-deck is comma-separated text, one line per technique (model or aid),
 * cycle and forecast hour, repeated once per wind-radii threshold (34/50/64
 * kt) at the same hour. Fields, 0-based, per NHC's ATCF a-deck format
 * (https://www.nrlmry.navy.mil/atcf_web/docs/database/new/abdeck.txt):
 *
 *    0 BASIN  1 CY  2 YYYYMMDDHH  3 TECHNUM  4 TECH  5 TAU  6 LatN/S
 *    7 LonE/W  8 VMAX (kt)  9 MSLP (mb)  10 TY  11 RAD (kt)  12 WINDCODE
 *   13-16 RAD1-RAD4 (nm)  17 POUTER  18 ROUTER  19 RMW  20 GUSTS  21 EYE
 *   22 SUBREGION  23 MAXSEAS  24 INITIALS  25 DIR  26 SPEED  27 STORMNAME …
 *
 * Only the first ten are guaranteed; aids write as many trailing fields as
 * they have (anything from 9 to 40+), so everything past MSLP is optional.
 * Positions are tenths of a degree with a hemisphere letter ("227N",
 * "1182W"); 0 means "not given" for VMAX and MSLP.
 */

const NUMERIC = /^-?\d+$/;

/** "227N" → 22.7, "1182W" → -118.2; null for anything else or out of range. */
export function parseAtcfCoordinate(value, axis) {
  const m = String(value ?? '').trim().match(/^(\d{1,5})([NSEW])$/);
  if (!m) return null;
  const hemi = m[2];
  if (axis === 'lat' && hemi !== 'N' && hemi !== 'S') return null;
  if (axis === 'lon' && hemi !== 'E' && hemi !== 'W') return null;
  const deg = Number(m[1]) / 10;
  if (deg > (axis === 'lat' ? 90 : 360)) return null;
  let signed = hemi === 'S' || hemi === 'W' ? -deg : deg;
  // Some decks write east longitudes past 180 (0-3600 tenths); fold to ±180.
  if (axis === 'lon' && signed > 180) signed -= 360;
  return signed;
}

/** "2026100806" → Date at 06Z, or null when it isn't a real date and synoptic-ish hour. */
export function parseAtcfCycle(value) {
  const s = String(value ?? '').trim();
  if (!/^\d{10}$/.test(s)) return null;
  const [y, mo, d, h] = [+s.slice(0, 4), +s.slice(4, 6), +s.slice(6, 8), +s.slice(8, 10)];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23) return null;
  const t = Date.UTC(y, mo - 1, d, h);
  const date = new Date(t);
  // Rejects 20260231 and the like, which Date.UTC would silently roll over.
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/** "  12" → 12, "-12" → -12 (analysis history); null when not an integer hour. */
export function parseAtcfTau(value) {
  const s = String(value ?? '').trim();
  if (!NUMERIC.test(s)) return null;
  const n = Number(s);
  return n >= -240 && n <= 999 ? n : null;
}

/** Positive integer, or null for blank, 0, negatives and ATCF's -999 "missing". */
function positiveInt(value) {
  const s = String(value ?? '').trim();
  if (!NUMERIC.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}

/** ISO 8601 without milliseconds: "2026-10-08T06:00:00Z". */
export function isoHour(date) {
  return date.toISOString().replace('.000Z', 'Z');
}

/**
 * One a-deck line → a record, or { error } explaining why it can't be used.
 * Blank lines return null (not an error).
 */
export function parseAtcfLine(line) {
  if (!line || !line.trim()) return null;
  const f = line.split(',').map((x) => x.trim());
  if (f.length < 8) return { error: 'too-few-fields' };
  const basin = f[0].toUpperCase();
  if (!/^[A-Z]{2}$/.test(basin)) return { error: 'bad-basin' };
  if (!/^\d{1,2}$/.test(f[1])) return { error: 'bad-storm-number' };
  const init = parseAtcfCycle(f[2]);
  if (!init) return { error: 'bad-cycle' };
  const technique = f[4].toUpperCase();
  if (!/^[A-Z0-9]{2,4}$/.test(technique)) return { error: 'bad-technique' };
  const tau = parseAtcfTau(f[5]);
  if (tau == null) return { error: 'bad-tau' };
  const latitude = parseAtcfCoordinate(f[6], 'lat');
  const longitude = parseAtcfCoordinate(f[7], 'lon');
  if (latitude == null || longitude == null) return { error: 'bad-position' };
  // 0N 0W is how some aids write "no position" at an hour they didn't reach.
  if (latitude === 0 && longitude === 0) return { error: 'missing-position' };

  const radiusKt = positiveInt(f[11]);
  const windCode = (f[12] ?? '').toUpperCase();
  let radii = null;
  if (radiusKt && [34, 50, 64].includes(radiusKt)) {
    const q = [13, 14, 15, 16].map((i) => positiveInt(f[i]) ?? 0);
    if (windCode === 'AAA' && q[0] > 0) radii = { ne: q[0], se: q[0], sw: q[0], nw: q[0] };
    else if (windCode === 'NEQ' && q.some((v) => v > 0)) radii = { ne: q[0], se: q[1], sw: q[2], nw: q[3] };
  }

  return {
    basin,
    stormNumber: Number(f[1]),
    cycle: f[2],
    init,
    technique,
    tau,
    latitude,
    longitude,
    maxWindKt: positiveInt(f[8]),
    minPressureMb: positiveInt(f[9]),
    stormType: /^[A-Z]{2}$/.test(f[10] ?? '') ? f[10] : null,
    // The line's own threshold, radii or not: tells the 34/50/64 repeats of
    // an hour apart from true duplicates.
    thresholdKt: radiusKt ?? 0,
    radiusKt: radii ? radiusKt : null,
    radii,
    rmwNm: positiveInt(f[19]),
    stormName: /^[A-Z][A-Z-]+$/i.test(f[27] ?? '') ? f[27].toUpperCase() : null,
  };
}

/**
 * Whole a-deck text → { records, stats }. Malformed lines are counted (by
 * reason) and skipped, never fatal. `expect` ({ basin, stormNumber })
 * drops lines filed under some other storm.
 */
export function parseAtcf(text, expect = null) {
  const records = [];
  const stats = { lines: 0, records: 0, malformed: 0, missingPosition: 0, otherStorm: 0, errors: {} };
  for (const line of String(text ?? '').split('\n')) {
    const rec = parseAtcfLine(line);
    if (!rec) continue;
    stats.lines += 1;
    // Intensity-only aids write 0N 0W at every hour: a missing value, not a broken line.
    if (rec.error === 'missing-position') { stats.missingPosition += 1; continue; }
    if (rec.error) {
      stats.malformed += 1;
      stats.errors[rec.error] = (stats.errors[rec.error] || 0) + 1;
      continue;
    }
    if (expect && (rec.basin !== expect.basin || rec.stormNumber !== expect.stormNumber)) {
      stats.otherStorm += 1;
      continue;
    }
    records.push(rec);
  }
  stats.records = records.length;
  return { records, stats };
}

/**
 * Records → runs, one per technique and cycle: { technique, cycle, init,
 * points } with one point per forecast hour (taus ≥ 0), sorted by hour.
 * The per-threshold repeats of an hour fold into one point carrying all
 * its wind radii; exact repeats are counted as duplicates, and a second
 * position for an hour that already has one is a conflict (first wins).
 */
export function buildRuns(records) {
  const runs = new Map();
  let duplicates = 0;
  let conflicts = 0;
  const seenLines = new Set();
  for (const r of records) {
    if (r.tau < 0) continue;
    const lineKey = `${r.technique}|${r.cycle}|${r.tau}|${r.thresholdKt}|${r.latitude}|${r.longitude}`;
    if (seenLines.has(lineKey)) { duplicates += 1; continue; }
    seenLines.add(lineKey);

    const key = `${r.technique}|${r.cycle}`;
    let run = runs.get(key);
    if (!run) {
      run = { technique: r.technique, cycle: r.cycle, init: r.init, byTau: new Map(), stormName: null };
      runs.set(key, run);
    }
    if (r.stormName) run.stormName = r.stormName;
    let point = run.byTau.get(r.tau);
    if (!point) {
      point = {
        tau: r.tau,
        validTime: isoHour(new Date(r.init.getTime() + r.tau * 3_600_000)),
        latitude: r.latitude,
        longitude: r.longitude,
        maxWindKt: r.maxWindKt,
        minPressureMb: r.minPressureMb,
        stormType: r.stormType,
        windRadiiNm: null,
      };
      run.byTau.set(r.tau, point);
    } else if (point.latitude !== r.latitude || point.longitude !== r.longitude) {
      conflicts += 1;
      continue;
    } else {
      point.maxWindKt ??= r.maxWindKt;
      point.minPressureMb ??= r.minPressureMb;
      point.stormType ??= r.stormType;
    }
    if (r.radii) point.windRadiiNm = { ...point.windRadiiNm, [r.radiusKt]: r.radii };
  }
  const out = [];
  for (const run of runs.values()) {
    const points = [...run.byTau.values()].sort((a, b) => a.tau - b.tau);
    out.push({ technique: run.technique, cycle: run.cycle, init: run.init, stormName: run.stormName, points });
  }
  return { runs: out, duplicates, conflicts };
}
