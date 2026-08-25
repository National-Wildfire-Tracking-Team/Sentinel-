import { describe, expect, it } from 'vitest';
import {
  buildRadarSampleUrl,
  classifyDbz,
  latLngToWebMercator,
  parseRadarMetadata,
  radarColorToDbz,
} from '../../src/services/radarProbe';

describe('radarProbe', () => {
  it.each([
    [14.9, 'Very Light'],
    [15, 'Light Rain'],
    [30, 'Moderate Rain'],
    [40, 'Heavy Rain'],
    [50, 'Very Heavy Rain'],
    [60, 'Severe Storm Core'],
    [70, 'Severe Storm Core'],
    [70.1, 'Extreme Reflectivity'],
  ])('classifies %s dBZ as %s', (dbz, expected) => {
    expect(classifyDbz(dbz)).toBe(expected);
  });

  it('projects latitude and longitude to Web Mercator', () => {
    expect(latLngToWebMercator(0, 0)).toEqual({ x: 0, y: expect.closeTo(0, 6) });
    const projected = latLngToWebMercator(38.1234, -77.4321);
    expect(projected.x).toBeCloseTo(-8619701.9, 0);
    expect(projected.y).toBeCloseTo(4596872.8, 0);
  });

  it('builds a GetMap request instead of unsupported GetFeatureInfo', () => {
    const url = new URL(buildRadarSampleUrl(38.1234, -77.4321));
    expect(url.searchParams.get('REQUEST')).toBe('GetMap');
    expect(url.searchParams.get('LAYERS')).toBe('nexrad-n0q-900913');
    expect(url.searchParams.get('WIDTH')).toBe('3');
  });

  it('maps radar palette colors and transparent pixels', () => {
    expect(radarColorToDbz(253, 0, 0)).toBe(52.5);
    expect(radarColorToDbz(248, 0, 253)).toBe(70);
    expect(radarColorToDbz(4, 233, 231, 0)).toBeNull();
  });

  it('parses authoritative composite scan metadata', () => {
    const result = parseRadarMetadata({
      meta: { valid: '2026-08-25T17:45:00Z', radar_quorum: '144/147' },
    });
    expect(result.scanTime.toISOString()).toBe('2026-08-25T17:45:00.000Z');
    expect(result.radarQuorum).toBe('144/147');
  });
});