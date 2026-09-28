import { describe, it, expect } from 'vitest';
import {
  haversineMiles,
  geometryIntersectsCircle,
  filterByRadius,
  circlePolygon,
} from '../../src/app/utils/radiusFilter';

// Sacramento, CA
const LAT = 38.58;
const LNG = -121.49;
const deg = (miles) => miles / 69; // ≈ degrees of latitude

const square = (cLat, cLng, halfMiles) => {
  const d = deg(halfMiles);
  return {
    type: 'Polygon',
    coordinates: [[
      [cLng - d, cLat - d], [cLng + d, cLat - d], [cLng + d, cLat + d], [cLng - d, cLat + d], [cLng - d, cLat - d],
    ]],
  };
};

describe('haversineMiles', () => {
  it('measures Sacramento → San Francisco at ~75 mi', () => {
    expect(haversineMiles(LAT, LNG, 37.77, -122.42)).toBeGreaterThan(70);
    expect(haversineMiles(LAT, LNG, 37.77, -122.42)).toBeLessThan(80);
  });
});

describe('geometryIntersectsCircle', () => {
  it('includes a polygon the center sits inside', () => {
    expect(geometryIntersectsCircle(square(LAT, LNG, 200), LAT, LNG, 5)).toBe(true);
  });

  it('includes a polygon whose edge crosses the radius', () => {
    // Square centered 30 mi north, 10 mi half-width → nearest edge 20 mi away
    expect(geometryIntersectsCircle(square(LAT + deg(30), LNG, 10), LAT, LNG, 25)).toBe(true);
    expect(geometryIntersectsCircle(square(LAT + deg(30), LNG, 10), LAT, LNG, 15)).toBe(false);
  });

  it('excludes the center when it sits inside a polygon hole', () => {
    const outer = square(LAT, LNG, 100).coordinates[0];
    const hole = square(LAT, LNG, 20).coordinates[0];
    const donut = { type: 'Polygon', coordinates: [outer, hole] };
    expect(geometryIntersectsCircle(donut, LAT, LNG, 10)).toBe(false);
    expect(geometryIntersectsCircle(donut, LAT, LNG, 25)).toBe(true);
  });

  it('handles MultiPolygons and GeometryCollections', () => {
    const far = square(LAT + 10, LNG, 5);
    const near = square(LAT + deg(12), LNG, 5);
    const multi = { type: 'MultiPolygon', coordinates: [far.coordinates, near.coordinates] };
    expect(geometryIntersectsCircle(multi, LAT, LNG, 10)).toBe(true);
    expect(geometryIntersectsCircle({ type: 'GeometryCollection', geometries: [far] }, LAT, LNG, 10)).toBe(false);
  });

  it('rejects missing geometry or an invalid radius', () => {
    expect(geometryIntersectsCircle(null, LAT, LNG, 10)).toBe(false);
    expect(geometryIntersectsCircle(square(LAT, LNG, 5), LAT, LNG, 0)).toBe(false);
    expect(geometryIntersectsCircle(square(LAT, LNG, 5), LAT, LNG, undefined)).toBe(false);
  });
});

describe('filterByRadius', () => {
  const incidents = [
    { id: 'near', lat: LAT + deg(10), lng: LNG },
    { id: 'far', lat: LAT + deg(60), lng: LNG },
    { id: 'no-coords', lat: 0, lng: 0 },
    { id: 'feature', type: 'Feature', geometry: square(LAT + deg(28), LNG, 5) },
  ];
  const nwsAlerts = [
    { id: 'a-in', geometry: square(LAT, LNG, 50) },
    { id: 'a-out', geometry: square(LAT + 5, LNG, 20) },
    { id: 'a-nogeom', geometry: null },
  ];
  const spcOutlooks = { type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { riskCategory: 'SLGT' }, geometry: square(LAT + deg(35), LNG, 12) },
  ] };
  const wpcOutlooks = [
    { type: 'Feature', properties: { riskCategory: 'MARGINAL' }, geometry: square(LAT - 8, LNG, 30) },
  ];

  it('returns only items that affect the selected radius', () => {
    const result = filterByRadius({
      userLatitude: LAT, userLongitude: LNG, selectedRadius: 25,
      incidents, nwsAlerts, spcOutlooks, wpcOutlooks,
    });
    expect(result.incidents.map((i) => i.id)).toEqual(['near', 'feature']);
    expect(result.nwsAlerts.map((a) => a.id)).toEqual(['a-in']);
    expect(result.spcOutlooks).toHaveLength(1);
    expect(result.wpcOutlooks).toHaveLength(0);
  });

  it('moves with the center point', () => {
    const result = filterByRadius({
      userLatitude: LAT + deg(60), userLongitude: LNG, selectedRadius: 25, incidents,
    });
    expect(result.incidents.map((i) => i.id)).toEqual(['far']);
  });

  it('never falls back to a default radius', () => {
    const result = filterByRadius({ userLatitude: LAT, userLongitude: LNG, incidents, nwsAlerts });
    expect(result).toEqual({ incidents: [], nwsAlerts: [], spcOutlooks: [], wpcOutlooks: [] });
  });
});

describe('circlePolygon', () => {
  it('produces a closed ring at the requested radius', () => {
    const ring = circlePolygon(LAT, LNG, 25).coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const [pLng, pLat] of ring) {
      expect(haversineMiles(LAT, LNG, pLat, pLng)).toBeCloseTo(25, 1);
    }
  });
});
