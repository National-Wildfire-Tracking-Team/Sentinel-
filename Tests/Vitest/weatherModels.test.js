/**
 * weatherModels.test.js
 * The Weather Models client (src/app/api/weatherModels.js) and its helpers
 * (src/app/components/WeatherModels/modelTheme.js).
 *
 * The contract: only a /v1 model forecast for the model that was asked for
 * is ever returned; anything else is an error the page shows, never data.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ModelServiceError,
  buildForecastUrl,
  fetchModelCatalog,
  fetchModelForecast,
  parseForecastResponse,
  roundCoord,
} from '../../src/app/api/weatherModels';
import { clearCache } from '../../src/app/utils/dataCache';
import {
  ageLabel,
  compassPoint,
  dayZulu,
  entryAt,
  formatValue,
  insidePolygon,
  nowIndex,
  zulu,
} from '../../src/app/components/WeatherModels/modelTheme';
import { modelsHref, parseModelsQuery } from '../../src/app/utils/weatherModelsLink';

const BASE = 'https://d123.cloudfront.net/weather-models/';

const forecastBody = (overrides = {}) => ({
  schemaVersion: 1,
  kind: 'model-forecast',
  model: { id: 'hrrr', name: 'HRRR', fullName: 'High-Resolution Rapid Refresh' },
  run: { runTime: '2026-10-01T12:00:00Z', ageMinutes: 130, stale: false, complete: true },
  units: { temperature: '°F' },
  forecast: [{ validTime: '2026-10-01T12:00:00Z', forecastHour: 0, temperature: 64.6 }],
  ...overrides,
});

function respond(payload, { ok = true, status = 200 } = {}) {
  const fetchMock = vi.fn(() => Promise.resolve({ ok, status, json: () => Promise.resolve(payload) }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearCache();
});

describe('request URL', () => {
  it('rounds coordinates to 0.01° so nearby requests share the edge cache', () => {
    expect(roundCoord(28.53834)).toBe(28.54);
    expect(roundCoord(-81.37924)).toBe(-81.38);
    const url = new URL(buildForecastUrl(BASE, { lat: 28.53834, lon: -81.37924, model: 'hrrr', hours: 48 }));
    expect(url.pathname).toBe('/weather-models/v1/forecast');
    expect(Object.fromEntries(url.searchParams)).toEqual({ lat: '28.54', lon: '-81.38', model: 'hrrr', units: 'us', hours: '48' });
  });

  it('passes variables through', () => {
    const url = new URL(buildForecastUrl(BASE, { lat: 1, lon: 2, model: 'gfs', variables: ['temperature', 'windSpeed'] }));
    expect(url.searchParams.get('variables')).toBe('temperature,windSpeed');
  });
});

describe('parseForecastResponse', () => {
  it('accepts a model forecast', () => {
    expect(parseForecastResponse(forecastBody(), 'hrrr').model.name).toBe('HRRR');
  });

  it.each([
    ['wrong schema', forecastBody({ schemaVersion: 2 })],
    ['not a model forecast', forecastBody({ kind: 'observation' })],
    ['no run', forecastBody({ run: undefined })],
    ['no forecast', forecastBody({ forecast: null })],
    ['empty', null],
  ])('rejects %s', (_, body) => {
    expect(() => parseForecastResponse(body, 'hrrr')).toThrow(ModelServiceError);
  });

  it('never accepts one model labelled as another', () => {
    const gfs = forecastBody({ model: { id: 'gfs', name: 'GFS' } });
    expect(() => parseForecastResponse(gfs, 'hrrr')).toThrow(/Asked for HRRR but received GFS/);
    // auto may legitimately resolve to either
    expect(parseForecastResponse(gfs, 'auto').model.id).toBe('gfs');
  });
});

describe('fetchModelForecast', () => {
  it('throws not_configured without a service URL', async () => {
    await expect(fetchModelForecast({ lat: 1, lon: 1, model: 'hrrr' }, null)).rejects.toMatchObject({ code: 'not_configured' });
  });

  it('requests the model’s full range by default and caches the answer', async () => {
    const fetchMock = respond(forecastBody());
    await fetchModelForecast({ lat: 28.5, lon: -81.4, model: 'hrrr' }, BASE);
    await fetchModelForecast({ lat: 28.5, lon: -81.4, model: 'hrrr' }, BASE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('hours=48');
  });

  it('surfaces the service’s error message and code', async () => {
    respond({ schemaVersion: 1, error: { code: 'out_of_domain', message: '(21.3, -157.85) is outside the HRRR CONUS domain' } },
      { ok: false, status: 422 });
    await expect(fetchModelForecast({ lat: 21.3, lon: -157.85, model: 'hrrr' }, BASE))
      .rejects.toMatchObject({ status: 422, code: 'out_of_domain', message: expect.stringContaining('outside the HRRR') });
  });

  it('does not cache errors', async () => {
    respond({ error: { code: 'no_data', message: 'not yet' } }, { ok: false, status: 503 });
    await expect(fetchModelForecast({ lat: 1, lon: 1, model: 'gfs' }, BASE)).rejects.toThrow('not yet');
    const fetchMock = respond(forecastBody({ model: { id: 'gfs', name: 'GFS' } }));
    await fetchModelForecast({ lat: 1, lon: 1, model: 'gfs' }, BASE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a network failure plainly', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(fetchModelForecast({ lat: 1, lon: 1, model: 'gfs' }, BASE)).rejects.toThrow('Could not reach the weather model service');
  });

  it('validates the catalog', async () => {
    respond({ schemaVersion: 1, kind: 'model-catalog', models: [{ id: 'hrrr' }] });
    expect((await fetchModelCatalog(BASE)).models).toHaveLength(1);
    clearCache();
    respond({ schemaVersion: 1, kind: 'something-else', models: [] });
    await expect(fetchModelCatalog(BASE)).rejects.toThrow(ModelServiceError);
  });
});

describe('time and value helpers', () => {
  it('names runs by UTC hour', () => {
    expect(zulu('2026-10-01T12:00:00Z')).toBe('12Z');
    expect(zulu('2026-10-01T06:00:00Z')).toBe('06Z');
    expect(dayZulu('2026-10-01T18:00:00Z')).toMatch(/18Z$/);
    expect(zulu(null)).toBe('—');
  });

  it('picks the current hour on the timeline', () => {
    const forecast = ['12', '13', '14', '15'].map((h) => ({ validTime: `2026-10-01T${h}:00:00Z` }));
    expect(nowIndex(forecast, Date.parse('2026-10-01T14:20:00Z'))).toBe(2);
    expect(nowIndex(forecast, Date.parse('2026-10-01T09:00:00Z'))).toBe(0);
    expect(nowIndex(forecast, Date.parse('2026-10-02T09:00:00Z'))).toBe(3);
    expect(entryAt(forecast, '2026-10-01T13:00:00Z')).toBe(forecast[1]);
    expect(entryAt(forecast, '2026-10-01T13:30:00Z')).toBeNull();
  });

  it('compass points and ages', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(225)).toBe('SW');
    expect(compassPoint(359)).toBe('N');
    expect(compassPoint(null)).toBeNull();
    expect(ageLabel(45)).toBe('45 min old');
    expect(ageLabel(130)).toBe('2 h 10 min old');
    expect(ageLabel(120)).toBe('2 h old');
  });

  it('formats values with units and never invents numbers', () => {
    expect(formatValue(84.2, '°F', { decimals: 0 })).toBe('84°F');
    expect(formatValue(12.4, 'mph')).toBe('12.4 mph');
    expect(formatValue(null, 'mph')).toBe('—');
    expect(formatValue(Number.NaN, '%')).toBe('—');
  });

  it('point in the HRRR coverage polygon', () => {
    const box = { type: 'Polygon', coordinates: [[[-125, 25], [-65, 25], [-65, 50], [-125, 50], [-125, 25]]] };
    expect(insidePolygon(box, 28.5, -81.4)).toBe(true);
    expect(insidePolygon(box, 21.3, -157.8)).toBe(false);
    expect(insidePolygon(null, 0, 0)).toBe(true); // unknown coverage: the service decides
  });
});

describe('Models tab links', () => {
  it('builds a live-map link that opens the Models tab', () => {
    expect(modelsHref({ lat: 28.53834, lon: -81.37924, place: 'Orlando, FL', model: 'gfs' }))
      .toBe('/?tab=models&lat=28.5383&lon=-81.3792&place=Orlando%2C+FL&model=gfs');
    expect(modelsHref({ lat: 34, lon: -118, model: 'hrrr' })).toBe('/?tab=models&lat=34.0000&lon=-118.0000');
    expect(modelsHref({})).toBe('/?tab=models');
  });

  it('round-trips through the query parser', () => {
    const parsed = parseModelsQuery(modelsHref({ lat: 28.5383, lon: -81.3792, place: 'Orlando, FL', model: 'compare' }).slice(1));
    expect(parsed).toEqual({ location: { lat: 28.5383, lon: -81.3792, place: 'Orlando, FL' }, mode: 'compare', variable: null, view: 'swipe' });
  });

  it('ignores non-Models links and bad input', () => {
    expect(parseModelsQuery('?incident=123')).toBeNull();
    expect(parseModelsQuery('?tab=models&lat=95&lon=0')).toEqual({ location: null, mode: 'hrrr', variable: null, view: 'swipe' });
    expect(parseModelsQuery('?tab=models&lat=1&lon=1&model=ecmwf').mode).toBe('hrrr');
  });
});
