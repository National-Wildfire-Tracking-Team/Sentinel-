import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MODEL_IDS, defaultModelSelection, fetchModelTracks, findInvestModelRun, modelTracksGeoJSON,
  normalizeModelSelection, recentInvestIds, resetModelTrackCache,
} from '../../src/app/api/nhcModelTracks';
import { buildStormModels, parseStormId } from '../../src/app/api/atcf/guidance.mjs';

const fixture = (name) => readFileSync(join(process.cwd(), 'Tests/Vitest/fixtures/nhc', name), 'utf8');
// Real NHC a-deck lines for Isaias (AL092026), Oct 7-8 2026; see atcfParser.test.js.
const ISAIAS = fixture('aal092026-models.dat');
// Excerpt of NHC's a-deck for Hurricane Rachel (EP182026): two cycles of
// OFCL, AVNI, TVCN, TABM plus CARQ analysis and SHIP intensity lines.
const RACHEL = fixture('aep182026-sample.dat');
// Excerpt of Invest 92L (AL922026): raw GFS/HWRF and two GEFS members at
// 12Z, statistical aids at 18Z (no CARQ analysis).
const INVEST = fixture('aal922026-sample.dat');

const NOW = Date.parse('2026-10-08T12:40:00Z');
const isaias = buildStormModels(ISAIAS, parseStormId('AL092026'), { now: NOW });
const gzBuffer = (text) => {
  const gz = gzipSync(text);
  return gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.length);
};

describe('model selection', () => {
  it('defaults to the official forecast and every operational model, no legacy ones', () => {
    expect(defaultModelSelection()).toEqual({ models: ['OFCL', 'HFSA', 'HFSB', 'AVNO', 'EMX', 'UKX', 'CMC', 'CTCX'], groups: [] });
    expect(DEFAULT_MODEL_IDS).not.toContain('HWRF');
  });

  it('keeps only known ids, in registry order', () => {
    expect(normalizeModelSelection({ models: ['HMON', 'bogus', 'OFCL'], groups: ['ensemble', 'nope'] }))
      .toEqual({ models: ['OFCL', 'HMON'], groups: ['ensemble'] });
    expect(normalizeModelSelection({})).toEqual(defaultModelSelection());
  });
});

describe('modelTracksGeoJSON', () => {
  const lines = (sel) => modelTracksGeoJSON(isaias, sel).features.filter((f) => f.geometry.type === 'LineString');

  it('draws one line per selected model from its forecast points, plus where the storm is now', () => {
    const fc = modelTracksGeoJSON(isaias, { models: ['OFCL', 'HFSA', 'EMX'], groups: [] });
    const drawn = fc.features.filter((f) => f.geometry.type === 'LineString');
    // ECMWF is selected but has no track: nothing drawn for it.
    expect(drawn.map((f) => f.properties.id)).toEqual(['OFCL', 'HFSA']);
    const ofcl = drawn[0];
    expect(ofcl.properties).toMatchObject({ kind: 'official', label: 'NHC Official', color: '#ffffff', dashed: false, sortKey: 2 });
    expect(ofcl.geometry.coordinates[0]).toEqual([-91.6, 23.1]);
    expect(fc.features.filter((f) => f.properties.end)).toHaveLength(2);
    expect(fc.features.find((f) => f.properties.kind === 'current').geometry.coordinates).toEqual([-90.6, 23.4]);
  });

  it('dashes legacy models so they never read as current guidance', () => {
    const [hwrf] = lines({ models: ['HWRF'], groups: [] });
    expect(hwrf.properties).toMatchObject({ category: 'legacy', dashed: true });
  });

  it('adds other guidance by group', () => {
    expect(lines({ models: [], groups: ['consensus', 'ensemble'] }).map((f) => [f.properties.id, f.properties.group]))
      .toEqual([['AP01', 'ensemble'], ['TVCN', 'consensus']]);
  });

  it('draws nothing (not even the storm marker) when nothing is selected', () => {
    expect(modelTracksGeoJSON(isaias, { models: [], groups: [] }).features).toEqual([]);
    expect(modelTracksGeoJSON(null).features).toEqual([]);
  });
});

describe('invests', () => {
  afterEach(() => {
    resetModelTrackCache();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const INDEX = `
<a href="aal912026.dat.gz">aal912026.dat.gz</a>        2026-09-28 14:32   21K
<a href="aal922026.dat.gz">aal922026.dat.gz</a>        2026-10-06 18:44   61K
<a href="aep182026.dat.gz">aep182026.dat.gz</a>        2026-10-06 14:49  1.6M
<a href="aep922026.dat.gz">aep922026.dat.gz</a>        2026-10-06 18:42   69K`;

  it('lists invests NHC updated in the last 36 hours', () => {
    expect(recentInvestIds(INDEX, Date.parse('2026-10-06T20:00:00Z'))).toEqual(['AL922026', 'EP922026']);
  });

  it('matches an outlook system to the invest at its position', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T20:00:00Z'));
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.endsWith('/')) return { ok: true, text: async () => INDEX };
      if (url.includes('aal922026')) return { ok: true, arrayBuffer: async () => gzBuffer(INVEST) };
      return { ok: false, status: 404 };
    }));
    // The Atlantic outlook disturbance sits at 22.5N 96.2W.
    expect(await findInvestModelRun({ lat: 22.54, lng: -96.17 })).toBe('AL922026');
    // An area of interest far from any invest has no model runs.
    expect(await findInvestModelRun({ lat: 12, lng: -40 })).toBeNull();
  });
});

describe('fetchModelTracks', () => {
  afterEach(() => {
    resetModelTrackCache();
    vi.unstubAllGlobals();
  });

  it('without the service, reads the gzipped a-deck through the proxy and normalizes it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => gzBuffer(RACHEL) })));
    const data = await fetchModelTracks('EP182026', { serviceUrl: null });
    expect(fetch).toHaveBeenCalledWith('/api/nws/nhc-atcf/aep182026.dat.gz');
    expect(data).toMatchObject({ stormId: 'EP182026', stormName: 'RACHEL', via: 'browser' });
    expect(data.models.find((m) => m.id === 'OFCL').points.length).toBeGreaterThan(1);
  });

  it('uses the hurricane-models service when configured', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => isaias })));
    const data = await fetchModelTracks('AL092026', { serviceUrl: 'https://cdn.example/hurricane-models/' });
    expect(fetch).toHaveBeenCalledWith('https://cdn.example/hurricane-models/v1/hurricanes/AL092026/models');
    expect(data.via).toBe('service');
  });

  it('falls back to the a-deck when the service fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async (url) => (url.startsWith('https://')
      ? { ok: false, status: 502 }
      : { ok: true, arrayBuffer: async () => gzBuffer(INVEST) })));
    const data = await fetchModelTracks('AL922026', { serviceUrl: 'https://cdn.example/hurricane-models' });
    expect(data.via).toBe('browser');
    expect(fetch).toHaveBeenLastCalledWith('/api/nws/nhc-atcf/aal922026.dat.gz');
    warn.mockRestore();
  });

  it('rejects ids that are not ATCF storm ids, without fetching', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(fetchModelTracks('../etc')).rejects.toThrow(/ATCF/);
    await expect(fetchModelTracks('WP012026')).rejects.toThrow(/ATCF/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
