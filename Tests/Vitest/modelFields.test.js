/**
 * modelFields.test.js
 * The Models tab's spatial-field contract (src/app/api/modelFields.js and
 * the context helpers): frame URLs, the byte ↔ value encoding that must match
 * the Python field builder, the raster-color expression, units, and which
 * variables and valid times each mode may show.
 */

import { describe, it, expect } from 'vitest';
import {
  byteToValue, differenceUrl, fieldUrl, formatDisplay, hourAt, parseFieldManifest, rasterPaint, toDisplay, valueToByte, windUrl,
} from '../../src/app/api/modelFields';
import { timelineFor, variablesFor } from '../../src/app/utils/modelFieldSelection';
import { modelsHref, parseModelsQuery } from '../../src/app/utils/weatherModelsLink';

const BASE = 'https://d1.cloudfront.net/weather-models/fields/v1';

const manifest = {
  schemaVersion: 1,
  kind: 'model-field-manifest',
  models: {
    hrrr: {
      current: { id: '20261001T12Z', runTime: '2026-10-01T12:00:00Z', hours: [0, 1, 2, 3], validTimes: ['2026-10-01T12:00:00Z', '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', '2026-10-01T15:00:00Z'] },
      image: { coordinates: [], levels: { lo: [900, 500], hi: [1800, 1000] } },
      wind: { coordinates: [], size: [450, 250], range: 50 },
      variables: ['temperature', 'windGust', 'precipitationTotal'],
    },
    gfs: {
      current: { id: '20261001T06Z', runTime: '2026-10-01T06:00:00Z', hours: [6, 7, 8, 9], validTimes: ['2026-10-01T12:00:00Z', '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', '2026-10-01T15:00:00Z'] },
      image: { coordinates: [], levels: { lo: [520, 425] } },
      wind: { coordinates: [], size: [260, 212], range: 50 },
      variables: ['temperature', 'precipitationTotal'],
    },
  },
  difference: { id: '20261001T12Z_20261001T06Z', validTimes: ['2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z'], variables: ['temperature'] },
  variables: {
    temperature: { label: 'Temperature', quantity: 'temperature', models: ['hrrr', 'gfs'], encoding: { lo: -40, hi: 50, transform: 'linear' }, palette: [[-40, '#313695', 0.8], [50, '#a50026', 0.85]], difference: { encoding: { lo: -10, hi: 10, transform: 'linear' }, palette: [[-10, '#2166ac', 0.85], [10, '#b2182b', 0.85]] } },
    windGust: { label: 'Gusts', quantity: 'speed', models: ['hrrr'], encoding: { lo: 0, hi: 50, transform: 'linear' }, palette: [[0, '#ffffff', 0], [50, '#3f007d', 0.9]] },
    precipitationTotal: { label: 'Precip total', quantity: 'depth', models: ['hrrr', 'gfs'], encoding: { lo: 0, hi: 150, transform: 'sqrt' }, palette: [[0, '#ffffff', 0], [150, '#3f007d', 0.95]] },
  },
};

describe('frame URLs', () => {
  it('builds field, wind and difference keys exactly like the builder', () => {
    expect(fieldUrl(BASE, manifest, 'hrrr', 'temperature', 12, 'hi')).toBe(`${BASE}/hrrr/20261001T12Z/temperature/hi/012.png`);
    // GFS has no hi level: falls back to lo instead of a missing frame
    expect(fieldUrl(BASE, manifest, 'gfs', 'temperature', 72, 'hi')).toBe(`${BASE}/gfs/20261001T06Z/temperature/lo/072.png`);
    expect(windUrl(BASE, manifest, 'gfs', 6)).toBe(`${BASE}/gfs/20261001T06Z/wind/006.png`);
    expect(differenceUrl(BASE, manifest, 'temperature', '2026-10-01T13:00:00Z'))
      .toBe(`${BASE}/diff/20261001T12Z_20261001T06Z/temperature/20261001T1300Z.png`);
  });

  it('maps a valid time to each model’s own forecast hour', () => {
    expect(hourAt(manifest, 'hrrr', '2026-10-01T14:00:00Z')).toBe(2);
    expect(hourAt(manifest, 'gfs', '2026-10-01T14:00:00Z')).toBe(8);
    expect(hourAt(manifest, 'hrrr', '2026-10-02T00:00:00Z')).toBeNull();
  });

  it('rejects anything that is not a field manifest', () => {
    expect(() => parseFieldManifest({ ...manifest, kind: 'model-forecast' })).toThrow();
    expect(() => parseFieldManifest({ ...manifest, schemaVersion: 2 })).toThrow();
    expect(parseFieldManifest(manifest)).toBe(manifest);
  });
});

describe('encoding matches the Python builder', () => {
  it('linear and sqrt round trips', () => {
    for (const enc of [{ lo: -40, hi: 50, transform: 'linear' }, { lo: 0, hi: 150, transform: 'sqrt' }]) {
      for (const v of [enc.lo, (enc.lo + enc.hi) / 3, enc.hi]) {
        expect(byteToValue(valueToByte(v, enc), enc)).toBeCloseTo(v, 6);
      }
      expect(valueToByte(enc.lo, enc)).toBe(1);
      expect(valueToByte(enc.hi, enc)).toBe(255);
    }
    // fields/variables.py encode_bytes(25, -40, 50) == round(1 + 65/90*254) == 184
    expect(Math.round(valueToByte(25, { lo: -40, hi: 50, transform: 'linear' }))).toBe(184);
  });

  it('raster paint reads the byte from red and leaves no-data transparent', () => {
    const paint = rasterPaint(manifest.variables.temperature);
    expect(paint['raster-color-mix']).toEqual([255, 0, 0, 0]);
    expect(paint['raster-color-range']).toEqual([0, 255]);
    const expr = paint['raster-color'];
    expect(expr.slice(0, 7)).toEqual(['interpolate', ['linear'], ['raster-value'], 0, 'rgba(0, 0, 0, 0)', 0.5, 'rgba(0, 0, 0, 0)']);
    const stops = expr.slice(3).filter((_, i) => i % 2 === 0);
    expect(stops.every((s, i) => i === 0 || s > stops[i - 1])).toBe(true);
  });
});

describe('display units', () => {
  it('converts values and differences', () => {
    expect(toDisplay(0, 'temperature')).toBe(32);
    expect(toDisplay(10, 'temperature', 'us', { delta: true })).toBe(18);
    expect(toDisplay(10, 'speed')).toBeCloseTo(22.37, 2);
    expect(toDisplay(25.4, 'depth')).toBe(1);
    expect(toDisplay(1013, 'pressure')).toBe(1013);
    expect(formatDisplay(-0.2, 'temperature')).toBe('0');
    expect(formatDisplay(0.123, 'rate')).toBe('0.12');
  });
});

describe('what each mode can show', () => {
  it('disables variables a model or comparison cannot provide, with a reason', () => {
    const gfs = Object.fromEntries(variablesFor(manifest, 'gfs', 'swipe').map((v) => [v.id, v]));
    expect(gfs.windGust.available).toBe(false);
    expect(gfs.windGust.reason).toBe('Not in GFS');
    const diff = Object.fromEntries(variablesFor(manifest, 'compare', 'difference').map((v) => [v.id, v]));
    expect(diff.temperature.available).toBe(true);
    expect(diff.precipitationTotal.reason).toBe('Not comparable between models');
    expect(diff.windGust.reason).toBe('Not in GFS');
  });

  it('timeline: per model, shared times for swipe, published times for difference', () => {
    expect(timelineFor(manifest, 'hrrr', 'swipe')).toHaveLength(4);
    expect(timelineFor(manifest, 'compare', 'swipe')).toEqual(manifest.models.hrrr.current.validTimes);
    expect(timelineFor(manifest, 'compare', 'difference')).toEqual(manifest.difference.validTimes);
    expect(timelineFor(null, 'hrrr', 'swipe')).toEqual([]);
  });

  it('shareable links carry model, variable and view', () => {
    const href = modelsHref({ model: 'compare', variable: 'relativeHumidity', view: 'difference' });
    expect(href).toBe('/?tab=models&model=compare&var=relativeHumidity&view=difference');
    expect(parseModelsQuery(href.slice(1))).toMatchObject({ mode: 'compare', variable: 'relativeHumidity', view: 'difference' });
    expect(parseModelsQuery('?tab=models&var=<script>').variable).toBeNull();
  });
});
