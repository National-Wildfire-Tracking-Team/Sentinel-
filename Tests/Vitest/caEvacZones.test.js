import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCAEvacZones } from '../../src/app/api/caEvacZones';
import { fetchWithCache } from '../../src/app/utils/dataCache';

vi.mock('../../src/app/utils/dataCache');

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('fetchCAEvacZones', () => {
  it('filters the active view using the evacuation update date', async () => {
    fetchWithCache.mockResolvedValue({ type: 'FeatureCollection', features: [] });

    await fetchCAEvacZones();

    const url = new URL(fetchWithCache.mock.calls[0][0]);
    expect(url.searchParams.get('where')).toMatch(/^EDIT_DATE > TIMESTAMP /);
    expect(url.searchParams.get('where')).not.toContain('EditDate');
  });

  it('normalizes active warning and order properties', async () => {
    fetchWithCache.mockResolvedValue({
      type: 'FeatureCollection',
      features: [
        {
          geometry: { type: 'Polygon', coordinates: [] },
          properties: { OBJECTID: 1, ZONE_NAME: 'Zone A', STATUS: 'Evacuation Order', COUNTY: 'Test' },
        },
      ],
    });

    const result = await fetchCAEvacZones();

    expect(result.features[0].properties).toMatchObject({
      id: 1,
      zoneName: 'Zone A',
      warningType: 'Evacuation Order',
      county: 'Test',
    });
  });
});