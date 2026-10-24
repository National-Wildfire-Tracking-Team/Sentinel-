import { afterEach, describe, expect, it, vi } from 'vitest';
import { bunzip2 } from '../../src/app/utils/bzip2';
import { parseLevel3, levelToValue } from '../../src/app/utils/nexradLevel3';
import { buildSweep, scanBounds } from '../../src/app/utils/radarSweep';
import { downStations, keyTime, latestScanKey } from '../../src/app/api/nexradLevel3';

const b64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

// `bzip2 -9` of 'aaaaaaaaaaaaaaaaaaaabbbbbcd' × 40 + 'radar site N0B' (exercises RLE runs)
const BZ_TEXT = 'QlpoOTFBWSZTWRh/ju0AAGb9gCAAQABAAEAAEAE+IBwAIABUMiNNNDagVKg02moGRGRF+aqsCSa7kh1tQkliLBHSSBLJYni+LuSKcKEgMP8d2g==';

// Symbology block: 4 quadrant radials × 8 gates, packet 16. Radial 0 (0–90°)
// is level 146 (40 dBZ) at every gate; the rest are below threshold / folded.
function symbology() {
  const body = [];
  const u16 = (v) => body.push((v >> 8) & 255, v & 255);
  const i32 = (v) => body.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  u16(0xffff); u16(1); i32(0); u16(1); u16(0xffff); i32(0);
  u16(16); u16(0); u16(8); u16(0); u16(0); u16(999); u16(4);
  [0, 90, 180, 270].forEach((start, r) => {
    u16(8); u16(start * 10); u16(900);
    for (let g = 0; g < 8; g++) body.push(r === 0 ? 146 : g === 0 ? 0 : 1);
  });
  return new Uint8Array(body);
}
// `bzip2 -9` of symbology()
const BZ_SYMBOLOGY = 'QlpoOTFBWSZTWcb0b30AACbgYezQQAAEBBAAAIAAAKAAVEaAACU9QkeoxqeUGJaV9EhxwwkMIWFjXu2y3lSbQjSC6BS6Tp4u5IpwoSGN6N76';

/** A Level 3 TZ0-style product: WMO header + message header + PDB + symbology. */
function product({ compressed, code = 180, scaleOffset = null }) {
  const wmo = new TextEncoder().encode('SDUS54 KOUN 151950\r\r\nTZ0DAL\r\r\n');
  const head = new DataView(new ArrayBuffer(120));
  head.setInt16(0, 180); // message code
  head.setInt16(18, -1); // PDB divider
  head.setInt32(20, 32926); // lat ×1000
  head.setInt32(24, -96968); // lon ×1000
  head.setInt16(28, 622);
  head.setInt16(30, code); // product code
  head.setInt16(34, 90); // VCP
  head.setInt16(40, 20377); // 2025-10-15 (Julian day, 1 = 1970-01-01)
  head.setInt32(42, 19 * 3600 + 45 * 60 + 58);
  head.setInt16(58, 5); // 0.5°
  if (scaleOffset) {
    head.setFloat32(60, scaleOffset[0]); // dual-pol: float scale, offset
    head.setFloat32(64, scaleOffset[1]);
  } else {
    head.setInt16(60, -320); // min -32.0 dBZ
    head.setInt16(62, 5); // 0.5 dBZ steps
    head.setInt16(64, 254);
  }
  const sym = compressed ? b64(BZ_SYMBOLOGY) : symbology();
  if (compressed) head.setInt16(100, 1);
  else head.setInt32(108, 60); // symbology offset in halfwords
  const out = new Uint8Array(wmo.length + 120 + sym.length);
  out.set(wmo, 0);
  out.set(new Uint8Array(head.buffer), wmo.length);
  out.set(sym, wmo.length + 120);
  return out;
}

describe('bunzip2', () => {
  it('decodes a bzip2 stream, including run-length encoded repeats', () => {
    const expected = 'aaaaaaaaaaaaaaaaaaaabbbbbcd'.repeat(40) + 'radar site N0B';
    expect(new TextDecoder().decode(bunzip2(b64(BZ_TEXT)))).toBe(expected);
  });

  it('rejects data that is not bzip2', () => {
    expect(() => bunzip2(new Uint8Array([1, 2, 3, 4, 5, 6]))).toThrow(/bzip2/);
  });
});

describe('parseLevel3', () => {
  it.each([false, true])('decodes header and radials (compressed: %s)', (compressed) => {
    const scan = parseLevel3(product({ compressed }));
    expect(scan).toMatchObject({
      productCode: 180, lat: 32.926, lon: -96.968, vcp: 90, elevation: 0.5,
      valueMin: -32, valueInc: 0.5, gateKm: 0.15, firstGate: 0, gates: 8,
    });
    expect(new Date(scan.time).toISOString()).toBe('2025-10-15T19:45:58.000Z');
    expect(scan.radials).toHaveLength(4);
    expect(scan.radials[1]).toMatchObject({ start: 90, width: 90 });
    expect(levelToValue(scan.radials[0].data[3], scan)).toBe(40);
    expect(levelToValue(scan.radials[1].data[0], scan)).toBeNull();
  });

  it('reads velocity like reflectivity, in m/s', () => {
    const scan = parseLevel3(product({ compressed: false, code: 154 }));
    expect(scan).toMatchObject({ productCode: 154, gateKm: 0.25 });
  });

  it.each([
    [161, [300, -60.5], 2, (2 + 60.5) / 300], // correlation coefficient
    [159, [16, 128], 144, 1], // differential reflectivity, dB
  ])('reads dual-pol product %i through its float scale and offset', (code, so, level, value) => {
    const scan = parseLevel3(product({ compressed: false, code, scaleOffset: so }));
    expect(scan.gateKm).toBe(0.25);
    expect(levelToValue(level, scan)).toBeCloseTo(value, 6);
  });

  it('rejects unsupported products', () => {
    const bytes = product({ compressed: false });
    const messageStart = 30; // after the two WMO header lines
    new DataView(bytes.buffer).setInt16(messageStart + 30, 94); // product code → 94
    expect(() => parseLevel3(bytes)).toThrow(/Unsupported Level 3 product code 94/);
  });
});

describe('buildSweep', () => {
  it('packs gates per radial, an azimuth lookup and the NWS palette', () => {
    const scan = parseLevel3(product({ compressed: false }));
    const sweep = buildSweep(scan);
    expect(sweep).toMatchObject({ lat: 32.926, lon: -96.968, gateKm: 0.15, firstGate: 0, gates: 8, radialCount: 4 });
    expect(sweep.bounds).toEqual(scanBounds(scan));
    // Row-major gates × radials
    expect(Array.from(sweep.data.subarray(0, 8))).toEqual(Array(8).fill(146));
    expect(Array.from(sweep.data.subarray(8, 16))).toEqual([0, 1, 1, 1, 1, 1, 1, 1]);
    // 0.1° buckets → radial index + 1: 0–89.9° is radial 0, 90° starts radial 1
    expect(sweep.azIndex).toHaveLength(3600);
    expect(sweep.azIndex[0]).toBe(1);
    expect(sweep.azIndex[899]).toBe(1);
    expect(sweep.azIndex[900]).toBe(2);
    expect(sweep.azIndex[3599]).toBe(4);
    // Level 146 = 40 dBZ → #e5bc00; below threshold / range folded are transparent
    expect(Array.from(sweep.palette.subarray(146 * 4, 147 * 4))).toEqual([0xe5, 0xbc, 0x00, 255]);
    expect(sweep.palette[0 * 4 + 3]).toBe(0);
    expect(sweep.palette[1 * 4 + 3]).toBe(0);
  });

  it('colours velocity with range-folded gates in purple', () => {
    const scan = parseLevel3(product({ compressed: false, code: 182 }));
    const { palette } = buildSweep(scan);
    expect(Array.from(palette.subarray(4, 8))).toEqual([0x7d, 0x2f, 0xbf, 255]);
    expect(palette[3]).toBe(0); // below threshold stays transparent
    // Level 2 is −32 m/s here: strongly inbound → green
    expect(palette[2 * 4 + 1]).toBeGreaterThan(palette[2 * 4]);
  });

  it('bounds the full coverage circle on the sphere', () => {
    const { north, south, east, west } = scanBounds({ lat: 60, lon: -150, gateKm: 1, firstGate: 0, gates: 460 });
    expect(north - 60).toBeCloseTo(4.137, 2);
    expect(60 - south).toBeCloseTo(4.137, 2);
    // At 60°N the circle reaches further east/west than dLat / cos(lat)
    expect(east + 150).toBeGreaterThan(4.137 / Math.cos(Math.PI / 3));
    expect(east + 150).toBeCloseTo(-150 - west, 9);
  });
});

describe('latestScanKey', () => {
  afterEach(() => vi.unstubAllGlobals());

  const listing = (keys) => ({ ok: true, text: async () => `<ListBucketResult>${keys.map((k) => `<Contents><Key>${k}</Key></Contents>`).join('')}</ListBucketResult>` });

  it('lists the current UTC hour for the site\'s product and returns the newest key', async () => {
    const fetchMock = vi.fn(async () => listing(['TLX_N0B_2026_10_15_19_50_39', 'TLX_N0B_2026_10_15_19_47_28']));
    vi.stubGlobal('fetch', fetchMock);
    const key = await latestScanKey({ id: 'KTLX', type: 'wsr88d' }, { now: Date.UTC(2026, 9, 15, 19, 55) });
    expect(key).toBe('TLX_N0B_2026_10_15_19_50_39');
    expect(fetchMock.mock.calls[0][0]).toContain('prefix=TLX_N0B_2026_10_15_19_');
  });

  it('falls back to earlier hours (across midnight) and uses TZ0 for TDWR', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(listing([]))
      .mockResolvedValueOnce(listing(['DAL_TZ0_2026_10_14_23_58_02']));
    vi.stubGlobal('fetch', fetchMock);
    const key = await latestScanKey({ id: 'TDAL', type: 'tdwr' }, { now: Date.UTC(2026, 9, 15, 0, 3) });
    expect(key).toBe('DAL_TZ0_2026_10_14_23_58_02');
    expect(fetchMock.mock.calls[0][0]).toContain('prefix=DAL_TZ0_2026_10_15_00_');
    expect(fetchMock.mock.calls[1][0]).toContain('prefix=DAL_TZ0_2026_10_14_23_');
  });

  it.each([
    ['velocity', 'KTLX', 'wsr88d', 'TLX_N0G_'],
    ['cc', 'KTLX', 'wsr88d', 'TLX_N0C_'],
    ['zdr', 'KTLX', 'wsr88d', 'TLX_N0X_'],
    ['velocity', 'TDAL', 'tdwr', 'DAL_TV0_'],
  ])('lists the %s product for %s', async (kind, id, type, prefix) => {
    const fetchMock = vi.fn(async () => listing([`${prefix}2026_10_15_19_50_39`]));
    vi.stubGlobal('fetch', fetchMock);
    await latestScanKey({ id, type }, { kind, now: Date.UTC(2026, 9, 15, 19, 55) });
    expect(fetchMock.mock.calls[0][0]).toContain(`prefix=${prefix}2026_10_15_19_`);
  });

  it('has no correlation coefficient or ZDR for TDWR', async () => {
    await expect(latestScanKey({ id: 'TDAL', type: 'tdwr' }, { kind: 'cc' })).rejects.toThrow(/Unsupported/);
  });

  it('returns null when the station has no recent scans', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => listing([])));
    expect(await latestScanKey({ id: 'RODN', type: 'wsr88d' })).toBeNull();
  });

  it('reads scan time from a key', () => {
    expect(keyTime('TLX_N0B_2026_10_15_19_50_39')).toBe(Date.UTC(2026, 9, 15, 19, 50, 39));
  });
});

describe('RadarSiteProvider', () => {
  afterEach(() => vi.resetModules());

  it('loads only the selected station and never shows a previous station\'s scan', async () => {
    vi.doMock('../../src/app/api/nexradLevel3', () => ({
      siteProduct: () => ({ code: 'N0B', label: 'Base Reflectivity' }),
      fetchDownStations: vi.fn(async () => new Set()),
      latestScanKey: vi.fn(async (site) => `${site.id.slice(1)}_N0B_2026_10_15_20_00_00`),
      fetchScan: vi.fn(async (key) => key),
    }));
    vi.doMock('../../src/app/utils/radarSiteRender', () => ({
      warmRadarScanWorker: vi.fn(),
      decodeSweepAsync: vi.fn(async (key) => ({ scan: { time: Date.now(), key }, sweep: { key } })),
    }));

    const { renderHook, act, waitFor } = await import('@testing-library/react');
    const { RadarSiteProvider, useRadarSiteContext } = await import('../../src/app/context/RadarSiteContext');
    const api = await import('../../src/app/api/nexradLevel3');
    const wrapper = ({ children }) => <RadarSiteProvider active>{children}</RadarSiteProvider>;
    const seen = [];
    const { result } = renderHook(() => {
      const v = useRadarSiteContext();
      seen.push([v.selectedId, v.scan?.key ?? null]);
      return v;
    }, { wrapper });

    await waitFor(() => expect(result.current.sites?.length).toBeGreaterThan(100));
    expect(api.latestScanKey).not.toHaveBeenCalled();

    act(() => result.current.selectSite('KTLX'));
    await waitFor(() => expect(result.current.scan?.key).toBe('TLX_N0B_2026_10_15_20_00_00'));
    act(() => result.current.selectSite('KFWS'));
    await waitFor(() => expect(result.current.scan?.key).toBe('FWS_N0B_2026_10_15_20_00_00'));

    expect(api.latestScanKey.mock.calls.map(([s]) => s.id)).toEqual(['KTLX', 'KFWS']);
    expect(seen.filter(([id, key]) => id === 'KFWS' && key?.startsWith('TLX'))).toEqual([]);

    expect(result.current.sweep).toEqual({ key: 'FWS_N0B_2026_10_15_20_00_00' });
    act(() => result.current.clearSite());
    expect(result.current.scan).toBeNull();
    expect(result.current.sweep).toBeNull();
  });

  it('turns a station\'s radar off when its pill is clicked again, and switches on another station', async () => {
    vi.doMock('../../src/app/api/nexradLevel3', () => ({
      siteProduct: () => ({ code: 'N0B', label: 'Base Reflectivity' }),
      fetchDownStations: vi.fn(async () => new Set()),
      latestScanKey: vi.fn(async (site) => `${site.id.slice(1)}_N0B_2026_10_15_20_00_00`),
      fetchScan: vi.fn(async (key) => key),
    }));
    vi.doMock('../../src/app/utils/radarSiteRender', () => ({
      warmRadarScanWorker: vi.fn(),
      decodeSweepAsync: vi.fn(async (key) => ({ scan: { time: Date.now(), key }, sweep: { key } })),
    }));

    const { renderHook, act, waitFor } = await import('@testing-library/react');
    const { RadarSiteProvider, useRadarSiteContext } = await import('../../src/app/context/RadarSiteContext');
    const wrapper = ({ children }) => <RadarSiteProvider active>{children}</RadarSiteProvider>;
    const { result } = renderHook(() => useRadarSiteContext(), { wrapper });
    await waitFor(() => expect(result.current.sites?.length).toBeGreaterThan(100));

    act(() => result.current.toggleSite('KTLX'));
    await waitFor(() => expect(result.current.sweep).toEqual({ key: 'TLX_N0B_2026_10_15_20_00_00' }));
    act(() => result.current.toggleSite('KFWS'));
    expect(result.current.selectedId).toBe('KFWS');
    act(() => result.current.toggleSite('KFWS'));
    expect(result.current.selectedId).toBeNull();
    expect(result.current.sweep).toBeNull();
  });

  it('switches product, never showing the previous product\'s scan, and keeps TDWRs on reflectivity for CC/ZDR', async () => {
    vi.doMock('../../src/app/api/nexradLevel3', async (orig) => {
      const real = await orig();
      return {
        ...real,
        latestScanKey: vi.fn(async (site, { kind }) => `${site.id.slice(1)}_${real.siteProduct(site, kind).code}_2026_10_15_20_00_00`),
        fetchScan: vi.fn(async (key) => key),
        fetchDownStations: vi.fn(async () => new Set(['KTLX'])),
      };
    });
    vi.doMock('../../src/app/utils/radarSiteRender', () => ({
      warmRadarScanWorker: vi.fn(),
      decodeSweepAsync: vi.fn(async (key) => ({ scan: { time: Date.now(), key }, sweep: { key } })),
    }));

    const { renderHook, act, waitFor } = await import('@testing-library/react');
    const { RadarSiteProvider, useRadarSiteContext } = await import('../../src/app/context/RadarSiteContext');
    const wrapper = ({ children }) => <RadarSiteProvider active>{children}</RadarSiteProvider>;
    const seen = [];
    const { result } = renderHook(() => {
      const v = useRadarSiteContext();
      seen.push([v.kind, v.scan?.key ?? null]);
      return v;
    }, { wrapper });
    await waitFor(() => expect(result.current.sites?.length).toBeGreaterThan(100));

    act(() => result.current.selectSite('KTLX'));
    await waitFor(() => expect(result.current.scan?.key).toBe('TLX_N0B_2026_10_15_20_00_00'));
    await waitFor(() => expect(result.current.siteDown).toBe(true));
    expect(result.current.downIds.has('KTLX')).toBe(true);
    act(() => result.current.setKind('velocity'));
    await waitFor(() => expect(result.current.scan?.key).toBe('TLX_N0G_2026_10_15_20_00_00'));
    expect(result.current.product.label).toBe('Base Velocity');
    expect(seen.filter(([kind, key]) => kind === 'velocity' && key?.includes('_N0B_'))).toEqual([]);

    act(() => result.current.setKind('cc'));
    await waitFor(() => expect(result.current.scan?.key).toBe('TLX_N0C_2026_10_15_20_00_00'));
    const tdwr = result.current.sites.find((s) => s.type === 'tdwr');
    act(() => result.current.selectSite(tdwr.id));
    await waitFor(() => expect(result.current.scan?.key).toBe(`${tdwr.id.slice(1)}_TZ0_2026_10_15_20_00_00`));
    expect(result.current.kind).toBe('reflectivity');
    expect(result.current.chosenKind).toBe('cc');
  });
});

describe('downStations', () => {
  const NOW = Date.parse('2026-10-18T18:45:00Z');
  const station = (id, stationType, rda, lastL2) => ({
    properties: { id, stationType, rda: rda && { properties: rda }, latency: { levelTwoLastReceivedTime: lastL2 } },
  });
  const ok = { status: 'Operate', operabilityStatus: 'RDA - On-line' };

  it('flags inoperable radars, non-operating ones, and WSR-88Ds silent for 30 minutes', () => {
    const down = downStations({
      features: [
        station('KLCH', 'WSR-88D', ok, '2026-10-18T18:40:59+00:00'),
        station('KILN', 'WSR-88D', { status: 'Start-Up', operabilityStatus: 'RDA - Inoperable' }, '2026-10-16T00:00:00+00:00'),
        station('KLGX', 'WSR-88D', { status: 'Operate', operabilityStatus: 'RDA - Maintenance Action Mandatory' }, '2026-10-17T07:33:00+00:00'),
        station('KSHV', 'WSR-88D', ok, '2026-10-18T18:00:00+00:00'),
        station('TTPA', 'TDWR', { status: 'Operate', operabilityStatus: 'RDA - Inoperable' }, '2000-01-01T00:00:00+00:00'),
        station('TFLL', 'TDWR', ok, '2000-01-01T00:00:00+00:00'), // TDWRs don't send Level 2
        station('RODN', 'WSR-88D', null, null), // no status: not called down
      ],
    }, NOW);
    expect([...down].sort()).toEqual(['KILN', 'KLGX', 'KSHV', 'TTPA']);
  });

  it('tolerates an empty or missing feed', () => {
    expect(downStations(null).size).toBe(0);
    expect(downStations({ features: [] }).size).toBe(0);
  });
});
