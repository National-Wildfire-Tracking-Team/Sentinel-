/**
 * awc.test.jsx
 * Aviation Weather Center layer: parsing (METAR cache CSV, TAF, PIREPs,
 * advisories), flight rules and wind barbs, the edge proxy's per-route param
 * allowlist, click records, and the drawer / layer panel switches.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  AWC_GROUPS, AWC_HAZARD_TOGGLES, AWC_SUBLAYER_KEYS, awcDate, barbBucket, barbParts, ceilingFt, enabledHazards,
  fetchAwc, flightCategory, formatRawTaf, hazardKey, metarCsvToCollection, parseCsv, parseCsvLine, parseVisibility,
  pirepSeverity, snappedBbox, splitGairmets, splitSigmets, tafPeriods, windText,
} from '../../src/app/api/awc/awc';
import { nearestOffice, NWS_OFFICES } from '../../src/app/api/awc/textProducts';
import { buildAwcRecord, awcInteractiveLayerIds } from '../../src/app/components/Map/layers/awcRecords';
import { drawBarb, parseBarbImageId, barbImageId } from '../../src/app/components/Map/layers/awcWindBarbs';
import { ROUTES as AWC_ROUTES } from '../../netlify/edge-functions/awc-proxy.js';
import { buildUpstreamUrl, cacheHeaders } from '../../netlify/edge-functions/_shared/edgeProxy.js';
import { useApp } from '../../src/app/context/AppContext';
import { useAwcContext } from '../../src/app/context/AwcContext';
import AwcControls from '../../src/app/components/LayerControl/AwcControls';
import LayerControl from '../../src/app/components/LayerControl/LayerControl';

vi.mock('../../src/app/context/AppContext', () => ({ useApp: vi.fn() }));
vi.mock('../../src/app/context/AwcContext', () => ({ useAwcContext: vi.fn(() => null) }));
vi.mock('../../src/app/context/ViewportContext', () => ({ useViewport: vi.fn(() => ({ viewport: {}, setViewport: vi.fn() })) }));

// Real rows from AWC's metars.cache.csv (trimmed to three stations, KSFO twice).
const HEADER = 'raw_text,station_id,observation_time,latitude,longitude,temp_c,dewpoint_c,wind_dir_degrees,wind_speed_kt,wind_gust_kt,visibility_statute_mi,altim_in_hg,sea_level_pressure_mb,corrected,auto,auto_station,maintenance_indicator_on,no_signal,lightning_sensor_off,freezing_rain_sensor_off,present_weather_sensor_off,wx_string,sky_cover,cloud_base_ft_agl,sky_cover,cloud_base_ft_agl,sky_cover,cloud_base_ft_agl,sky_cover,cloud_base_ft_agl,flight_category,three_hr_pressure_tendency_mb,maxT_c,minT_c,maxT24hr_c,minT24hr_c,precip_in,pcp3hr_in,pcp6hr_in,pcp24hr_in,snow_in,vert_vis_ft,metar_type,elevation_m';
const CSV = [
  'No errors', 'No warnings', '5 ms', 'data source=metars', '3 results',
  HEADER,
  '"METAR KSFO 201856Z 28012G22KT 10SM BKN012 OVC030 17/11 A2992",KSFO,2026-10-20T18:56:00.000Z,37.6196,-122.3656,17,11,280,12,22,10+,29.92,,,,,,,,,,,BKN,1200,OVC,3000,,,,,MVFR,,,,,,,,,,,,METAR,2',
  '"METAR KSFO 201756Z 09005KT 10SM BKN120 17/11 A2992",KSFO,2026-10-20T17:56:00.000Z,37.6196,-122.3656,16.7,10.6,90,5,,10+,29.92,1013.1,,,TRUE,,,,,,,BKN,12000,,,,,,,VFR,,,,,,,,,,,,METAR,2',
  '"SPECI PASL 201839Z AUTO VRB04KT 10SM BKN016 OVC070 M03/M04 A2936 RMK AO2",PASL,2026-10-20T18:39:00.000Z,61.6970,-157.1670,-3,-4,0,4,,10+,29.36,,,TRUE,TRUE,TRUE,,,TRUE,TRUE,,BKN,1600,OVC,7000,,,,,MVFR,,,,,,,,,,,,SPECI,64',
  '"METAR KDSF 201840Z AUTO 00000KT 10SM 26/16 A3014",KDSF,2026-10-20T18:40:00.000Z,28.3426,-88.2649,26,16,0,0,,10+,30.14,,,TRUE,TRUE,,,,,,,,,,,,,,,VFR,,,,,,,,,,,,METAR,40',
].join('\n');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CSV parsing', () => {
  it('splits quoted fields, doubled quotes and empty trailing fields', () => {
    expect(parseCsvLine('"a, b",c,,"say ""hi"""')).toEqual(['a, b', 'c', '', 'say "hi"']);
    expect(parseCsvLine('a,b,')).toEqual(['a', 'b', '']);
    expect(parseCsv('x,y\r\n1,2\n')).toEqual([['x', 'y'], ['1', '2']]);
  });
});

describe('METAR cache file → airport dots', () => {
  const { geojson, byId } = metarCsvToCollection(CSV);
  const props = (id) => geojson.features.find((f) => f.properties.id === id).properties;

  it('keeps one dot per station, the newest report', () => {
    expect(geojson.features).toHaveLength(3);
    expect(props('KSFO').fltcat).toBe('MVFR');
    expect(byId.get('KSFO').rawOb).toContain('201856Z');
  });

  it('reads repeated sky_cover / cloud_base columns by position', () => {
    expect(byId.get('KSFO').clouds).toEqual([{ cover: 'BKN', base: 1200 }, { cover: 'OVC', base: 3000 }]);
  });

  it('draws a barb for a steady wind, none for calm or variable', () => {
    expect(props('KSFO')).toMatchObject({ wdir: 280, barb: 10, wgst: 22 });
    // The file writes VRB04KT as direction 0: the raw report is what says variable.
    expect(byId.get('PASL').vrb).toBe(true);
    expect(props('PASL').barb).toBe(0);
    expect(props('KDSF').barb).toBe(0);
  });

  it('returns nothing (not a throw) without the header', () => {
    expect(metarCsvToCollection('garbage').geojson.features).toEqual([]);
  });
});

describe('flight rules', () => {
  it('uses the FAA ceiling / visibility thresholds', () => {
    expect(flightCategory(5000, 10)).toBe('VFR');
    expect(flightCategory(3000, 10)).toBe('MVFR');
    expect(flightCategory(5000, 4)).toBe('MVFR');
    expect(flightCategory(900, 10)).toBe('IFR');
    expect(flightCategory(null, 2)).toBe('IFR');
    expect(flightCategory(400, 10)).toBe('LIFR');
    expect(flightCategory(5000, 0.5)).toBe('LIFR');
    expect(flightCategory(null, null)).toBeNull();
  });

  it('takes the lowest broken/overcast layer or vertical visibility as the ceiling', () => {
    expect(ceilingFt([{ cover: 'SCT', base: 800 }, { cover: 'BKN', base: 2500 }, { cover: 'OVC', base: 1800 }])).toBe(1800);
    expect(ceilingFt([{ cover: 'FEW', base: 500 }])).toBeNull();
    expect(ceilingFt([], 300)).toBe(300);
  });

  it('reads AWC visibility strings', () => {
    expect(parseVisibility('6+')).toBe(6);
    expect(parseVisibility('10+')).toBe(10);
    expect(parseVisibility('1 1/2')).toBe(1.5);
    expect(parseVisibility('M1/4')).toBe(0.25);
    expect(parseVisibility(2.5)).toBe(2.5);
    expect(parseVisibility('')).toBeNull();
  });
});

describe('wind barbs', () => {
  it('rounds to the nearest 5 kt', () => {
    expect(barbBucket(0)).toBe(0);
    expect(barbBucket(2)).toBe(0);
    expect(barbBucket(3)).toBe(5);
    expect(barbBucket(12)).toBe(10);
    expect(barbBucket(13)).toBe(15);
  });

  it('splits a speed into 50-kt flags, 10-kt long lines and a 5-kt short line', () => {
    expect(barbParts(5)).toEqual({ pennants: 0, full: 0, half: true });
    expect(barbParts(25)).toEqual({ pennants: 0, full: 2, half: true });
    expect(barbParts(65)).toEqual({ pennants: 1, full: 1, half: true });
    expect(barbParts(100)).toEqual({ pennants: 2, full: 0, half: false });
  });

  it('draws the lines and flags it says, on the clockwise (right) side of an upward staff', () => {
    const lines = [];
    let pos = null;
    const ctx = {
      beginPath: vi.fn(), stroke: vi.fn(), fill: vi.fn(), closePath: vi.fn(),
      moveTo: (x, y) => { pos = [x, y]; },
      lineTo: (x, y) => { lines.push([pos, [x, y]]); pos = [x, y]; },
    };
    drawBarb(ctx, 65, { stroke: '#fff', outline: '#000' });
    // Two passes (outline, then stroke) over staff + 1 long + 1 short line and a 3-sided flag.
    const strokes = lines.length / 2;
    expect(strokes).toBe(1 + 1 + 1 + 3);
    const [, staffEnd] = lines[0];
    const feathers = lines.slice(1, 3);
    for (const [from, to] of feathers) {
      expect(to[0]).toBeGreaterThan(from[0]); // to the right
      expect(to[1]).toBeLessThan(from[1]); // leaning toward the tip
    }
    expect(staffEnd[1]).toBeLessThan(lines[0][0][1]); // staff goes up from the station
  });

  it('round-trips its image ids', () => {
    expect(parseBarbImageId(barbImageId('light', 35))).toEqual({ theme: 'light', bucket: 35 });
    expect(parseBarbImageId(barbImageId('anything', 5))).toEqual({ theme: 'dark', bucket: 5 });
    expect(parseBarbImageId('other-icon')).toBeNull();
  });

  it('describes wind in words', () => {
    expect(windText(280, 12, 22)).toBe('280° at 12 kt, gusts 22 kt');
    expect(windText('VRB', 3)).toBe('Variable at 3 kt');
    expect(windText(0, 0)).toBe('Calm');
  });
});

describe('TAF', () => {
  const taf = {
    rawTAF: 'TAF KSFO 201804Z 2018/2124 11005KT P6SM FEW030 BKN120 FM202300 30012KT P6SM OVC008 TEMPO 2101/2104 2SM BR PROB30 2106/2109 1/2SM FG VV002',
    fcsts: [
      { timeFrom: 1792519200, timeTo: 1792537200, fcstChange: null, wdir: 110, wspd: 5, visib: '6+', clouds: [{ cover: 'FEW', base: 3000 }, { cover: 'BKN', base: 12000 }] },
      { timeFrom: 1792537200, timeTo: 1792562400, fcstChange: 'FM', wdir: 300, wspd: 12, visib: '6+', clouds: [{ cover: 'OVC', base: 800 }] },
      { timeFrom: 1792544400, timeTo: 1792555200, fcstChange: 'TEMPO', visib: 2, wxString: 'BR', clouds: [] },
      { timeFrom: 1792555200, timeTo: 1792566000, fcstChange: 'PROB', probability: 30, visib: 0.5, wxString: 'FG', vertVis: 200, clouds: [] },
    ],
  };

  it('decodes each period with its flight rules', () => {
    const p = tafPeriods(taf);
    expect(p.map((x) => x.category)).toEqual(['VFR', 'IFR', 'IFR', 'LIFR']);
    expect(p.map((x) => x.changeLabel)).toEqual(['Initially', 'From', 'Temporarily', '30% chance']);
    expect(p[0].from).toEqual(new Date(1792519200 * 1000));
    expect(p[1].wind).toBe('300° at 12 kt');
  });

  it('puts each change group on its own line', () => {
    expect(formatRawTaf(taf.rawTAF).split('\n').map((l) => l.trim().split(' ')[0])).toEqual(['TAF', 'FM202300', 'TEMPO', 'PROB30']);
  });

  it('reads AWC times in every format it sends', () => {
    expect(awcDate(1792519200)?.toISOString()).toBe('2026-10-20T18:00:00.000Z');
    expect(awcDate('2026-10-20T18:00:00.000Z')?.getTime()).toBe(1792519200000);
    expect(awcDate('20261020_1800')?.getTime()).toBe(1792519200000);
    expect(awcDate('')).toBeNull();
  });
});

describe('pilot reports and advisories', () => {
  it('ranks the worst turbulence or icing in a PIREP', () => {
    expect(pirepSeverity({ tbInt1: 'LGT' })).toEqual({ sev: 1, kind: 'TB' });
    expect(pirepSeverity({ tbInt1: 'LGT', icgInt1: 'MOD-SEV' })).toEqual({ sev: 3, kind: 'IC' });
    expect(pirepSeverity({})).toEqual({ sev: 0, kind: '' });
  });

  it('normalises hazard names across products', () => {
    expect(hazardKey('TS')).toBe('CONV');
    expect(hazardKey('CONVECTIVE')).toBe('CONV');
    expect(hazardKey('TURB-HI')).toBe('TURB_HI');
    expect(hazardKey('MT-OBSC')).toBe('MT_OBSC');
    expect(hazardKey('MTN_OBS')).toBe('MT_OBSC');
    expect(hazardKey('SFC-WIND')).toBe('SFC_WND');
    expect(hazardKey('pcpn')).toBe('PCPN');
    expect(hazardKey('SOMETHING NEW')).toBe('UNK');
  });

  it('gives every hazard key exactly one switch', () => {
    const all = AWC_HAZARD_TOGGLES.flatMap((t) => t.hz);
    expect(new Set(all).size).toBe(all.length);
    for (const h of ['CONV', 'TURB', 'TURB_HI', 'TURB_LO', 'ICE', 'IFR', 'MT_OBSC', 'LLWS', 'SFC_WND', 'FZLVL', 'M_FZLVL', 'VA', 'TC', 'MTW', 'PCPN', 'DS', 'SS', 'UNK']) {
      expect(all, h).toContain(h);
    }
  });

  it('only lets through hazards whose switch is on', () => {
    const layers = Object.fromEntries(AWC_HAZARD_TOGGLES.map((t) => [t.key, false]));
    expect(enabledHazards({ ...layers, awcHzConvective: true, awcHzFreezing: true }).sort()).toEqual(['CONV', 'FZLVL', 'M_FZLVL']);
  });

  it('splits /sigmet into U.S.-issued and international', () => {
    const f = (icaoId, hazard) => ({ type: 'Feature', geometry: null, properties: { icaoId, hazard } });
    const { us, intl } = splitSigmets({ features: [f('KKCI', 'CONVECTIVE'), f('PHFO', 'TC'), f('SBGL', 'TS'), f('PAWU', 'VA')] });
    expect(us.features.map((x) => x.properties.icaoId)).toEqual(['KKCI', 'PHFO', 'PAWU']);
    expect(intl.features[0].properties).toMatchObject({ icaoId: 'SBGL', hz: 'CONV', fid: 0 });
  });

  it('splits /gairmet by product', () => {
    const f = (product, hazard) => ({ type: 'Feature', geometry: null, properties: { product, hazard } });
    const out = splitGairmets({ features: [f('SIERRA', 'IFR'), f('ZULU', 'FZLVL'), f('ZULU', 'ICE'), f('TANGO', 'TURB-HI')] });
    expect(out.ZULU.features.map((x) => x.properties.hz)).toEqual(['FZLVL', 'ICE']);
    expect(out.TANGO.features[0].properties.hz).toBe('TURB_HI');
    expect(out.SIERRA.features).toHaveLength(1);
  });
});

describe('fetching', () => {
  it('treats an empty 200 (AWC 204, no data) as empty, not an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));
    await expect(fetchAwc('mis', {}, { as: 'text', empty: '' })).resolves.toBe('');
  });

  it('throws on an HTTP error and keeps commas literal', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 502 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchAwc('metar', { ids: 'KSFO,KOAK', format: 'json', skip: null })).rejects.toThrow('HTTP 502');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/awc/metar?ids=KSFO,KOAK&format=json');
  });

  it('snaps a map view outward to a shared grid, as lat0,lon0,lat1,lon1', () => {
    expect(snappedBbox([-122.43, 37.61, -121.88, 38.02], 0.5)).toBe('37.5,-122.5,38.5,-121.5');
    expect(snappedBbox([-200, -95, 200, 95], 1)).toBe('-90,-180,90,180');
  });

  it('picks the NWS office nearest a point', () => {
    expect(nearestOffice(37.62, -122.37).id).toBe('KMTR');
    expect(nearestOffice(39.1, -94.6).id).toBe('KEAX');
    expect(nearestOffice(null, null)).toBeNull();
    expect(new Set(NWS_OFFICES.map((o) => o.id)).size).toBe(NWS_OFFICES.length);
  });
});

describe('awc-proxy routes', () => {
  const ORIGIN = 'https://aviationweather.gov';
  const search = (qs) => new URLSearchParams(qs);

  it('forwards only the params each endpoint documents (AWC errors on any other)', () => {
    const url = buildUpstreamUrl(AWC_ROUTES.metar, ORIGIN, '', search('ids=KSFO&format=json&where=1&utm_source=x&f=geojson'));
    expect(url).toBe(`${ORIGIN}/api/data/metar?ids=KSFO&format=json`);
  });

  it('sends nothing but the path for the METAR cache file', () => {
    expect(buildUpstreamUrl(AWC_ROUTES['metar-cache'], ORIGIN, '', search('bbox=1,2,3,4'))).toBe(`${ORIGIN}/data/cache/metars.cache.csv.gz`);
  });

  it('keys the CDN cache on AWC params too', () => {
    const vary = cacheHeaders('active', 'metar')['Netlify-Vary'];
    for (const p of ['ids', 'format', 'hazard', 'cwa', 'region']) expect(vary).toContain(`|${p}`);
  });

  it('routes every non-deprecated endpoint in the spec', () => {
    const paths = Object.values(AWC_ROUTES).map((r) => r.path);
    for (const ep of ['metar', 'taf', 'pirep', 'sigmet', 'gairmet', 'airmet', 'tcf', 'cwa', 'windtemp', 'areafcst', 'fcstdisc', 'mis', 'stationinfo', 'airport', 'navaid', 'fix', 'feature', 'obstacle']) {
      expect(paths).toContain(`/api/data/${ep}`);
    }
  });
});

describe('click records', () => {
  it('turns a clicked airport dot into a METAR/TAF record', () => {
    const rec = buildAwcRecord(
      { layer: { id: 'awc-src-awcMetarTaf-dot' }, properties: { id: 'KSFO', fltcat: 'VFR' }, geometry: { type: 'Point', coordinates: [-122.37, 37.62] } },
      { lng: 0, lat: 0 },
    );
    expect(rec).toMatchObject({ type: 'awc', key: 'awcMetarTaf', stationId: 'KSFO', name: 'KSFO', lat: 37.62, lng: -122.37 });
  });

  it('names a clicked advisory by its hazard', () => {
    const rec = buildAwcRecord(
      { layer: { id: 'awc-src-awcSigmetUs-fill' }, properties: { fid: 2, seriesId: '20C', hz: 'CONV' }, geometry: { type: 'Polygon' } },
      { lng: -97, lat: 38 },
    );
    expect(rec).toMatchObject({ key: 'awcSigmetUs', fid: 2, name: 'SIGMET 20C · Thunderstorms / convection', lat: 38 });
  });

  it('ignores other layers', () => {
    expect(buildAwcRecord({ layer: { id: 'weather-alerts-fill' }, properties: {} }, { lng: 0, lat: 0 })).toBeNull();
  });

  it('lists clickable layers only for what is showing', () => {
    expect(awcInteractiveLayerIds(null)).toEqual([]);
    expect(awcInteractiveLayerIds({ active: true, visible: { awcMetarTaf: true, awcCwa: true } }))
      .toEqual(['awc-src-awcCwa-fill', 'awc-src-awcCwa-contour', 'awc-src-awcMetarTaf-dot']);
  });
});

// ─── UI ──────────────────────────────────────────────────────────────────────

const allLayers = (overrides = {}) => ({
  awc: true,
  ...Object.fromEntries(AWC_SUBLAYER_KEYS.map((k) => [k, false])),
  ...overrides,
});

const awcCtx = (overrides = {}) => ({
  active: true,
  on: {},
  visible: {},
  sources: {},
  status: {},
  hazardFilter: [],
  hazardCounts: Object.fromEntries(AWC_HAZARD_TOGGLES.map((t) => [t.key, 0])),
  text: {},
  settings: { windtemp: { region: 'us', level: 'low', fcst: '06' }, fcstdisc: { office: 'auto', type: 'afd' }, areafcst: { region: 'aksouth' } },
  setSetting: vi.fn(),
  autoOffice: null,
  ...overrides,
});

describe('Aviation Weather Center drawer', () => {
  it('has a switch for every product and every hazard', () => {
    useApp.mockReturnValue({ layers: allLayers(), toggleLayer: vi.fn(), setLayer: vi.fn() });
    useAwcContext.mockReturnValue(awcCtx());
    render(<AwcControls />);
    const labels = AWC_GROUPS.flatMap((g) => g.layers.map((l) => l.label));
    expect(screen.getAllByRole('switch')).toHaveLength(labels.length);
    for (const label of ['Airport weather', 'Thunderstorms & convection', 'Turbulence', 'Icing', 'SIGMETs · U.S.', 'G-AIRMET Zulu', 'Winds & temps aloft', 'Obstacles']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('toggles a product from its switch', () => {
    const toggleLayer = vi.fn();
    useApp.mockReturnValue({ layers: allLayers(), toggleLayer, setLayer: vi.fn() });
    useAwcContext.mockReturnValue(awcCtx());
    render(<AwcControls />);
    fireEvent.click(screen.getByRole('switch', { name: /Pilot reports/ }));
    expect(toggleLayer).toHaveBeenCalledWith('awcPirep');
  });

  it('shows how many shapes each hazard has on the map, and hides them all at once', () => {
    const setLayer = vi.fn();
    const on = Object.fromEntries(AWC_HAZARD_TOGGLES.map((t) => [t.key, true]));
    useApp.mockReturnValue({ layers: allLayers(on), toggleLayer: vi.fn(), setLayer });
    useAwcContext.mockReturnValue(awcCtx({ hazardCounts: { ...awcCtx().hazardCounts, awcHzConvective: 3 } }));
    render(<AwcControls />);
    expect(screen.getByText(/Convective SIGMETs, TS, CWAs, TCF · 3 on map/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide all' }));
    expect(setLayer).toHaveBeenCalledTimes(AWC_HAZARD_TOGGLES.length);
    expect(setLayer).toHaveBeenCalledWith('awcHzConvective', false);
  });

  it('reports a capped navigation query and a zoom gate honestly', () => {
    useApp.mockReturnValue({ layers: allLayers({ awcAirports: true, awcObstacles: true }), toggleLayer: vi.fn(), setLayer: vi.fn() });
    useAwcContext.mockReturnValue(awcCtx({
      sources: { awcAirports: { features: new Array(400).fill({ properties: {} }) } },
      status: {
        awcAirports: { count: 400, truncated: true },
        awcObstacles: { needsZoom: true },
      },
    }));
    render(<AwcControls />);
    expect(screen.getByText(/Showing the first 400 airports · zoom in for the rest/)).toBeInTheDocument();
    expect(screen.getByText(/Zoom in to see obstacles \(zoom 10\+\)/)).toBeInTheDocument();
  });

  it('reads a text product under its switch', () => {
    useApp.mockReturnValue({ layers: allLayers({ awcMis: true }), toggleLayer: vi.fn(), setLayer: vi.fn() });
    useAwcContext.mockReturnValue(awcCtx({ text: { awcMis: 'ZKC MIS 01 VALID 201800-210000\nIFR CONDS' }, status: { awcMis: {} } }));
    render(<AwcControls />);
    expect(screen.getByText(/ZKC MIS 01/)).toBeInTheDocument();
  });

  it('renders nothing while the layer row is off', () => {
    useApp.mockReturnValue({ layers: allLayers({ awc: false }), toggleLayer: vi.fn(), setLayer: vi.fn() });
    useAwcContext.mockReturnValue(awcCtx());
    const { container } = render(<AwcControls />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('layer panel row', () => {
  const renderPanel = (tab) => {
    useApp.mockReturnValue({
      layers: {}, layerPanelOpen: true, toggleLayerPanel: vi.fn(), toggleLayer: vi.fn(), setLayer: vi.fn(),
    });
    return render(<MemoryRouter><LayerControl activeMapTab={tab} /></MemoryRouter>);
  };

  it.each(['weather', 'allhazard'])('shows Aviation Weather Center on the %s tab', (tab) => {
    renderPanel(tab);
    expect(screen.getByText('Aviation Weather Center')).toBeInTheDocument();
  });

  it('leaves it off the Wildfire tab', () => {
    renderPanel('wildfire');
    expect(screen.queryByText('Aviation Weather Center')).not.toBeInTheDocument();
  });
});
