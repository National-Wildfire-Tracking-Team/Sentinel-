/**
 * ATCF a-deck parser and the normalized hurricane-model response
 * (src/app/api/atcf/). The fixture is an excerpt of NHC's real a-deck for
 * Hurricane Isaias (AL092026, ftp.nhc.noaa.gov/atcf/aid_public, read
 * 2026-10-08 12:30Z): cycles 00Z/06Z/12Z Oct 8 plus one 00Z Oct 7 HAFS-A
 * run, forecast hours up to 36, for CARQ, OFCL/OFCI, HFSA/HFAI, HFSB,
 * AVNO/AVNI, UKX, CMC, CTCX, HWRF, HMON, TVCN, TABM, AP01 and SHF5. No
 * test here makes a network request.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildRuns, parseAtcf, parseAtcfCoordinate, parseAtcfCycle, parseAtcfLine, parseAtcfTau,
} from '../../src/app/api/atcf/atcf.mjs';
import {
  buildModelResponse, buildStormModels, indexADeck, parseStormId, toCycle,
} from '../../src/app/api/atcf/guidance.mjs';
import { DEFAULT_MODEL_IDS, HURRICANE_MODELS, MODEL_ORDER } from '../../src/app/api/atcf/registry.mjs';

const ISAIAS = readFileSync(join(process.cwd(), 'Tests/Vitest/fixtures/nhc/aal092026-models.dat'), 'utf8');
const STORM = parseStormId('AL092026');
const NOW = Date.parse('2026-10-08T12:40:00Z');

// One a-deck line in NHC's layout, for the edge cases the fixture doesn't have.
const line = ({ cy = '09', cycle = '2026100806', tech = 'HFSA', tau = 12, lat = '242N', lon = '900W', vmax = 85, mslp = 970, rad = 34, quads = [110, 70, 50, 100] } = {}) =>
  `AL, ${cy}, ${cycle}, 03, ${tech.padStart(4)}, ${String(tau).padStart(3)}, ${lat.padStart(4)}, ${lon.padStart(5)}, ${String(vmax).padStart(3)}, ${String(mslp).padStart(4)}, XX, ${String(rad).padStart(3)}, NEQ, ${quads.map((q) => String(q).padStart(4)).join(', ')}, `;

describe('ATCF coordinates', () => {
  it('parses latitude in tenths of a degree, south negative', () => {
    expect(parseAtcfCoordinate('231N', 'lat')).toBe(23.1);
    expect(parseAtcfCoordinate(' 52S', 'lat')).toBe(-5.2);
    expect(parseAtcfCoordinate('0N', 'lat')).toBe(0);
    expect(parseAtcfCoordinate('901N', 'lat')).toBeNull();
    expect(parseAtcfCoordinate('231W', 'lat')).toBeNull();
    expect(parseAtcfCoordinate('23.1N', 'lat')).toBeNull();
    expect(parseAtcfCoordinate('', 'lat')).toBeNull();
  });

  it('parses longitude in tenths of a degree, west negative, folding east past 180', () => {
    expect(parseAtcfCoordinate('916W', 'lon')).toBe(-91.6);
    expect(parseAtcfCoordinate('1182W', 'lon')).toBe(-118.2);
    expect(parseAtcfCoordinate('1755E', 'lon')).toBe(175.5);
    expect(parseAtcfCoordinate('1850E', 'lon')).toBe(-175);
    expect(parseAtcfCoordinate('916N', 'lon')).toBeNull();
    expect(parseAtcfCoordinate('3700W', 'lon')).toBeNull();
  });
});

describe('ATCF forecast hours and cycles', () => {
  it('parses forecast hours, including analysis history before the cycle', () => {
    expect(parseAtcfTau('  0')).toBe(0);
    expect(parseAtcfTau(' 120')).toBe(120);
    expect(parseAtcfTau('-12')).toBe(-12);
    expect(parseAtcfTau('12h')).toBeNull();
    expect(parseAtcfTau('')).toBeNull();
  });

  it('parses cycles, rejecting impossible dates', () => {
    expect(parseAtcfCycle('2026100806').toISOString()).toBe('2026-10-08T06:00:00.000Z');
    expect(parseAtcfCycle('2026023106')).toBeNull();
    expect(parseAtcfCycle('2026100825')).toBeNull();
    expect(parseAtcfCycle('20261008')).toBeNull();
    expect(toCycle('2026-10-08T06:00:00Z')).toBe('2026100806');
    expect(toCycle('2026100806')).toBe('2026100806');
    expect(toCycle('2026-10-08T06:30:00Z')).toBeNull();
  });

  it('adds valid times from the init time and forecast hour', () => {
    const { runs } = buildRuns(parseAtcf(line({ tau: 36 })).records);
    expect(runs[0].points[0]).toMatchObject({ tau: 36, validTime: '2026-10-09T18:00:00Z' });
  });
});

describe('ATCF records', () => {
  it('identifies the model and storm on each line', () => {
    const rec = parseAtcfLine(line({ tech: 'UKX' }));
    expect(rec).toMatchObject({ basin: 'AL', stormNumber: 9, cycle: '2026100806', technique: 'UKX', tau: 12, latitude: 24.2, longitude: -90 });
    expect(rec.radii).toEqual({ ne: 110, se: 70, sw: 50, nw: 100 });
  });

  it('treats 0 wind, 0 pressure and 0N 0W as missing, not as values', () => {
    const rec = parseAtcfLine(line({ vmax: 0, mslp: 0, quads: [0, 0, 0, 0] }));
    expect(rec).toMatchObject({ maxWindKt: null, minPressureMb: null, radii: null });
    const parsed = parseAtcf(line({ lat: '0N', lon: '0W' }));
    expect(parsed.records).toHaveLength(0);
    expect(parsed.stats).toMatchObject({ missingPosition: 1, malformed: 0 });
  });

  it('accepts lines with only the required fields', () => {
    const rec = parseAtcfLine('AL, 09, 2026100806, 03, TABM,  12, 242N,  900W,   0,');
    expect(rec).toMatchObject({ technique: 'TABM', tau: 12, maxWindKt: null, minPressureMb: null, stormType: null, radii: null });
  });

  it('counts and skips malformed records without failing the file', () => {
    const text = [
      line(),
      'not an atcf line',
      'AL, 09, 2026100806, 03, HFSA,  12',
      line({ cycle: '2026139906' }),
      line({ tau: 'xx' }),
      line({ lat: '242Q' }),
      line({ tech: 'H$SA' }),
      '',
      line({ tau: 24, lat: '255N', lon: '885W' }),
    ].join('\n');
    const { records, stats } = parseAtcf(text);
    expect(records).toHaveLength(2);
    expect(stats.malformed).toBe(6);
    expect(stats.errors).toEqual({ 'too-few-fields': 2, 'bad-cycle': 1, 'bad-tau': 1, 'bad-position': 1, 'bad-technique': 1 });
  });

  it('drops lines filed under another storm', () => {
    const { records, stats } = parseAtcf([line(), line({ cy: '10' })].join('\n'), { basin: 'AL', stormNumber: 9 });
    expect(records).toHaveLength(1);
    expect(stats.otherStorm).toBe(1);
  });
});

describe('runs', () => {
  it('folds the 34/50/64 kt lines of an hour into one point with all radii', () => {
    const text = [
      line({ rad: 34, quads: [110, 70, 50, 100] }),
      line({ rad: 50, quads: [45, 40, 30, 30] }),
      line({ rad: 64, quads: [15, 15, 15, 20] }),
    ].join('\n');
    const { runs, duplicates } = buildRuns(parseAtcf(text).records);
    expect(duplicates).toBe(0);
    expect(runs[0].points).toHaveLength(1);
    expect(runs[0].points[0].windRadiiNm).toEqual({
      34: { ne: 110, se: 70, sw: 50, nw: 100 },
      50: { ne: 45, se: 40, sw: 30, nw: 30 },
      64: { ne: 15, se: 15, sw: 15, nw: 20 },
    });
  });

  it('removes duplicate lines and keeps the first position on a conflict', () => {
    const text = [line(), line(), line({ lat: '250N' }), line({ tau: 0, lat: '231N', lon: '916W' })].join('\n');
    const { runs, duplicates, conflicts } = buildRuns(parseAtcf(text).records);
    expect(duplicates).toBe(1);
    expect(conflicts).toBe(1);
    expect(runs[0].points.map((p) => [p.tau, p.latitude])).toEqual([[0, 23.1], [12, 24.2]]);
  });

  it('sorts points chronologically whatever the line order', () => {
    const text = [36, 0, 24, 12].map((tau) => line({ tau })).join('\n');
    const { runs } = buildRuns(parseAtcf(text).records);
    expect(runs[0].points.map((p) => p.tau)).toEqual([0, 12, 24, 36]);
  });

  it('keeps one run per model and cycle', () => {
    const { runs } = indexADeck(ISAIAS, STORM);
    const hfsa = runs.filter((r) => r.technique === 'HFSA').map((r) => r.cycle).sort();
    expect(hfsa).toEqual(['2026100700', '2026100800']);
  });
});

describe('storm ids', () => {
  it('accepts NHC basins, storm and invest numbers, and nothing else', () => {
    expect(parseStormId('al092026')).toEqual({ stormId: 'AL092026', basin: 'AL', stormNumber: 9, year: 2026, file: 'aal092026.dat.gz' });
    expect(parseStormId('EP922026')?.stormNumber).toBe(92);
    for (const bad of ['WP092026', 'AL002026', 'AL602026', 'AL09202', 'AL092026x', '../etc/passwd', 'AL09 2026', null]) {
      expect(parseStormId(bad)).toBeNull();
    }
  });
});

describe('the normalized storm response (Isaias, real NHC lines)', () => {
  const body = buildStormModels(ISAIAS, STORM, {
    now: NOW,
    source: { url: 'https://ftp.nhc.noaa.gov/atcf/aid_public/aal092026.dat.gz', lastModified: '2026-10-08T12:30:30Z' },
  });
  const model = (id) => body.models.find((m) => m.id === id);

  it('describes the storm and the data it came from', () => {
    expect(body).toMatchObject({
      schemaVersion: 1,
      stormId: 'AL092026',
      basin: 'AL',
      stormNumber: 9,
      year: 2026,
      stormName: 'ISAIAS',
      updatedAt: '2026-10-08T12:30:30Z',
      generatedAt: '2026-10-08T12:40:00Z',
      latestCycle: '2026-10-08T12:00:00Z',
      asOf: '2026-10-08T12:00:00Z',
      stale: false,
      staleReason: null,
    });
    expect(body.source.file).toBe('aal092026.dat.gz');
    expect(body.stats.malformed).toBe(0);
  });

  it('keeps the current position apart from the forecast points', () => {
    expect(body.currentPosition).toEqual({
      time: '2026-10-08T12:00:00Z', latitude: 23.4, longitude: -90.6, maxWindKt: 70, minPressureMb: 976, stormType: 'HU',
    });
  });

  it('lists every registry model in order, each with a status', () => {
    expect(body.models.map((m) => m.id)).toEqual(MODEL_ORDER);
    expect(Object.fromEntries(body.models.map((m) => [m.id, m.status]))).toEqual({
      OFCL: 'available', HFSA: 'available', HFSB: 'available', AVNO: 'available', EMX: 'unavailable',
      UKX: 'available', CMC: 'available', CTCX: 'available', HWRF: 'available', HMON: 'available',
    });
  });

  it("uses each model's newest run and its actual forecast points", () => {
    expect(model('HFSA')).toMatchObject({ name: 'HAFS-A', category: 'operational', technique: 'HFSA', initTime: '2026-10-08T00:00:00Z', ageHours: 12 });
    expect(model('UKX')).toMatchObject({ name: 'UKMET', technique: 'UKX', initTime: '2026-10-08T00:00:00Z' });
    expect(model('UKX').points[0]).toMatchObject({ tau: 0, latitude: 22.6, longitude: -92.4, maxWindKt: 36, minPressureMb: 1001 });
    const ofcl = model('OFCL');
    expect(ofcl).toMatchObject({ name: 'NHC Official', category: 'official', initTime: '2026-10-08T06:00:00Z' });
    expect(ofcl.points.map((p) => p.tau)).toEqual([0, 3, 12, 24, 36]);
    expect(ofcl.points[0]).toMatchObject({
      tau: 0,
      validTime: '2026-10-08T06:00:00Z',
      latitude: 23.1,
      longitude: -91.6,
      maxWindKt: 70,
      minPressureMb: null,
      stormType: 'HU',
      windRadiiNm: { 34: { ne: 80, se: 40, sw: 40, nw: 80 }, 50: { ne: 30, se: 25, sw: 25, nw: 20 }, 64: { ne: 0, se: 0, sw: 10, nw: 15 } },
    });
  });

  it('reports a model missing from the data instead of dropping it', () => {
    expect(model('EMX')).toMatchObject({ name: 'ECMWF', status: 'unavailable', initTime: null, points: [] });
    expect(model('EMX').error).toMatch(/public ATCF/);
  });

  it('marks HWRF and HMON as legacy', () => {
    expect(model('HWRF').category).toBe('legacy');
    expect(model('HMON').category).toBe('legacy');
    expect(DEFAULT_MODEL_IDS).not.toContain('HWRF');
    expect(DEFAULT_MODEL_IDS).not.toContain('HMON');
    expect(DEFAULT_MODEL_IDS).toContain('OFCL');
  });

  it('puts the other track guidance in groups, without intensity-only aids or registry models', () => {
    expect(body.guidance.map((g) => [g.id, g.group])).toEqual([['AP01', 'ensemble'], ['TABM', 'statistical'], ['TVCN', 'consensus']]);
    const ids = body.guidance.map((g) => g.id);
    for (const tech of ['SHF5', 'CARQ', 'AVNI', 'HFAI', 'OFCI']) expect(ids).not.toContain(tech);
  });

  it('lists the cycles in the deck, newest first', () => {
    expect(body.cycles).toEqual(['2026-10-08T12:00:00Z', '2026-10-08T06:00:00Z', '2026-10-08T00:00:00Z', '2026-10-07T00:00:00Z']);
  });
});

describe('multiple cycles and staleness', () => {
  const index = indexADeck(ISAIAS, STORM);

  it('answers as of an earlier cycle', () => {
    const body = buildModelResponse(index, { asOf: '2026100700', now: NOW });
    expect(body).toMatchObject({ asOf: '2026-10-07T00:00:00Z', historical: true, stale: false });
    expect(body.models.find((m) => m.id === 'HFSA')).toMatchObject({ status: 'available', initTime: '2026-10-07T00:00:00Z' });
    expect(body.models.find((m) => m.id === 'OFCL').status).toBe('unavailable');
  });

  it('returns null for a cycle the deck does not have', () => {
    expect(buildModelResponse(index, { asOf: '2026100518', now: NOW })).toBeNull();
  });

  it('flags a run that lags the newest guidance as stale, then drops its track', () => {
    const text = [
      ...[0, 12].map((tau) => line({ cycle: '2026100812', tech: 'OFCL', tau })),
      ...[0, 12].map((tau) => line({ cycle: '2026100712', tech: 'HFSA', tau })),
      ...[0, 12].map((tau) => line({ cycle: '2026100600', tech: 'AVNO', tau })),
    ].join('\n');
    const body = buildStormModels(text, STORM, { now: NOW });
    const byId = Object.fromEntries(body.models.map((m) => [m.id, m]));
    expect(byId.HFSA).toMatchObject({ status: 'stale', ageHours: 24 });
    expect(byId.HFSA.points).toHaveLength(2);
    expect(byId.AVNO).toMatchObject({ status: 'unavailable', initTime: '2026-10-06T00:00:00Z', points: [] });
  });

  it('never presents old live data as current', () => {
    const body = buildStormModels(ISAIAS, STORM, { now: Date.parse('2026-10-09T12:00:00Z') });
    expect(body).toMatchObject({ stale: true, staleReason: 'no-recent-guidance' });
    expect(buildStormModels('', STORM, { now: NOW })).toMatchObject({ stale: true, staleReason: 'no-guidance', models: expect.any(Array) });
  });
});

describe('model registry', () => {
  it('holds the verified ATCF identifiers', () => {
    expect(HURRICANE_MODELS.HFSA.techniques).toEqual(['HFSA']);
    expect(HURRICANE_MODELS.HFSB.techniques).toEqual(['HFSB']);
    expect(HURRICANE_MODELS.AVNO.name).toBe('GFS');
    expect(HURRICANE_MODELS.UKX.techniques).toEqual(['UKX', 'EGRR']);
    expect(HURRICANE_MODELS.CMC.techniques).toEqual(['CMC']);
    expect(HURRICANE_MODELS.CTCX.name).toBe('COAMPS-TC');
    expect(HURRICANE_MODELS.OFCL.category).toBe('official');
    expect(MODEL_ORDER.every((id) => HURRICANE_MODELS[id].id === id && /^#[0-9a-f]{6}$/.test(HURRICANE_MODELS[id].color))).toBe(true);
  });
});
