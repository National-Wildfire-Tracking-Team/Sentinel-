/**
 * fireDangerStations.test.jsx
 * FEMS station data on the client: staleness, nearest-station lookup, the
 * regional summary, status text, the station layer and the trend chart.
 *
 * fixtures/femsStations.json is output of a real cloud/fire-danger run
 * against FEMS on 2026-10-20 (manifest, four stations, one station's detail):
 * two current stations, one with no observed day, one last observed Oct 13.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RAMP, STATION_FIELDS, STATION_LAYER_FIELDS, markStaleStations, nearestStation, rampStops, summarizeStations, viewportBounds,
} from '../../src/app/api/fireDanger/stations';
import { stationStatus } from '../../src/app/api/fireDanger/status';

const FIX = JSON.parse(readFileSync(resolve(process.cwd(), 'Tests/Vitest/fixtures/femsStations.json'), 'utf8'));
const LATEST = FIX.manifest.sources.fems.latestObservedDate;
const DATA = markStaleStations(FIX.stations, LATEST);
const byName = (n) => DATA.features.find((f) => f.properties.name === n).properties;

const layerProps = [];
let ctx = null;
vi.mock('react-map-gl', () => ({
  Source: ({ children }) => children,
  Layer: (props) => { layerProps.push(props); return null; },
  useMap: () => ({ current: null }),
}));
vi.mock('../../src/app/context/FireDangerContext', () => ({ useFireDangerContext: () => ctx }));

const { default: FireDangerStationsLayer, STATIONS_CIRCLE_ID } = await import('../../src/app/components/Map/layers/FireDangerStationsLayer');
const { default: StationTrendChart, trendPoints } = await import('../../src/app/components/FireDetailPanel/StationTrendChart');

beforeEach(() => { layerProps.length = 0; });

describe('station data', () => {
  it('marks stations without a recent observed day as stale', () => {
    expect(LATEST).toBe('2026-10-19');
    expect(byName('ARMELLS CREEK').stale).toBe(false);
    expect(byName('3 MILE').stale).toBe(true); // no observed day
    expect(byName('CAMDEN TOWER').stale).toBe(true); // last observed Oct 13
  });

  it('keeps FEMS values as published', () => {
    // Matches a direct FEMS daily-summary query for ARMELLS CREEK, 2026-10-19 (O, fuel model Y)
    expect(byName('ARMELLS CREEK')).toMatchObject({ erc: 31.66, bi: 21.17, fm100: 13.84 });
    expect(byName('ARMELLS CREEK').forecastErc[0]).toBe(31.6);
  });

  it('finds the nearest current station, skipping stale ones and anything too far', () => {
    const near = nearestStation(DATA, 34.70, -85.16);
    expect(near.feature.properties.name).toBe('ARMUCHEE');
    expect(near.km).toBeLessThan(1);
    expect(nearestStation(DATA, 36.07, -88.17)).toBeNull(); // CAMDEN TOWER is stale
    expect(nearestStation(DATA, 40, -100)).toBeNull();
  });

  it('orients ramps so the dry / high end is darkest', () => {
    const erc = rampStops('erc');
    expect(erc[0]).toBe(0);
    expect(erc[1]).toBe(RAMP[0]);
    expect(erc.at(-1)).toBe(RAMP.at(-1));
    const fm = rampStops('fm100');
    expect(fm[1]).toBe(RAMP.at(-1)); // lowest moisture = darkest
    expect(STATION_FIELDS.herbFM.source).toBe('modelled');
  });

  it('maps every panel row to a field', () => {
    expect(STATION_LAYER_FIELDS).toEqual({ fdErc: 'erc', fdBi: 'bi', fdSc: 'sc', fdDeadFm: 'dead', fdLiveFm: 'live' });
  });

  it('summarizes the view from current stations only', () => {
    const s = summarizeStations(DATA, [-125, 24, -66, 50]);
    expect(s).toMatchObject({ stations: 4, current: 2, stale: 2 });
    expect(s.erc.max).toBe(31.66);
    expect(s.fm100.min).toBe(Math.min(byName('ARMELLS CREEK').fm100, byName('ARMUCHEE').fm100));
    expect(summarizeStations(DATA, [-90, 30, -80, 40]).stations).toBe(2);
  });

  it('approximates the view bounds from the camera', () => {
    const [w, s, e, n] = viewportBounds({ longitude: -100, latitude: 40, zoom: 4 }, 1024, 768);
    expect(e - w).toBeCloseTo(45, 0); // 1024 px at zoom 4: 360 * 1024 / 8192
    expect(s).toBeLessThan(40);
    expect(n).toBeGreaterThan(40);
  });
});

describe('station status text', () => {
  const base = { configured: true, data: DATA, error: null, field: 'erc', fems: FIX.manifest.sources.fems };
  it('reports the observed day and how many stations reported', () => {
    const s = stationStatus(base);
    expect(s.tone).toBe('info');
    expect(s.text).toMatch(/Energy Release Component · observed/);
    expect(s.text).toMatch(/1978 of 2077 stations reporting/);
  });
  it('says when the backend is not set up, stopped updating, or failed', () => {
    expect(stationStatus({ ...base, configured: false }).text).toMatch(/isn't connected/);
    expect(stationStatus({ ...base, fems: { ...base.fems, stale: true } })).toMatchObject({ tone: 'error', retry: true });
    expect(stationStatus({ ...base, fems: { ...base.fems, status: 'error', lastSuccessAt: '2026-10-20T13:01:33Z' } }).text).toMatch(/couldn't be reached/);
    expect(stationStatus({ ...base, data: null, error: new Error('HTTP 503') }).text).toMatch(/unavailable: HTTP 503/);
  });
});

describe('FireDangerStationsLayer', () => {
  it('colours current stations by the chosen field and draws the rest as hollow rings', () => {
    ctx = { stationsOn: true, stations: { data: DATA, field: 'fm100' }, opacity: { stations: 0.9 } };
    render(<FireDangerStationsLayer />);
    const circle = layerProps.find((l) => l.id === STATIONS_CIRCLE_ID);
    const [, cond, ramp, empty] = circle.paint['circle-color'];
    expect(cond).toEqual(['all', ['!', ['get', 'stale']], ['!=', ['get', 'fm100'], null]]);
    expect(ramp.slice(0, 3)).toEqual(['interpolate', ['linear'], ['get', 'fm100']]);
    expect(empty).toBe('rgba(0,0,0,0)');
  });

  it('renders nothing with no field or data', () => {
    ctx = { stationsOn: true, stations: { data: null, field: 'erc' }, opacity: { stations: 0.9 } };
    render(<FireDangerStationsLayer />);
    expect(layerProps).toHaveLength(0);
  });
});

describe('StationTrendChart', () => {
  it('plots only returned days, observed solid and forecast dashed', () => {
    const pts = trendPoints(FIX.detail, 'erc');
    expect(pts.filter((p) => !p.forecast)).toHaveLength(FIX.detail.observed.length);
    expect(pts.filter((p) => p.forecast)).toHaveLength(FIX.detail.forecast.length);
    const { container } = render(<StationTrendChart detail={FIX.detail} field="erc" label="ERC" color="#f97316" />);
    const paths = [...container.querySelectorAll('path')];
    expect(paths.some((p) => !p.getAttribute('stroke-dasharray'))).toBe(true);
    expect(paths.some((p) => p.getAttribute('stroke-dasharray'))).toBe(true);
    fireEvent.mouseEnter(container.querySelectorAll('rect')[0]);
    expect(screen.getByText(new RegExp(`: ${FIX.detail.observed[0].erc}$`))).toBeInTheDocument();
  });

  it('breaks the line at a missing day instead of joining across it', () => {
    const detail = { observed: [{ date: '2026-10-01', erc: 10 }, { date: '2026-10-02', erc: null }, { date: '2026-10-03', erc: 12 }, { date: '2026-10-04', erc: 13 }], forecast: [] };
    const { container } = render(<StationTrendChart detail={detail} field="erc" label="ERC" color="#f97316" />);
    expect(container.querySelectorAll('path')).toHaveLength(2);
  });
});
