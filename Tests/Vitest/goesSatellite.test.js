import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DEFAULT_SELECTION, PRODUCTS, REGIONS, SATELLITES, fetchGibsFrameTimes, fetchIemScanTime, gibsDomainsUrl,
  gibsTileUrl, iemScanTimeUrl, iemTileUrl, loopAvailable, loopFrames, normalizeSelection, parseGibsDomain,
  parseSatelliteQuery, productAvailability, regionsFor, resolveSource, writeSatelliteQuery,
} from '../../src/app/api/goesSatellite';
import { satellitePanelOpenAfter } from '../../src/app/context/SatelliteContext';

afterEach(() => vi.restoreAllMocks());

describe('satellites', () => {
  it('offers GOES-East and GOES-West on their operational platforms', () => {
    expect(SATELLITES.map((s) => [s.id, s.platform])).toEqual([['goes-east', 'GOES-19'], ['goes-west', 'GOES-18']]);
  });

  it('defaults to the imagery the old "GOES East Imagery" toggle showed', () => {
    expect(DEFAULT_SELECTION).toEqual({ satellite: 'goes-east', region: 'conus', product: 'visible' });
    const source = resolveSource(DEFAULT_SELECTION);
    expect(source).toMatchObject({ kind: 'iem', service: 'goes_east', layer: 'conus_ch02' });
    expect(iemTileUrl(source)).toContain('goes_east.cgi?SERVICE=WMS');
    expect(iemTileUrl(source)).toContain('LAYERS=conus_ch02');
  });
});

describe('regions', () => {
  const ids = (sat) => regionsFor(sat).map((r) => r.id);

  it('GOES-East exposes its own sectors and areas only', () => {
    expect(ids('goes-east')).toEqual(expect.arrayContaining(['conus', 'fulldisk', 'meso1', 'meso2', 'puerto-rico', 'southeast', 'gulf', 'caribbean', 'northeast']));
    expect(ids('goes-east')).not.toContain('alaska');
    expect(ids('goes-east')).not.toContain('hawaii');
  });

  it('GOES-West exposes Alaska, Hawaii and the Pacific, not the Gulf', () => {
    expect(ids('goes-west')).toEqual(expect.arrayContaining(['pacus', 'fulldisk', 'alaska', 'hawaii', 'pacific', 'western-us', 'meso1', 'meso2']));
    expect(ids('goes-west')).not.toContain('gulf');
    expect(ids('goes-west')).not.toContain('puerto-rico');
  });

  it('every region has a satellite and every fixed region has bounds', () => {
    for (const r of REGIONS) {
      expect(r.satellites.length).toBeGreaterThan(0);
      if (!r.sector.startsWith('meso') && r.id !== 'fulldisk') expect(r.bounds).toHaveLength(4);
    }
  });

  it('keeps a valid region when switching satellite', () => {
    expect(normalizeSelection({ satellite: 'goes-west', region: 'fulldisk', product: 'visible' }))
      .toEqual({ selection: { satellite: 'goes-west', region: 'fulldisk', product: 'visible' }, notice: null });
  });

  it("treats each satellite's CONUS sector as the same choice", () => {
    expect(normalizeSelection({ satellite: 'goes-west', region: 'conus', product: 'visible' }).selection.region).toBe('pacus');
    expect(normalizeSelection({ satellite: 'goes-east', region: 'pacus', product: 'visible' }).selection.region).toBe('conus');
  });

  it('explains (never silently) an invalid region for the satellite', () => {
    const { selection, notice } = normalizeSelection({ satellite: 'goes-east', region: 'alaska', product: 'visible' });
    expect(selection.region).toBe('conus');
    expect(notice).toMatch(/Alaska isn't available from GOES-East/);
  });

  it('explains an unknown region', () => {
    const { selection, notice } = normalizeSelection({ satellite: 'goes-east', region: 'atlantis' });
    expect(selection.region).toBe('conus');
    expect(notice).toMatch(/"atlantis"/);
  });
});

describe('products', () => {
  it.each([
    ['true-color', 'gibs', 'GOES-East_ABI_GeoColor'],
    ['visible', 'iem', 'conus_ch02'],
    ['upper-wv', 'iem', 'conus_ch08'],
    ['mid-wv', 'iem', 'conus_ch09'],
    ['lower-wv', 'iem', 'conus_ch10'],
    ['clean-ir', 'iem', 'conus_ch13'],
    ['fire-temperature', 'gibs', 'GOES-East_ABI_FireTemp'],
    ['shortwave-ir', 'iem', 'conus_ch07'],
  ])('%s on GOES-East CONUS comes from %s (%s)', (product, kind, layer) => {
    expect(productAvailability(product, 'goes-east', 'conus')).toEqual({ ok: true });
    expect(resolveSource({ satellite: 'goes-east', region: 'conus', product })).toMatchObject({ kind, layer });
  });

  it('uses GOES-West layers for GOES-West', () => {
    expect(resolveSource({ satellite: 'goes-west', region: 'pacus', product: 'clean-ir' })).toMatchObject({ service: 'goes_west', layer: 'conus_ch13' });
    expect(resolveSource({ satellite: 'goes-west', region: 'alaska', product: 'true-color' })).toMatchObject({ layer: 'GOES-West_ABI_GeoColor' });
  });

  it('exposes ABI bands 1-16 between them', () => {
    const bands = PRODUCTS.map((p) => p.band).filter(Boolean).sort((a, b) => a - b);
    expect(bands).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it('GIBS-only composites are not offered for mesoscale sectors', () => {
    const r = productAvailability('true-color', 'goes-east', 'meso1');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/mesoscale/i);
    expect(productAvailability('clean-ir', 'goes-east', 'meso1').ok).toBe(true);
  });

  it("respects the Puerto Rico sector's band list", () => {
    expect(productAvailability('ozone', 'goes-east', 'puerto-rico').ok).toBe(false);
    expect(productAvailability('clean-ir', 'goes-east', 'puerto-rico').ok).toBe(true);
  });

  it('explains an unavailable product instead of silently switching it', () => {
    const { selection, notice } = normalizeSelection({ satellite: 'goes-east', region: 'meso2', product: 'fire-temperature' });
    expect(selection.product).toBe('visible');
    expect(notice).toMatch(/Fire Temperature isn't available for Mesoscale 2/);
  });

  it('a loop frame always comes from GIBS', () => {
    const src = resolveSource({ satellite: 'goes-east', region: 'conus', product: 'clean-ir' }, { frameTime: '2026-10-05T14:00:00Z' });
    expect(src).toMatchObject({ kind: 'gibs', layer: 'GOES-East_ABI_Band13_Clean_Infrared', level: 6, time: '2026-10-05T14:00:00Z', legend: 'infraredColor' });
    expect(gibsTileUrl(src.layer, src.level, src.time))
      .toBe('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_Band13_Clean_Infrared/default/2026-10-05T14:00:00Z/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png');
  });

  it('loops exist only for GIBS products outside mesoscale sectors', () => {
    expect(loopAvailable('true-color', 'conus')).toBe(true);
    expect(loopAvailable('visible', 'gulf')).toBe(true);
    expect(loopAvailable('visible', 'meso1')).toBe(false);
    expect(loopAvailable('upper-wv', 'conus')).toBe(false);
  });
});

describe('timestamps', () => {
  it('builds the IEM latest-scan URL for the satellite platform', () => {
    expect(iemScanTimeUrl('goes-east', 'conus', 'visible'))
      .toBe('https://mesonet.agron.iastate.edu/data/gis/images/GOES/conus/channel02/GOES-19_C02.json');
    expect(iemScanTimeUrl('goes-west', 'meso2', 'clean-ir'))
      .toBe('https://mesonet.agron.iastate.edu/data/gis/images/GOES/mesoscale-2/channel13/GOES-18_C13.json');
    expect(iemScanTimeUrl('goes-east', 'conus', 'true-color')).toBeNull();
  });

  it('reads the scan time, and null when IEM publishes none', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ meta: { valid: '2026-10-05T14:56:17Z' } })))
      .mockResolvedValueOnce(new Response('not found', { status: 404 }));
    await expect(fetchIemScanTime('https://x/a.json')).resolves.toBe('2026-10-05T14:56:17.000Z');
    await expect(fetchIemScanTime('https://x/b.json')).resolves.toBeNull();
  });

  it('reports an unreachable source', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchIemScanTime('https://x/a.json')).rejects.toThrow('Satellite imagery is unreachable');
  });

  it('parses GIBS time domains, skipping missing scans', () => {
    const xml = '<Domains><DimensionDomain><Domain>2026-10-05T13:00:00Z/2026-10-05T13:20:00Z/PT10M,2026-10-05T13:50:00Z,2026-10-05T14:10:00Z/2026-10-05T14:20:00Z/PT10M</Domain></DimensionDomain></Domains>';
    expect(parseGibsDomain(xml)).toEqual([
      '2026-10-05T13:00:00Z', '2026-10-05T13:10:00Z', '2026-10-05T13:20:00Z',
      '2026-10-05T13:50:00Z', '2026-10-05T14:10:00Z', '2026-10-05T14:20:00Z',
    ]);
    expect(parseGibsDomain('<oops/>')).toEqual([]);
  });

  it('asks GIBS DescribeDomains for a small recent window, not the capabilities', async () => {
    const now = Date.parse('2026-10-05T15:00:00Z');
    expect(gibsDomainsUrl('GOES-East_ABI_GeoColor', 7, now))
      .toBe('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/GOES-East_ABI_GeoColor/default/GoogleMapsCompatible_Level7/all/2026-10-05T11:00:00Z--2026-10-05T16:00:00Z.xml');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<Domain>2026-10-05T14:00:00Z/2026-10-05T14:10:00Z/PT10M</Domain>'));
    await expect(fetchGibsFrameTimes('L', 7, { now })).resolves.toEqual(['2026-10-05T14:00:00Z', '2026-10-05T14:10:00Z']);
  });

  it('cuts the loop to the chosen number of hours', () => {
    const times = Array.from({ length: 30 }, (_, i) => new Date(Date.parse('2026-10-05T10:00:00Z') + i * 600e3).toISOString());
    expect(loopFrames(times, 1)).toHaveLength(6);
    expect(loopFrames(times, 3)).toHaveLength(18);
    expect(loopFrames(times, 1).at(-1).id).toBe(times.at(-1));
    expect(loopFrames([], 1)).toEqual([]);
  });
});

describe('URL state', () => {
  it('round-trips a selection', () => {
    const url = writeSatelliteQuery(new URL('https://x.test/?tab=weather'), { satellite: 'goes-west', region: 'alaska', product: 'clean-ir' });
    expect(url.search).toBe('?tab=weather&sat=goes-west&sat_region=alaska&sat_product=clean-ir');
    expect(parseSatelliteQuery(url.search)).toEqual({ satellite: 'goes-west', region: 'alaska', product: 'clean-ir' });
    expect(writeSatelliteQuery(url, null).search).toBe('?tab=weather');
  });

  it('is not a satellite link without ?sat', () => {
    expect(parseSatelliteQuery('?tab=models')).toBeNull();
  });
});

describe('satellite panel open/close', () => {
  const off = { satellite: false, mrms: false, spcWeatherOutlooks: false };

  it('opens when Satellite is switched on', () => {
    expect(satellitePanelOpenAfter(off, { ...off, satellite: true }, false)).toBe(true);
  });

  it('closes when another layer with its own controls is switched on', () => {
    const on = { ...off, satellite: true };
    expect(satellitePanelOpenAfter(on, { ...on, spcWeatherOutlooks: true }, true)).toBe(false);
    expect(satellitePanelOpenAfter(on, { ...on, mrms: true }, true)).toBe(false);
  });

  it('stays as it is for unrelated layer changes', () => {
    const on = { ...off, satellite: true, stormReports: false };
    expect(satellitePanelOpenAfter(on, { ...on, stormReports: true }, true)).toBe(true);
  });

  it('closes when Satellite is switched off', () => {
    expect(satellitePanelOpenAfter({ ...off, satellite: true }, off, true)).toBe(false);
  });
});
