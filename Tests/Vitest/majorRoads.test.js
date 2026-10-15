import { describe, it, expect, vi } from 'vitest';
import { nearestMajorRoad } from '../../src/app/utils/majorRoads';

const road = (cls, coords, distance, extra = {}) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: coords },
  properties: { class: cls, name: `${cls} road`, tilequery: { distance }, ...extra },
});
const respond = (features, ok = true) => vi.fn().mockResolvedValue({ ok, json: async () => ({ features }) });

describe('nearestMajorRoad', () => {
  it('returns the closest motorway/trunk/primary point', async () => {
    const fetchImpl = respond([
      road('street', [-121, 38], 10),
      road('primary', [-121.01, 38], 800),
      road('trunk', [-121.02, 38], 400),
    ]);
    const hit = await nearestMajorRoad([-121, 38], { fetchImpl, token: 't' });
    expect(hit).toEqual({ point: [-121.02, 38], roadClass: 'trunk', name: 'trunk road' });
    expect(fetchImpl.mock.calls[0][0]).toContain('mapbox.mapbox-streets-v8/tilequery/-121,38.json');
    expect(fetchImpl.mock.calls[0][0]).toContain('layers=road');
  });

  it('skips tunnels and minor roads', async () => {
    const fetchImpl = respond([road('motorway', [-121, 38], 5, { structure: 'tunnel' }), road('secondary', [-121, 38], 5)]);
    expect(await nearestMajorRoad([-121, 38], { fetchImpl, token: 't' })).toBeNull();
  });

  it('returns null without a token or on an HTTP error', async () => {
    expect(await nearestMajorRoad([-121, 38], { fetchImpl: respond([]), token: '' })).toBeNull();
    expect(await nearestMajorRoad([-121, 38], { fetchImpl: respond([], false), token: 't' })).toBeNull();
  });
});
