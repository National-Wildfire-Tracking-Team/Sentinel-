import { describe, it, expect } from 'vitest';
import { findEvacExit, isFireZone, preferMajorRoads, EXIT_MARGIN_KM, MAX_CANDIDATES } from '../../src/app/utils/evacExit';

const sq = (x, y, d, properties = {}) => ({
  type: 'Feature',
  properties,
  geometry: { type: 'Polygon', coordinates: [[[x - d, y - d], [x + d, y - d], [x + d, y + d], [x - d, y + d], [x - d, y - d]]] },
});
const rect = (x0, y0, x1, y1, properties = {}) => ({
  type: 'Feature',
  properties,
  geometry: { type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] },
});
const pt = (x, y) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [x, y] } });
const fc = (...features) => ({ type: 'FeatureCollection', features });
const pip = (p, f) => {
  const [[x0, y0], , [x1, y1]] = f.geometry.coordinates[0];
  return p[0] > Math.min(x0, x1) && p[0] < Math.max(x0, x1) && p[1] > Math.min(y0, y1) && p[1] < Math.max(y0, y1);
};

const origin = [-121, 38];
const km = (a, b) => Math.hypot((a[0] - b[0]) * 111.32 * Math.cos((38 * Math.PI) / 180), (a[1] - b[1]) * 111.32);

describe('findEvacExit', () => {
  it('returns null when the start is outside every zone', () => {
    expect(findEvacExit({ origin, evacZones: fc(sq(-120, 38, 0.05, { warningType: 'Evacuation Order' })) })).toBeNull();
    expect(findEvacExit({ origin, evacZones: null })).toBeNull();
  });

  it('counts every zone level, including watches and reporter zones', () => {
    const watch = findEvacExit({ origin, evacZones: fc(sq(-121, 38, 0.05, { warningType: 'Evacuation Watch' })) });
    expect(watch.zone).toMatchObject({ level: 'Evacuation Watch', isFire: false });
    const reporter = findEvacExit({ origin, evacZones: fc(sq(-121, 38, 0.05, { zone_type: 'Evacuation Warning', title: 'Zone 4' })) });
    expect(reporter.zone).toMatchObject({ level: 'Evacuation Warning', name: 'Zone 4' });
  });

  it('heads for the nearest edge, just past it', () => {
    // Start near the east edge of a wide zone: the nearest way out is east.
    const zone = rect(-121.2, 37.9, -120.99, 38.1, { warningType: 'Evacuation Order', zoneName: 'Zone A' });
    const r = findEvacExit({ origin, evacZones: fc(zone) });
    const [best] = r.candidates;
    expect(best.bearing).toBe(90);
    expect(pip(best.point, zone)).toBe(false);
    // 0.01° of longitude at 38° ≈ 0.88 km to the edge, then the margin.
    expect(best.distanceKm).toBeGreaterThan(0.8 + EXIT_MARGIN_KM);
    expect(best.distanceKm).toBeLessThan(1.1 + EXIT_MARGIN_KM);
    expect(r.candidates.length).toBeGreaterThan(1);
  });

  it('does not exit into a neighbouring zone', () => {
    const home = rect(-121.2, 37.9, -120.99, 38.1, { warningType: 'Evacuation Order' });
    const neighbour = rect(-120.99, 37.9, -120.7, 38.1, { warningType: 'Evacuation Warning' });
    const r = findEvacExit({ origin, evacZones: fc(home, neighbour) });
    for (const c of r.candidates) {
      expect(pip(c.point, home)).toBe(false);
      expect(pip(c.point, neighbour)).toBe(false);
    }
    expect(r.candidates[0].bearing).not.toBe(90);
  });

  it('in a fire zone, only keeps exits leading away from the fire', () => {
    // Fire just east of the start: the east edge is nearest, but leads toward it.
    const zone = rect(-121.2, 37.9, -120.99, 38.1, { warningType: 'Evacuation Order' });
    const fire = sq(-120.97, 38, 0.005);
    const r = findEvacExit({ origin, evacZones: fc(zone), perimeters: fc(fire) });
    expect(r.zone.isFire).toBe(true);
    expect(r.candidates.length).toBeGreaterThan(0);
    for (const c of r.candidates) {
      // No exit heads east toward the fire, and each ends further from it.
      expect(Math.abs(c.bearing - 90)).toBeGreaterThanOrEqual(60);
      expect(km(c.point, [-120.97, 38])).toBeGreaterThan(km(origin, [-120.97, 38]));
    }
  });

  it('treats hotspots as fires too', () => {
    const zone = rect(-121.2, 37.9, -120.99, 38.1, { warningType: 'Evacuation Warning' });
    const r = findEvacExit({ origin, evacZones: fc(zone), hotspots: fc(pt(-120.995, 38)) });
    expect(r.zone.isFire).toBe(true);
    for (const c of r.candidates) {
      expect(Math.abs(c.bearing - 90)).toBeGreaterThanOrEqual(60);
      expect(km(c.point, [-120.995, 38])).toBeGreaterThan(km(origin, [-120.995, 38]));
    }
  });

  it('never ends inside a fire perimeter', () => {
    const zone = sq(-121, 38, 0.02, { warningType: 'Evacuation Order' });
    const fire = rect(-121.1, 38.025, -120.9, 38.2);
    const r = findEvacExit({ origin, evacZones: fc(zone), perimeters: fc(fire) });
    for (const c of r.candidates) expect(pip(c.point, fire)).toBe(false);
  });
});

describe('isFireZone', () => {
  it('matches a zone named for a fire', () => {
    expect(isFireZone(sq(-121, 38, 0.05, { zoneName: 'Park Fire Zone 3' }), [], [])).toBe(true);
    expect(isFireZone(sq(-121, 38, 0.05, { ipawsEvent: 'Fire Warning' }), [], [])).toBe(true);
  });

  it('does not match a zone with no fire nearby', () => {
    expect(isFireZone(sq(-121, 38, 0.05, { zoneName: 'Flood Zone 2' }), [], [[-119, 36]])).toBe(false);
  });
});

describe('preferMajorRoads', () => {
  const zone = rect(-121.2, 37.9, -120.99, 38.1, { warningType: 'Evacuation Order' });

  it('puts a valid major-road exit first and keeps plain exits after it', async () => {
    const exit = findEvacExit({ origin, evacZones: fc(zone) });
    // A highway 1 km past the east edge.
    const road = [-120.975, 38.001];
    const list = await preferMajorRoads(exit, async (p) => (p[0] > -121 ? { point: road, name: 'SR 99' } : null));
    expect(list[0]).toMatchObject({ point: road, major: true, road: 'SR 99' });
    expect(list.length).toBeLessThanOrEqual(MAX_CANDIDATES);
    expect(list.some((c) => !c.major)).toBe(true);
  });

  it('ignores a road point that is inside the zone', async () => {
    const exit = findEvacExit({ origin, evacZones: fc(zone) });
    const list = await preferMajorRoads(exit, async () => ({ point: [-121.1, 38], name: 'Inside Rd' }));
    expect(list.every((c) => !c.major)).toBe(true);
  });

  it('ignores a road point close to a fire', async () => {
    const fire = sq(-120.96, 38.03, 0.003);
    const exit = findEvacExit({ origin, evacZones: fc(zone), perimeters: fc(fire) });
    const list = await preferMajorRoads(exit, async () => ({ point: [-120.965, 38.03], name: 'Fire Rd' }));
    expect(list.every((c) => !c.major)).toBe(true);
  });

  it('keeps the plain exits when every lookup fails', async () => {
    const exit = findEvacExit({ origin, evacZones: fc(zone) });
    const list = await preferMajorRoads(exit, async () => { throw new Error('offline'); });
    expect(list).toEqual(exit.candidates);
  });
});

describe('passesFire', () => {
  const zone = rect(-121.2, 37.9, -120.99, 38.1, { warningType: 'Evacuation Order' });
  const fire = sq(-121.1, 38.05, 0.005);
  const exit = findEvacExit({ origin, evacZones: fc(zone), perimeters: fc(fire) });

  it('flags a route that runs right past a fire', () => {
    expect(exit.passesFire([origin, [-121.1, 38.04], [-121.21, 38.04]])).toBe(true);
  });

  it('does not flag a route heading the other way', () => {
    expect(exit.passesFire([origin, [-120.98, 38]])).toBe(false);
  });

  it('never flags anything when there are no fires', () => {
    const quiet = findEvacExit({ origin, evacZones: fc(zone) });
    expect(quiet.passesFire([origin, [-121.1, 38.05]])).toBe(false);
  });
});
