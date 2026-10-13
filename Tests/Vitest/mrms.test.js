/**
 * mrms.test.js
 * The Weather tab's MRMS radar contract (src/app/api/mrms.js): manifest
 * validation, frame URLs, the byte encoding shared with the Python builder
 * (cloud/mrms/products.py), display units and legend rows.
 */

import { describe, it, expect } from 'vitest';
import {
  formatMrms, manifestIsStale, mrmsBase, mrmsDisplayUnit, mrmsFrameUrl, mrmsLegendRows, parseMrmsManifest, toMrmsDisplay,
} from '../../src/app/api/mrms';
import { rasterPaint, valueToByte } from '../../src/app/api/modelFields';
import { mrmsPanelOpenAfter } from '../../src/app/components/Map/MrmsPanel';

const precipRate = {
  label: 'Precipitation rate', quantity: 'rate', units: 'mm/h', encodingId: 'e130294f8',
  encoding: { transform: 'sqrt', lo: 0, hi: 150, nodata: 0, min: 1, max: 255 },
  palette: [[0, '#ffffff', 0], [0.1, '#c6dbef', 0], [0.2, '#c6dbef', 0.55], [1, '#6baed6', 0.7], [25.4, '#08306b', 0.85]],
  frames: [{ id: '20261002-005600', time: '2026-10-02T00:56:00Z' }, { id: '20261002-005800', time: '2026-10-02T00:58:00Z' }],
};
const manifest = {
  schemaVersion: 1,
  kind: 'mrms-manifest',
  generatedAt: '2026-10-02T01:02:00Z',
  attribution: 'MRMS: NOAA … not endorsed by NOAA.',
  windowMinutes: 60,
  image: { coordinates: [[-130, 55], [-60, 55], [-60, 20], [-130, 20]], levels: { lo: [2048, 1337], hi: [4096, 2674] } },
  products: { precipRate },
};

describe('MRMS manifest', () => {
  it('accepts the builder manifest and rejects anything else', () => {
    expect(parseMrmsManifest(manifest)).toBe(manifest);
    expect(() => parseMrmsManifest({ ...manifest, kind: 'model-field-manifest' })).toThrow(/Unexpected/);
    expect(() => parseMrmsManifest({ ...manifest, schemaVersion: 2 })).toThrow(/Unexpected/);
    expect(() => parseMrmsManifest({ ...manifest, image: undefined })).toThrow(/Incomplete/);
  });

  it('builds frame URLs under the CDN path, keyed by encoding and frame time', () => {
    const base = mrmsBase('https://d1.cloudfront.net/mrms/');
    expect(base).toBe('https://d1.cloudfront.net/mrms/v1');
    expect(mrmsFrameUrl(base, manifest, 'precipRate', '20261002-005800', 'hi'))
      .toBe('https://d1.cloudfront.net/mrms/v1/precipRate/e130294f8/hi/20261002-005800.png');
    expect(mrmsFrameUrl(base, { ...manifest, image: { ...manifest.image, levels: { lo: [1, 1] } } }, 'precipRate', 'x', 'hi'))
      .toMatch(/\/lo\/x\.png$/);
    expect(mrmsBase(null)).toBeNull();
  });

  it('flags a manifest the builder stopped refreshing', () => {
    const t = Date.parse(manifest.generatedAt);
    expect(manifestIsStale(manifest, t + 3 * 60_000)).toBe(false);
    expect(manifestIsStale(manifest, t + 11 * 60_000)).toBe(true);
  });
});

describe('MRMS encoding (shared with cloud/mrms/products.py encode_bytes)', () => {
  it('matches the builder byte for the same value', () => {
    // Python: encode_bytes(25, 0, 150, 'sqrt') == 105 (see tests/test_builder.py)
    expect(Math.round(valueToByte(25, precipRate.encoding))).toBe(105);
    // Python: encode_bytes(51, -10, 75) == 183
    expect(Math.round(valueToByte(51, { lo: -10, hi: 75, transform: 'linear' }))).toBe(183);
  });

  it('colours with the shared raster-color paint, opacity applied', () => {
    const paint = rasterPaint(precipRate, 0.6);
    expect(paint['raster-opacity']).toBe(0.6);
    expect(paint['raster-color'][0]).toBe('interpolate');
  });
});

describe('MRMS display units', () => {
  it('converts product units to US display units', () => {
    expect(toMrmsDisplay(25.4, 'size')).toBeCloseTo(1);
    expect(toMrmsDisplay(25.4, 'rate')).toBeCloseTo(1);
    expect(toMrmsDisplay(12, 'shear')).toBeCloseTo(0.012);
    expect(toMrmsDisplay(10, 'height')).toBeCloseTo(32.8, 1);
    expect(toMrmsDisplay(45, 'reflectivity')).toBe(45);
    expect(formatMrms(10, 'height')).toBe('33');
    expect(formatMrms(null, 'rate')).toBe('—');
    expect(mrmsDisplayUnit('height')).toBe('kft');
  });

  it('lists only visible palette stops in the legend', () => {
    expect(mrmsLegendRows(precipRate)).toEqual([
      { color: '#c6dbef', label: '0.01 in/h' },
      { color: '#6baed6', label: '0.04 in/h' },
      { color: '#08306b', label: '1.00 in/h' },
    ]);
  });
});

describe('mrmsPanelOpenAfter', () => {
  it('opens when MRMS is switched on', () => {
    expect(mrmsPanelOpenAfter({}, { mrms: true }, false)).toBe(true);
  });

  it('closes when MRMS is switched off', () => {
    expect(mrmsPanelOpenAfter({ mrms: true }, {}, true)).toBe(false);
  });

  it('steps aside when another docked layer, such as satellite, is switched on after it', () => {
    expect(mrmsPanelOpenAfter({ mrms: true }, { mrms: true, satellite: true }, true)).toBe(false);
    expect(mrmsPanelOpenAfter({ mrms: true }, { mrms: true, spcWeatherOutlooks: true }, true)).toBe(false);
  });

  it('otherwise keeps its open state', () => {
    expect(mrmsPanelOpenAfter({ mrms: true }, { mrms: true, stormReports: true }, false)).toBe(false);
    expect(mrmsPanelOpenAfter({ mrms: true }, { mrms: true, stormReports: true }, true)).toBe(true);
  });
});
