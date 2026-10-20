// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  FEMA_OPEN_SHELTERS_URL, fetchFemaShelters, fetchSentinelShelters,
  mergeShelters, nearestByDistance, rankByDriveTime,
} from '../../supabase/functions/ors-routing/shelters.mjs';

const origin = [-121.0, 38.0];
const s = (id, lng, lat, source = 'sentinel', name = id) =>
  ({ id, source, name, kind: 'evacuation_center', address: null, lng, lat });

describe('fetchSentinelShelters', () => {
  it('requests only recently updated Sentinel shelters with coordinates inside the radius box', async () => {
    const restGet = vi.fn().mockResolvedValue([
      { id: 'a', name: 'Fairgrounds', kind: 'evacuation_center', address: '1 Main', lat: 38.01, lng: -121.01 },
    ]);
    const now = Date.parse('2026-10-09T12:00:00Z');
    const out = await fetchSentinelShelters({ supabase: { restGet }, origin, radiusKm: 80, now: () => now });
    const q = restGet.mock.calls[0][0];
    expect(q).toMatch(/^incident_shelters\?select=id,name,kind,address,lat,lng/);
    expect(q).toContain('updated_at=gte.2026-09-25T12%3A00%3A00.000Z');
    expect(q).toMatch(/lat=gte\.37\.2\d*/);
    expect(q).toMatch(/lng=lte\.-120\.0\d*/);
    // People shelters only: animal shelters are never offered as the nearest place to go.
    expect(q).toContain('kind=in.(evacuation_center,other)');
    expect(out).toEqual([{ id: 'sentinel:a', source: 'sentinel', name: 'Fairgrounds', kind: 'evacuation_center', address: '1 Main', lng: -121.01, lat: 38.01 }]);
  });

  it('excludes rows with null or blank name and trims names', async () => {
    const restGet = vi.fn().mockResolvedValue([
      { id: 'a', name: 'Fairgrounds', kind: 'evacuation_center', address: '1 Main', lat: 38.01, lng: -121.01 },
      { id: 'b', name: null, kind: 'evacuation_center', address: '2 Oak', lat: 38.02, lng: -121.02 },
      { id: 'c', name: '   ', kind: 'evacuation_center', address: '3 Pine', lat: 38.03, lng: -121.03 },
      { id: 'd', name: '  Gym  ', kind: 'evacuation_center', address: '4 Elm', lat: 38.04, lng: -121.04 },
    ]);
    const now = Date.parse('2026-10-09T12:00:00Z');
    const out = await fetchSentinelShelters({ supabase: { restGet }, origin, radiusKm: 80, now: () => now });
    expect(out.map((x) => x.name)).toEqual(['Fairgrounds', 'Gym']);
  });
});

describe('fetchFemaShelters', () => {
  it('queries open shelters by distance and normalizes them', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      features: [{ attributes: {
        shelter_id: 77, shelter_name: 'HIGH SCHOOL', address: '9 Elm', city: 'Town', state: 'CA', zip: '95000',
        latitude: 38.02, longitude: -121.02, shelter_status: 'OPEN',
      } }],
    })));
    const out = await fetchFemaShelters({ origin, radiusKm: 80, fetchImpl });
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(`${url.origin}${url.pathname}`).toBe(FEMA_OPEN_SHELTERS_URL);
    expect(url.searchParams.get('geometry')).toBe('-121,38');
    expect(url.searchParams.get('distance')).toBe('80');
    expect(url.searchParams.get('units')).toBe('esriSRUnit_Kilometer');
    expect(url.searchParams.get('where')).toBe("upper(shelter_status) = 'OPEN'");
    expect(out).toEqual([{ id: 'fema:77', source: 'fema', name: 'HIGH SCHOOL', kind: 'evacuation_center', address: '9 Elm, Town, CA 95000', lng: -121.02, lat: 38.02 }]);
  });

  it('throws on an ArcGIS error payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 500 } })));
    await expect(fetchFemaShelters({ origin, radiusKm: 80, fetchImpl })).rejects.toThrow(/FEMA/);
  });

  it('excludes rows with null or blank shelter_name and trims names', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      features: [
        { attributes: {
          shelter_id: 77, shelter_name: 'HIGH SCHOOL', address: '9 Elm', city: 'Town', state: 'CA', zip: '95000',
          latitude: 38.02, longitude: -121.02, shelter_status: 'OPEN',
        } },
        { attributes: {
          shelter_id: 78, shelter_name: null, address: '10 Oak', city: 'Town', state: 'CA', zip: '95000',
          latitude: 38.03, longitude: -121.03, shelter_status: 'OPEN',
        } },
        { attributes: {
          shelter_id: 79, shelter_name: '   ', address: '11 Pine', city: 'Town', state: 'CA', zip: '95000',
          latitude: 38.04, longitude: -121.04, shelter_status: 'OPEN',
        } },
        { attributes: {
          shelter_id: 80, shelter_name: '  CHURCH  ', address: '12 Elm', city: 'Town', state: 'CA', zip: '95000',
          latitude: 38.05, longitude: -121.05, shelter_status: 'OPEN',
        } },
      ],
    })));
    const out = await fetchFemaShelters({ origin, radiusKm: 80, fetchImpl });
    expect(out.map((x) => x.name)).toEqual(['HIGH SCHOOL', 'CHURCH']);
  });
});

describe('mergeShelters', () => {
  it('drops a FEMA shelter with the same name within ~100 m of a Sentinel one', () => {
    const merged = mergeShelters(
      [s('sentinel:1', -121.0, 38.0, 'sentinel', 'Lincoln High School')],
      [s('fema:1', -121.0005, 38.0003, 'fema', 'LINCOLN HIGH SCHOOL'), s('fema:2', -121.1, 38.1, 'fema', 'Other')],
    );
    expect(merged.map((x) => x.id)).toEqual(['sentinel:1', 'fema:2']);
  });
  it('keeps same-name shelters that are far apart', () => {
    const merged = mergeShelters([s('sentinel:1', -121, 38, 'sentinel', 'Red Cross')], [s('fema:1', -122, 39, 'fema', 'Red Cross')]);
    expect(merged).toHaveLength(2);
  });
});

describe('nearestByDistance', () => {
  it('returns the n nearest by great-circle distance', () => {
    const list = Array.from({ length: 15 }, (_, i) => s(`x${i}`, -121 + i * 0.01, 38));
    const out = nearestByDistance(origin, list.reverse(), 10);
    expect(out).toHaveLength(10);
    expect(out[0].id).toBe('x0');
  });
});

describe('rankByDriveTime', () => {
  it('sends origin first, ranks by duration, drops unreachable, returns top 5', async () => {
    const cands = Array.from({ length: 7 }, (_, i) => s(`c${i}`, -121 + i * 0.01, 38));
    const durations = [[0, 700, 100, null, 300, 200, 600, 500]];
    const distances = [[0, 7000, 1000, null, 3000, 2000, 6000, 5000]];
    const matrix = vi.fn().mockResolvedValue({ durations, distances });
    const out = await rankByDriveTime(origin, cands, matrix);
    expect(matrix.mock.calls[0][0][0]).toEqual(origin);
    expect(matrix.mock.calls[0][0]).toHaveLength(8);
    expect(out.map((x) => x.id)).toEqual(['c1', 'c4', 'c3', 'c6', 'c5']);
    expect(out[0]).toMatchObject({ durationSec: 100, distanceM: 1000 });
  });
});
