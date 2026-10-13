import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchModelTracks, findInvestModelRun, modelTracksGeoJSON, parseADeck, recentInvestIds,
} from '../../src/app/api/nhcModelTracks';

// Excerpt of NHC's a-deck for Hurricane Rachel (EP182026): two cycles of
// OFCL, AVNI, TVCN, TABM plus CARQ analysis and SHIP intensity lines.
const ADECK = readFileSync(join(process.cwd(), 'Tests/Vitest/fixtures/nhc/aep182026-sample.dat'), 'utf8');
// Excerpt of Invest 92L (AL922026): raw GFS/HWRF and two GEFS members at
// 12Z, statistical aids at 18Z.
const INVEST = readFileSync(join(process.cwd(), 'Tests/Vitest/fixtures/nhc/aal922026-sample.dat'), 'utf8');

describe('parseADeck', () => {
  it('keeps the latest cycle, one point per hour, and drops analysis and intensity-only aids', () => {
    const { cycle, tracks } = parseADeck(ADECK);
    expect(cycle).toBe('2026100612');
    expect(tracks.map((t) => t.tech).sort()).toEqual(['AVNI', 'OFCL', 'TABM', 'TVCN']);
    const ofcl = tracks.find((t) => t.tech === 'OFCL');
    expect(ofcl).toMatchObject({ label: 'NHC official', group: 'official' });
    expect(ofcl.points[0]).toEqual({ tau: 0, lat: 20.4, lng: -119.1, windKt: 75 });
    expect(new Set(ofcl.points.map((p) => p.tau)).size).toBe(ofcl.points.length);
  });

  it('builds lines for a group, always with the official forecast', () => {
    const data = parseADeck(ADECK);
    const techs = (group) => modelTracksGeoJSON(data, group).features.filter((f) => !f.properties.end).map((f) => f.properties.tech).sort();
    expect(techs('all')).toEqual(['AVNI', 'OFCL', 'TABM', 'TVCN']);
    expect(techs('dynamical')).toEqual(['AVNI', 'OFCL']);
    expect(techs('consensus')).toEqual(['OFCL', 'TVCN']);
    expect(techs('statistical')).toEqual(['OFCL', 'TABM']);
  });
});

describe('parseADeck across cycles', () => {
  it("draws each model's newest run from the last 12 hours, and knows where the system is", () => {
    const { cycle, position, tracks } = parseADeck(INVEST);
    expect(cycle).toBe('2026100618');
    expect(position).toEqual({ lat: 22.1, lng: -95.7 });
    const byTech = Object.fromEntries(tracks.map((t) => [t.tech, t]));
    expect(Object.keys(byTech).sort()).toEqual(['AP01', 'AP02', 'AVNO', 'HWRF', 'TABM', 'XTRP']);
    expect(byTech.AVNO).toMatchObject({ label: 'GFS', group: 'dynamical', cycle: '2026100612' });
    expect(byTech.AP01).toMatchObject({ label: 'GEFS member 1', group: 'ensemble' });
    expect(byTech.TABM.cycle).toBe('2026100618');
  });

  it('prefers a model\'s interpolated run and drops runs older than 12 hours', () => {
    const line = (cycle, tech, tau, lat, lon) => `AL, 92, ${cycle}, 03, ${tech}, ${tau}, ${lat}, ${lon},  30,`;
    const text = [
      line('2026100618', 'AVNI', 0, '221N', '958W'), line('2026100618', 'AVNI', 12, '225N', '965W'),
      line('2026100612', 'AVNO', 0, '219N', '955W'), line('2026100612', 'AVNO', 12, '223N', '962W'),
      line('2026100600', 'HWRF', 0, '215N', '950W'), line('2026100600', 'HWRF', 12, '220N', '958W'),
    ].join('\n');
    expect(parseADeck(text).tracks.map((t) => t.tech)).toEqual(['AVNI']);
  });

  it('keeps ensemble members out of "all models" and in their own group', () => {
    const data = parseADeck(INVEST);
    const techs = (group) => modelTracksGeoJSON(data, group).features.filter((f) => !f.properties.end).map((f) => f.properties.tech).sort();
    expect(techs('all')).toEqual(['AVNO', 'HWRF', 'TABM', 'XTRP']);
    expect(techs('ensemble')).toEqual(['AP01', 'AP02']);
  });
});

describe('invests', () => {
  afterEach(() => vi.unstubAllGlobals());

  const INDEX = `
<a href="aal912026.dat.gz">aal912026.dat.gz</a>        2026-09-28 14:32   21K
<a href="aal922026.dat.gz">aal922026.dat.gz</a>        2026-10-06 18:44   61K
<a href="aep182026.dat.gz">aep182026.dat.gz</a>        2026-10-06 14:49  1.6M
<a href="aep922026.dat.gz">aep922026.dat.gz</a>        2026-10-06 18:42   69K`;

  it('lists invests NHC updated in the last 36 hours', () => {
    expect(recentInvestIds(INDEX, Date.parse('2026-10-06T20:00:00Z'))).toEqual(['AL922026', 'EP922026']);
  });

  it('matches an outlook system to the invest at its position', async () => {
    vi.setSystemTime(new Date('2026-10-06T20:00:00Z'));
    const gz = gzipSync(INVEST);
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.endsWith('/')) return { ok: true, text: async () => INDEX };
      if (url.includes('aal922026')) return { ok: true, arrayBuffer: async () => gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.length) };
      return { ok: false, status: 404 };
    }));
    try {
      // The Atlantic outlook disturbance sits at 22.5N 96.2W.
      expect(await findInvestModelRun({ lat: 22.54, lng: -96.17 })).toBe('AL922026');
      // An area of interest far from any invest has no model runs.
      expect(await findInvestModelRun({ lat: 12, lng: -40 })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('fetchModelTracks', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches the gzipped a-deck through the proxy and inflates it', async () => {
    const gz = gzipSync(ADECK);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.length) })));
    const data = await fetchModelTracks('EP182026');
    expect(fetch).toHaveBeenCalledWith('/api/nws/nhc-atcf/aep182026.dat.gz');
    expect(data.tracks).toHaveLength(4);
  });

  it('rejects ids that are not ATCF storm ids', async () => {
    await expect(fetchModelTracks('../etc')).rejects.toThrow(/ATCF/);
  });
});
