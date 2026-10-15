import { describe, it, expect, vi } from 'vitest';
import { buildAvoidPolygons, isAvoidedEvacZone, MAX_VERTICES, MAX_POLYGONS, CELL_KM, MAX_AVOID_BYTES } from '../../src/app/utils/routingHazards';

vi.mock('@turf/buffer', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    default: (feature, ...rest) => {
      if (feature?.geometry?.coordinates?.[0]?.[0]?.[0] === -121.7777) throw new Error('invalid geometry');
      return mod.default(feature, ...rest);
    },
  };
});

const sq = (lng, lat, d, props = {}) => ({
  type: 'Feature',
  properties: props,
  geometry: { type: 'Polygon', coordinates: [[[lng, lat], [lng + d, lat], [lng + d, lat + d], [lng, lat + d], [lng, lat]]] },
});
const fc = (...features) => ({ type: 'FeatureCollection', features });
const origin = [-121.0, 38.0];
const destination = [-121.5, 38.3];
const verts = (mp) => mp.coordinates.reduce((n, poly) => n + poly.reduce((m, ring) => m + ring.length, 0), 0);

describe('isAvoidedEvacZone', () => {
  it('avoids orders and warnings (official and reporter), not watches', () => {
    expect(isAvoidedEvacZone(sq(0, 0, 1, { warningType: 'Evacuation Order' }))).toBe(true);
    expect(isAvoidedEvacZone(sq(0, 0, 1, { warningType: 'Evacuation Warning' }))).toBe(true);
    expect(isAvoidedEvacZone(sq(0, 0, 1, { zone_type: 'order', source: 'reporter' }))).toBe(true);
    expect(isAvoidedEvacZone(sq(0, 0, 1, { warningType: 'Evacuation Watch' }))).toBe(false);
  });
});

describe('buildAvoidPolygons', () => {
  it('returns null when nothing is near the trip', () => {
    const r = buildAvoidPolygons({ perimeters: fc(sq(-80, 30, 0.05)), evacZones: fc(), origin, destination });
    expect(r.avoid).toBeNull();
  });

  it('buffers nearby perimeters and order/warning zones into one MultiPolygon', () => {
    const r = buildAvoidPolygons({
      perimeters: fc(sq(-121.25, 38.1, 0.02)),
      evacZones: fc(sq(-121.3, 38.15, 0.02, { warningType: 'Evacuation Order' }), sq(-121.35, 38.2, 0.02, { warningType: 'Evacuation Watch' })),
      origin, destination,
    });
    expect(r.avoid.type).toBe('MultiPolygon');
    expect(r.avoid.coordinates).toHaveLength(2);
    // buffered: wider than the 0.02° input
    const xs = r.avoid.coordinates[0][0].map((c) => c[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.025);
  });

  it('drops polygons containing the origin or destination and reports it', () => {
    const r = buildAvoidPolygons({
      perimeters: fc(sq(-121.01, 37.99, 0.03), sq(-121.25, 38.1, 0.02)),
      evacZones: fc(),
      origin, destination,
    });
    expect(r.startsInsideHazard).toBe(true);
    expect(r.endsInsideHazard).toBe(false);
    expect(r.avoid.coordinates).toHaveLength(1);
  });

  it('splits polygons wider than the extent limit into cells', () => {
    // ~0.5° ≈ 44 km wide fire near the route → several ≤12 km cells (trip bbox spans the whole fire)
    const r = buildAvoidPolygons({ perimeters: fc(sq(-121.45, 38.05, 0.4)), evacZones: fc(), origin: [-121.6, 37.9], destination: [-120.8, 38.6] });
    expect(r.avoid.coordinates.length).toBeGreaterThan(4);
    for (const poly of r.avoid.coordinates) {
      const xs = poly[0].map((c) => c[0]);
      const ys = poly[0].map((c) => c[1]);
      expect((Math.max(...ys) - Math.min(...ys)) * 111).toBeLessThanOrEqual(CELL_KM + 0.5);
      expect((Math.max(...xs) - Math.min(...xs)) * 111 * Math.cos((38.2 * Math.PI) / 180)).toBeLessThanOrEqual(CELL_KM + 0.5);
    }
  });

  it('stays under the vertex cap', () => {
    const many = Array.from({ length: 400 }, (_, i) => sq(-121.4 + (i % 20) * 0.015, 38.0 + Math.floor(i / 20) * 0.015, 0.01));
    const r = buildAvoidPolygons({ perimeters: fc(...many), evacZones: fc(), origin: [-121.6, 37.9], destination: [-120.9, 38.4] });
    expect(verts(r.avoid)).toBeLessThanOrEqual(MAX_VERTICES);
  });

  it('stays under the polygon cap, keeping the pieces closest to the trip', () => {
    expect(MAX_POLYGONS).toBe(2000);
    // 3,000 tiny squares on a 60 x 50 grid around the trip
    const many = Array.from({ length: 3000 }, (_, i) => sq(-121.6 + (i % 60) * 0.012, 37.9 + Math.floor(i / 60) * 0.012, 0.004));
    const r = buildAvoidPolygons({ perimeters: fc(...many), evacZones: fc(), origin: [-121.6, 37.85], destination: [-120.9, 38.6] });
    expect(r.avoid.coordinates.length).toBeGreaterThan(0);
    expect(r.avoid.coordinates.length).toBeLessThanOrEqual(MAX_POLYGONS);
    expect(verts(r.avoid)).toBeLessThanOrEqual(MAX_VERTICES);
  });

  it('skips a polygon whose buffering throws and keeps the rest', () => {
    const r = buildAvoidPolygons({
      perimeters: fc(sq(-121.7777, 38.1, 0.02), sq(-121.25, 38.1, 0.02)),
      evacZones: fc(), origin, destination,
    });
    expect(r.avoid.coordinates).toHaveLength(1);
  });

  it('only tiles the part of a huge polygon near the trip', () => {
    // 3° square whose southern edge just dips into the trip margin (~38.48 N)
    const r = buildAvoidPolygons({ perimeters: fc(sq(-122, 38.45, 3)), evacZones: fc(), origin, destination });
    const bounds = [-121.5 - 0.24, 38.0 - 0.18, -121.0 + 0.24, 38.3 + 0.18];
    expect(r.avoid.coordinates.length).toBeGreaterThan(0);
    expect(r.avoid.coordinates.length).toBeLessThan(20); // full-bbox tiling would be ~800
    for (const poly of r.avoid.coordinates) {
      const xs = poly[0].map((c) => c[0]);
      const ys = poly[0].map((c) => c[1]);
      expect(Math.min(...xs)).toBeLessThanOrEqual(bounds[2]);
      expect(Math.max(...xs)).toBeGreaterThanOrEqual(bounds[0]);
      expect(Math.min(...ys)).toBeLessThanOrEqual(bounds[3]);
      expect(Math.max(...ys)).toBeGreaterThanOrEqual(bounds[1]);
    }
  });

  it('tolerates null/empty inputs', () => {
    expect(buildAvoidPolygons({ perimeters: null, evacZones: undefined, origin, destination }).avoid).toBeNull();
  });

  describe('request size (C1: bodies must stay well under the server cap)', () => {
    const decimals = (n) => (String(n).split('.')[1] || '').length;
    // Worst case: 400 buffered perimeters around the trip. Unrounded this was ~290 KB.
    const many = Array.from({ length: 400 }, (_, i) => sq(-121.4 + (i % 20) * 0.015, 38.0 + Math.floor(i / 20) * 0.015, 0.01));
    const o = [-121.6, 37.9];
    const d = [-120.9, 38.4];

    it('caps the serialized body under MAX_AVOID_BYTES', () => {
      expect(MAX_AVOID_BYTES).toBe(150_000);
      const { avoid } = buildAvoidPolygons({ perimeters: fc(...many), evacZones: fc(), origin: o, destination: d });
      expect(avoid.coordinates.length).toBeGreaterThan(0);
      expect(JSON.stringify({ origin: o, destination: d, avoid }).length).toBeLessThan(MAX_AVOID_BYTES);
    });

    it('rounds every coordinate to at most 5 decimals and keeps rings closed (>= 4 points, no repeats)', () => {
      const { avoid } = buildAvoidPolygons({ perimeters: fc(...many), evacZones: fc(), origin: o, destination: d });
      for (const poly of avoid.coordinates) {
        for (const ring of poly) {
          expect(ring.length).toBeGreaterThanOrEqual(4);
          expect(ring[0]).toEqual(ring[ring.length - 1]);
          for (let i = 0; i < ring.length; i++) {
            expect(decimals(ring[i][0])).toBeLessThanOrEqual(5);
            expect(decimals(ring[i][1])).toBeLessThanOrEqual(5);
            if (i > 0) expect(ring[i]).not.toEqual(ring[i - 1]);
          }
        }
      }
    });

    it('keeps the pieces nearest the trip midpoint when the size cap bites', () => {
      const { avoid } = buildAvoidPolygons({ perimeters: fc(...many), evacZones: fc(), origin: o, destination: d });
      const mid = [(o[0] + d[0]) / 2, (o[1] + d[1]) / 2];
      const centre = (poly) => {
        const xs = poly[0].map((c) => c[0]);
        const ys = poly[0].map((c) => c[1]);
        return Math.hypot((Math.min(...xs) + Math.max(...xs)) / 2 - mid[0], (Math.min(...ys) + Math.max(...ys)) / 2 - mid[1]);
      };
      expect(avoid.coordinates.length).toBeLessThan(400);
      // The square at the midpoint survives; the farthest corner square does not.
      const dists = avoid.coordinates.map(centre);
      expect(Math.min(...dists)).toBeLessThan(0.02);
      expect(Math.max(...dists)).toBeLessThan(Math.hypot(-121.4 + 0.005 - mid[0], 38.0 + 0.005 - mid[1]));
    });
  });
});
